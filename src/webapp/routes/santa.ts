import { Router, Response } from 'express';
import { AuthRequest } from '../types/express';
import { Database } from '../../database/Database';
import { SantaService } from '../../services/SantaService';
import { UserService } from '../../services/UserService';
import { GroupService } from '../../services/GroupService';
import { NotificationService } from '../../services/NotificationService';
import { SantaEvent } from '../../models/SantaEvent';
import { verifyTelegramInitData } from '../middleware/telegramAuth';
import { requireUser, currentUser } from '../middleware/requireUser';
import { GroupAccessChecker } from '../access';
import { serializeSantaEvent, serializeSantaParticipant, serializeSantaAssignment } from '../serializers';
import { parseSantaEventBody, parseWishlist } from '../santaBodyValidator';
import { ConflictError, ValidationError } from '../../utils/errors';

export function createSantaRouter(
  db: Database,
  notifications: NotificationService,
  canAccessGroup: GroupAccessChecker,
): Router {
  const router = Router();
  const santaService = new SantaService(db);
  const userService = new UserService(db);
  const groupService = new GroupService(db);

  router.use(verifyTelegramInitData, requireUser(userService));

  function parseId(value: unknown): number | null {
    const id = Number(value);
    return Number.isInteger(id) && id >= 1 ? id : null;
  }

  /** Maps a thrown error to the response: 400 / 409 echo the message, anything else is logged and generic. */
  function fail(res: Response, error: unknown, label: string): void {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
    } else if (error instanceof ConflictError) {
      res.status(409).json({ error: error.message });
    } else {
      console.error(`Santa: ${label}:`, error);
      res.status(500).json({ error: 'Internal error' });
    }
  }

  /**
   * Loads the event from :id and checks access ('member' = can read the group, 'admin' = group admin).
   * Sends the error response and returns null when the request must stop.
   */
  async function loadEvent(req: AuthRequest, res: Response, access: 'member' | 'admin'): Promise<SantaEvent | null> {
    const eventId = parseId(req.params.id);
    if (!eventId) { res.status(400).json({ error: 'Invalid event id' }); return null; }

    const event = await santaService.getEvent(eventId);
    if (!event) { res.status(404).json({ error: 'Event not found' }); return null; }

    const user = currentUser(req);
    if (access === 'admin') {
      if (!(await groupService.isUserAdmin(user.id, event.group_id))) {
        res.status(403).json({ error: 'Admin only' });
        return null;
      }
    } else if (!(await canAccessGroup(user, event.group_id))) {
      res.status(403).json({ error: 'Forbidden' });
      return null;
    }
    return event;
  }

  // GET /api/santa?group_id=X — events of the group with the caller's join state
  router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
    const groupId = parseId(req.query.group_id);
    if (!groupId) { res.status(400).json({ error: 'group_id is required' }); return; }
    try {
      const user = currentUser(req);
      if (!(await canAccessGroup(user, groupId))) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const items = await santaService.listGroupEvents(groupId, user.id);
      res.json(items.map(({ event, participantsCount, joined }) => ({
        id: event.id,
        title: event.title,
        budget: event.budget ?? null,
        exchange_date: event.exchange_date ?? null,
        status: event.status,
        participants_count: participantsCount,
        joined,
      })));
    } catch (error) {
      fail(res, error, 'list events');
    }
  });

  // POST /api/santa — create an event (group admin)
  router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const groupId = parseId(req.body?.group_id);
      if (!groupId) { res.status(400).json({ error: 'Invalid group_id' }); return; }

      const user = currentUser(req);
      if (!(await groupService.isUserAdmin(user.id, groupId))) {
        res.status(403).json({ error: 'Admin only' });
        return;
      }

      const event = await santaService.createEvent(groupId, user.id, parseSantaEventBody(req.body));
      await notifications.notifySantaCreated(event);
      res.status(201).json(serializeSantaEvent(event));
    } catch (error) {
      fail(res, error, 'create event');
    }
  });

  // GET /api/santa/:id — event, participants (names only), the caller's own state and own recipient
  router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'member');
      if (!event) return;

      const user = currentUser(req);
      const [participants, assignment, isAdmin] = await Promise.all([
        santaService.getParticipants(event.id),
        santaService.getMyAssignment(event.id, user.id),
        groupService.isUserAdmin(user.id, event.group_id),
      ]);
      const mine = participants.find((p) => p.user_id === user.id);

      res.json({
        event: serializeSantaEvent(event),
        participants: participants.map(serializeSantaParticipant),
        me: { joined: !!mine, wishlist: mine?.wishlist ?? null },
        assignment: assignment ? serializeSantaAssignment(assignment) : null,
        isAdmin,
      });
    } catch (error) {
      fail(res, error, 'get event');
    }
  });

  // POST /api/santa/:id/join
  router.post('/:id/join', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'member');
      if (!event) return;

      await santaService.join(event.id, currentUser(req).id, parseWishlist(req.body?.wishlist));
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'join');
    }
  });

  // DELETE /api/santa/:id/join — leave
  router.delete('/:id/join', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'member');
      if (!event) return;

      await santaService.leave(event.id, currentUser(req).id);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'leave');
    }
  });

  // PUT /api/santa/:id/wishlist
  router.put('/:id/wishlist', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'member');
      if (!event) return;

      const user = currentUser(req);
      const wishlist = parseWishlist(req.body?.wishlist);
      const { santa } = await santaService.updateWishlist(event.id, user.id, wishlist);
      if (santa) await notifications.notifySantaWishlistChanged(event, santa, user, wishlist);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'update wishlist');
    }
  });

  // POST /api/santa/:id/draw (admin)
  router.post('/:id/draw', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'admin');
      if (!event) return;

      const assignments = await santaService.draw(event.id);
      await notifications.notifySantaDrawn(event, assignments);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'draw');
    }
  });

  // POST /api/santa/:id/reset (admin)
  router.post('/:id/reset', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'admin');
      if (!event) return;

      await santaService.resetDraw(event.id);
      await notifications.notifySantaReset(event);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'reset draw');
    }
  });

  // POST /api/santa/:id/finish (admin)
  router.post('/:id/finish', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'admin');
      if (!event) return;

      await santaService.finish(event.id);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'finish');
    }
  });

  // DELETE /api/santa/:id (admin)
  router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'admin');
      if (!event) return;

      await santaService.deleteEvent(event.id);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'delete event');
    }
  });

  // DELETE /api/santa/:id/participants/:userId (admin, registration only)
  router.delete('/:id/participants/:userId', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'admin');
      if (!event) return;

      const targetUserId = parseId(req.params.userId);
      if (!targetUserId) { res.status(400).json({ error: 'Invalid user id' }); return; }

      await santaService.removeParticipant(event.id, targetUserId);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'remove participant');
    }
  });

  return router;
}
