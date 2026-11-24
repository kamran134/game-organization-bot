import { Router, Response } from 'express';
import { AuthRequest } from '../types/express';
import { Database } from '../../database/Database';
import { MafiaService } from '../../services/MafiaService';
import { UserService } from '../../services/UserService';
import { GroupService } from '../../services/GroupService';
import { NotificationService } from '../../services/NotificationService';
import { MafiaEvent } from '../../models/MafiaEvent';
import { verifyTelegramInitData } from '../middleware/telegramAuth';
import { requireUser, currentUser } from '../middleware/requireUser';
import { GroupAccessChecker } from '../access';
import {
  serializeMafiaEvent,
  serializeMafiaParticipant,
  serializeMafiaCard,
  serializeMafiaLayoutRow,
  serializeMafiaLog,
  serializeSantaPerson,
} from '../serializers';
import { parseMafiaEventBody, parseMafiaLogBody, parseRoleCountsBody } from '../mafiaBodyValidator';
import { ConflictError, ValidationError } from '../../utils/errors';
import { suggestRoleCounts } from '../../utils/mafiaDeal';
import { refreshMafiaCard } from '../../services/mafiaCard';

export function createMafiaRouter(
  db: Database,
  notifications: NotificationService,
  canAccessGroup: GroupAccessChecker,
): Router {
  const router = Router();
  const mafiaService = new MafiaService(db);
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
      console.error(`Mafia: ${label}:`, error);
      res.status(500).json({ error: 'Internal error' });
    }
  }

  /**
   * Loads the event from :id and checks access: 'member' = can read the group, 'manager' = host or
   * group admin, 'host' = the host only. Sends the error response and returns null when the request must stop.
   */
  async function loadEvent(
    req: AuthRequest,
    res: Response,
    access: 'member' | 'manager' | 'host',
  ): Promise<MafiaEvent | null> {
    const eventId = parseId(req.params.id);
    if (!eventId) { res.status(400).json({ error: 'Invalid event id' }); return null; }

    const event = await mafiaService.getEvent(eventId);
    if (!event) { res.status(404).json({ error: 'Event not found' }); return null; }

    const user = currentUser(req);
    if (!(await canAccessGroup(user, event.group_id))) {
      res.status(403).json({ error: 'Forbidden' });
      return null;
    }
    if (access === 'host' && event.host_id !== user.id) {
      res.status(403).json({ error: 'Host only' });
      return null;
    }
    if (access === 'manager' && event.host_id !== user.id && !(await groupService.isUserAdmin(user.id, event.group_id))) {
      res.status(403).json({ error: 'Host or admin only' });
      return null;
    }
    return event;
  }

  // GET /api/mafia?group_id=X — evenings of the group with the caller's join state
  router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
    const groupId = parseId(req.query.group_id);
    if (!groupId) { res.status(400).json({ error: 'group_id is required' }); return; }
    try {
      const user = currentUser(req);
      if (!(await canAccessGroup(user, groupId))) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const items = await mafiaService.listGroupEvents(groupId, user.id);
      res.json(items.map(({ event, participantsCount, joined, isHost }) => ({
        id: event.id,
        title: event.title,
        starts_at: event.starts_at ?? null,
        place: event.place ?? null,
        status: event.status,
        round: event.round,
        max_players: event.max_players,
        host: event.host ? serializeSantaPerson(event.host) : null,
        participants_count: participantsCount,
        joined,
        isHost,
      })));
    } catch (error) {
      fail(res, error, 'list events');
    }
  });

  // POST /api/mafia — create an evening (any group member; the creator becomes the host)
  router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const groupId = parseId(req.body?.group_id);
      if (!groupId) { res.status(400).json({ error: 'Invalid group_id' }); return; }

      const user = currentUser(req);
      if (!(await canAccessGroup(user, groupId))) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const event = await mafiaService.createEvent(groupId, user.id, parseMafiaEventBody(req.body));
      const posted = await notifications.postMafiaCard(event, []);
      if (posted) await mafiaService.setCardMessage(event.id, posted.chatId, posted.messageId);
      res.status(201).json(serializeMafiaEvent(event));
    } catch (error) {
      fail(res, error, 'create event');
    }
  });

  // GET /api/mafia/:id — event, participants (names and seats only), the caller's own card
  router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'member');
      if (!event) return;

      const user = currentUser(req);
      const isHost = event.host_id === user.id;
      const [participants, myCard, isAdmin] = await Promise.all([
        mafiaService.getParticipants(event.id),
        mafiaService.getMyCard(event.id, user.id),
        groupService.isUserAdmin(user.id, event.group_id),
      ]);
      const canManage = isHost || isAdmin;

      res.json({
        event: serializeMafiaEvent(event),
        participants: participants.map(serializeMafiaParticipant),
        joined: participants.some((p) => p.user_id === user.id),
        isHost,
        canManage,
        myCard: myCard ? serializeMafiaCard(myCard) : null,
        // The deck composition is a secret of the people who run the evening
        suggestedCounts: canManage ? suggestRoleCounts(participants.length) : null,
        rolesConfig: canManage ? (event.roles_config ?? null) : null,
      });
    } catch (error) {
      fail(res, error, 'get event');
    }
  });

  // GET /api/mafia/:id/layout — who plays which role (the host only: admins may be playing)
  router.get('/:id/layout', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'host');
      if (!event) return;

      const rows = await mafiaService.getLayout(event.id);
      res.json({ round: event.round, players: rows.map(serializeMafiaLayoutRow) });
    } catch (error) {
      fail(res, error, 'get layout');
    }
  });

  // GET /api/mafia/:id/log — the host's game log with the derived alive / dead state (carries roles)
  router.get('/:id/log', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'host');
      if (!event) return;

      res.json(serializeMafiaLog(await mafiaService.getLog(event.id)));
    } catch (error) {
      fail(res, error, 'get log');
    }
  });

  // POST /api/mafia/:id/log — add a line; answers with the fresh log
  router.post('/:id/log', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'host');
      if (!event) return;

      await mafiaService.addLogEntry(event.id, parseMafiaLogBody(req.body));
      res.status(201).json(serializeMafiaLog(await mafiaService.getLog(event.id)));
    } catch (error) {
      fail(res, error, 'add log entry');
    }
  });

  // DELETE /api/mafia/:id/log/:entryId — answers with the fresh log
  router.delete('/:id/log/:entryId', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'host');
      if (!event) return;

      const entryId = parseId(req.params.entryId);
      if (!entryId) { res.status(400).json({ error: 'Invalid entry id' }); return; }

      await mafiaService.deleteLogEntry(event.id, entryId);
      res.json(serializeMafiaLog(await mafiaService.getLog(event.id)));
    } catch (error) {
      fail(res, error, 'delete log entry');
    }
  });

  // POST /api/mafia/:id/join
  router.post('/:id/join', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'member');
      if (!event) return;

      const user = currentUser(req);
      await mafiaService.join(event.id, user.id);
      await refreshMafiaCard(mafiaService, notifications, event.id);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'join');
    }
  });

  // DELETE /api/mafia/:id/join — leave
  router.delete('/:id/join', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'member');
      if (!event) return;

      const user = currentUser(req);
      await mafiaService.leave(event.id, user.id);
      await refreshMafiaCard(mafiaService, notifications, event.id);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'leave');
    }
  });

  // DELETE /api/mafia/:id/participants/:userId (host or admin, registration only)
  router.delete('/:id/participants/:userId', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'manager');
      if (!event) return;

      const targetUserId = parseId(req.params.userId);
      if (!targetUserId) { res.status(400).json({ error: 'Invalid user id' }); return; }

      await mafiaService.removeParticipant(event.id, targetUserId);
      await refreshMafiaCard(mafiaService, notifications, event.id);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'remove participant');
    }
  });

  // POST /api/mafia/:id/deal (host or admin) — also re-deals: the next game of the evening
  router.post('/:id/deal', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'manager');
      if (!event) return;

      const counts = parseRoleCountsBody(req.body);
      const result = await mafiaService.deal(event.id, counts);
      await notifications.notifyMafiaDealt(event, result.round, result.players);
      await refreshMafiaCard(mafiaService, notifications, event.id);
      res.json({ ok: true, round: result.round });
    } catch (error) {
      fail(res, error, 'deal');
    }
  });

  // POST /api/mafia/:id/close (host or admin) — stop registration early
  router.post('/:id/close', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'manager');
      if (!event) return;

      await mafiaService.closeRegistration(event.id);
      await refreshMafiaCard(mafiaService, notifications, event.id);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'close registration');
    }
  });

  // POST /api/mafia/:id/reopen (host or admin)
  router.post('/:id/reopen', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'manager');
      if (!event) return;

      await mafiaService.reopen(event.id);
      await refreshMafiaCard(mafiaService, notifications, event.id);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'reopen');
    }
  });

  // POST /api/mafia/:id/finish (host or admin)
  router.post('/:id/finish', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'manager');
      if (!event) return;

      await mafiaService.finish(event.id);
      await notifications.notifyMafiaFinished(event);
      await refreshMafiaCard(mafiaService, notifications, event.id);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'finish');
    }
  });

  // DELETE /api/mafia/:id (host or admin)
  router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'manager');
      if (!event) return;

      await mafiaService.deleteEvent(event.id);
      await notifications.removeMafiaCard(event);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'delete event');
    }
  });

  return router;
}
