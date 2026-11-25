import { Router, Response } from 'express';
import { AuthRequest } from '../types/express';
import { Database } from '../../database/Database';
import { SpyService } from '../../services/SpyService';
import { UserService } from '../../services/UserService';
import { GroupService } from '../../services/GroupService';
import { NotificationService } from '../../services/NotificationService';
import { SpyEvent } from '../../models/SpyEvent';
import { SpyRoundPlayer } from '../../models/SpyRoundPlayer';
import { SpyRoundStatus } from '../../models/SpyRound';
import { SpyLocation } from '../../models/SpyLocation';
import { User } from '../../models/User';
import { verifyTelegramInitData } from '../middleware/telegramAuth';
import { requireUser, currentUser } from '../middleware/requireUser';
import { GroupAccessChecker } from '../access';
import {
  serializeSpyEvent,
  serializeSpyParticipant,
  serializeSpyRound,
  serializeSpyCard,
  serializeSpyVotingState,
  serializeSpyStats,
  serializeSpyLocation,
  serializeSpyLayoutRow,
  serializeSantaPerson,
} from '../serializers';
import {
  parseSpyEventBody,
  parseSpySettingsBody,
  parseSpyVoteBody,
  parseSpyGuessBody,
  parseSpyLocationBody,
  parseSpyEliminateBody,
  parseSpyParticipantActiveBody,
  parseSpyNextBody,
} from '../spyBodyValidator';
import { ConflictError, ValidationError } from '../../utils/errors';
import { SPY_MIN_PLAYERS, SPY_MAX_PLAYERS, suggestSpyCount } from '../../utils/spyDeal';
import {
  SPY_PACKS,
  SPY_TURN_SECONDS_MIN,
  SPY_TURN_SECONDS_MAX,
  SPY_HINT_CYCLES_MIN,
  SPY_HINT_CYCLES_MAX,
} from '../../utils/spyRound';
import { refreshSpyCard } from '../../services/spyCard';

export function createSpyRouter(
  db: Database,
  notifications: NotificationService,
  canAccessGroup: GroupAccessChecker,
): Router {
  const router = Router();
  const spyService = new SpyService(db);
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
      console.error(`Spy: ${label}:`, error);
      res.status(500).json({ error: 'Internal error' });
    }
  }

  async function isManager(event: SpyEvent, user: User): Promise<boolean> {
    return event.host_id === user.id || groupService.isUserAdmin(user.id, event.group_id);
  }

  /**
   * Loads the event from :id and checks access: 'member' = can read the group, 'manager' = host or
   * group admin. Sends the error response and returns null when the request must stop.
   */
  async function loadEvent(req: AuthRequest, res: Response, access: 'member' | 'manager'): Promise<SpyEvent | null> {
    const eventId = parseId(req.params.id);
    if (!eventId) { res.status(400).json({ error: 'Invalid event id' }); return null; }

    const event = await spyService.getEvent(eventId);
    if (!event) { res.status(404).json({ error: 'Event not found' }); return null; }

    const user = currentUser(req);
    if (!(await canAccessGroup(user, event.group_id))) {
      res.status(403).json({ error: 'Forbidden' });
      return null;
    }
    if (access === 'manager' && !(await isManager(event, user))) {
      res.status(403).json({ error: 'Host or admin only' });
      return null;
    }
    return event;
  }

  /** Users of the evening's roster by id: the notifications need real users, the service hands out ids. */
  async function rosterUsers(eventId: number): Promise<Map<number, User>> {
    const participants = await spyService.getParticipants(eventId);
    return new Map(participants.map((p) => [p.user_id, p.user]));
  }

  // ---- Group-level routes: registered before '/:id' so that 'meta', 'stats' and 'locations' are not read as ids ----

  // GET /api/spy/meta — packs and form limits for the create form, which runs before any event exists
  router.get('/meta', (_req: AuthRequest, res: Response): void => {
    res.json({
      packs: SPY_PACKS,
      limits: {
        min_players: SPY_MIN_PLAYERS,
        max_players: SPY_MAX_PLAYERS,
        turn_seconds: { min: SPY_TURN_SECONDS_MIN, max: SPY_TURN_SECONDS_MAX },
        hint_cycles: { min: SPY_HINT_CYCLES_MIN, max: SPY_HINT_CYCLES_MAX },
      },
    });
  });

  // GET /api/spy/stats?group_id=X
  router.get('/stats', async (req: AuthRequest, res: Response): Promise<void> => {
    const groupId = parseId(req.query.group_id);
    if (!groupId) { res.status(400).json({ error: 'group_id is required' }); return; }
    try {
      if (!(await canAccessGroup(currentUser(req), groupId))) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      res.json((await spyService.getGroupStats(groupId)).map(serializeSpyStats));
    } catch (error) {
      fail(res, error, 'stats');
    }
  });

  // GET /api/spy/locations?group_id=X — global locations of every pack plus the group's own
  router.get('/locations', async (req: AuthRequest, res: Response): Promise<void> => {
    const groupId = parseId(req.query.group_id);
    if (!groupId) { res.status(400).json({ error: 'group_id is required' }); return; }
    try {
      if (!(await canAccessGroup(currentUser(req), groupId))) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      res.json((await spyService.listLocations(groupId)).map(serializeSpyLocation));
    } catch (error) {
      fail(res, error, 'list locations');
    }
  });

  // POST /api/spy/locations — add a location to the group (group admin only)
  router.post('/locations', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { group_id: groupId, name } = parseSpyLocationBody(req.body);
      if (!(await groupService.isUserAdmin(currentUser(req).id, groupId))) {
        res.status(403).json({ error: 'Only group admins can manage locations' });
        return;
      }
      res.status(201).json(serializeSpyLocation(await spyService.addGroupLocation(groupId, name)));
    } catch (error) {
      fail(res, error, 'add location');
    }
  });

  // DELETE /api/spy/locations/:id — only the group's own locations, by a group admin
  router.delete('/locations/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const locationId = parseId(req.params.id);
      if (!locationId) { res.status(400).json({ error: 'Invalid location id' }); return; }

      const location = await db.getRepository(SpyLocation).findOne({ where: { id: locationId } });
      if (!location) { res.status(404).json({ error: 'Location not found' }); return; }
      // Global locations belong to nobody's group: nobody may delete them from here
      if (location.group_id == null) { res.status(403).json({ error: 'Global locations cannot be changed' }); return; }

      if (!(await groupService.isUserAdmin(currentUser(req).id, location.group_id))) {
        res.status(403).json({ error: 'Only group admins can manage locations' });
        return;
      }
      await spyService.deleteGroupLocation(location.group_id, location.id);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'delete location');
    }
  });

  // ---- Evenings ----

  // GET /api/spy?group_id=X — evenings of the group with the caller's join state
  router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
    const groupId = parseId(req.query.group_id);
    if (!groupId) { res.status(400).json({ error: 'group_id is required' }); return; }
    try {
      const user = currentUser(req);
      if (!(await canAccessGroup(user, groupId))) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const items = await spyService.listGroupEvents(groupId, user.id);
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

  // POST /api/spy — create an evening (any group member; the creator becomes the host)
  router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const groupId = parseId(req.body?.group_id);
      if (!groupId) { res.status(400).json({ error: 'Invalid group_id' }); return; }

      const user = currentUser(req);
      if (!(await canAccessGroup(user, groupId))) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const event = await spyService.createEvent(groupId, user.id, parseSpyEventBody(req.body));
      const posted = await notifications.postSpyCard(event, []);
      if (posted) await spyService.setCardMessage(event.id, posted.chatId, posted.messageId);
      res.status(201).json(serializeSpyEvent(event));
    } catch (error) {
      fail(res, error, 'create event');
    }
  });

  // GET /api/spy/:id — event, roster, the caller's own card, the running round WITHOUT secrets
  router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'member');
      if (!event) return;

      const user = currentUser(req);
      const isHost = event.host_id === user.id;
      const [participants, myCard, roundView, votingState, isAdmin] = await Promise.all([
        spyService.getParticipants(event.id),
        spyService.getMyCard(event.id, user.id),
        spyService.getRoundView(event.id),
        spyService.getVotingState(event.id),
        groupService.isUserAdmin(user.id, event.group_id),
      ]);
      const activeCount = participants.filter((p) => p.is_active !== false).length;

      res.json({
        event: serializeSpyEvent(event),
        participants: participants.map(serializeSpyParticipant),
        joined: participants.some((p) => p.user_id === user.id),
        me: { userId: user.id },
        isHost,
        canManage: isHost || isAdmin,
        myCard: myCard ? serializeSpyCard(myCard) : null,
        round: roundView ? serializeSpyRound(roundView, event.turn_seconds ?? null) : null,
        votingState: votingState ? serializeSpyVotingState(votingState) : null,
        suggestedSpyCount: suggestSpyCount(Math.max(activeCount, SPY_MIN_PLAYERS)),
        packs: SPY_PACKS,
      });
    } catch (error) {
      fail(res, error, 'get event');
    }
  });

  // PATCH /api/spy/:id — settings, before a round starts (host or admin)
  router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'manager');
      if (!event) return;

      const updated = await spyService.updateSettings(event.id, parseSpySettingsBody(req.body));
      await refreshSpyCard(spyService, notifications, event.id);
      res.json(serializeSpyEvent(updated));
    } catch (error) {
      fail(res, error, 'update settings');
    }
  });

  // GET /api/spy/:id/layout — every role; the service refuses a player of the unfinished round
  router.get('/:id/layout', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'member');
      if (!event) return;

      const rows = await spyService.getLayout(event.id, currentUser(req).id);
      const round = await spyService.getCurrentRound(event.id);
      res.json({
        round: round?.number ?? null,
        location_name: round?.location_name ?? null,
        players: rows.map(serializeSpyLayoutRow),
      });
    } catch (error) {
      fail(res, error, 'get layout');
    }
  });

  // POST /api/spy/:id/join
  router.post('/:id/join', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'member');
      if (!event) return;

      await spyService.join(event.id, currentUser(req).id);
      await refreshSpyCard(spyService, notifications, event.id);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'join');
    }
  });

  // DELETE /api/spy/:id/join — leave
  router.delete('/:id/join', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'member');
      if (!event) return;

      await spyService.leave(event.id, currentUser(req).id);
      await refreshSpyCard(spyService, notifications, event.id);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'leave');
    }
  });

  // DELETE /api/spy/:id/participants/:userId (host or admin)
  router.delete('/:id/participants/:userId', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'manager');
      if (!event) return;

      const targetUserId = parseId(req.params.userId);
      if (!targetUserId) { res.status(400).json({ error: 'Invalid user id' }); return; }

      await spyService.removeParticipant(event.id, targetUserId);
      await refreshSpyCard(spyService, notifications, event.id);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'remove participant');
    }
  });

  // PATCH /api/spy/:id/participants/:userId — { is_active }; the participant themselves or a manager
  router.patch('/:id/participants/:userId', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'member');
      if (!event) return;

      const targetUserId = parseId(req.params.userId);
      if (!targetUserId) { res.status(400).json({ error: 'Invalid user id' }); return; }

      const user = currentUser(req);
      if (targetUserId !== user.id && !(await isManager(event, user))) {
        res.status(403).json({ error: 'Host or admin only' });
        return;
      }

      const { is_active } = parseSpyParticipantActiveBody(req.body);
      await spyService.setParticipantActive(event.id, targetUserId, is_active);
      await refreshSpyCard(spyService, notifications, event.id);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'set participant active');
    }
  });

  // POST /api/spy/:id/close (host or admin) — stop registration early
  router.post('/:id/close', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'manager');
      if (!event) return;

      await spyService.closeRegistration(event.id);
      await refreshSpyCard(spyService, notifications, event.id);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'close registration');
    }
  });

  // POST /api/spy/:id/reopen (host or admin)
  router.post('/:id/reopen', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'manager');
      if (!event) return;

      await spyService.reopen(event.id);
      await refreshSpyCard(spyService, notifications, event.id);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'reopen');
    }
  });

  // POST /api/spy/:id/finish (host or admin)
  router.post('/:id/finish', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'manager');
      if (!event) return;

      await spyService.finish(event.id);
      await refreshSpyCard(spyService, notifications, event.id);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'finish');
    }
  });

  // DELETE /api/spy/:id (host or admin)
  router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'manager');
      if (!event) return;

      await spyService.deleteEvent(event.id);
      await notifications.removeSpyCard(event);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'delete event');
    }
  });

  // ---- Rounds ----

  // POST /api/spy/:id/rounds (host or admin) — deals the next round; the answer carries no roles
  router.post('/:id/rounds', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'manager');
      if (!event) return;

      const { round, players } = await spyService.startRound(event.id);
      const users = await rosterUsers(event.id);
      await notifications.notifySpyRoundStarted(
        event,
        round,
        players.flatMap((p) => {
          const player = users.get(p.user_id);
          return player ? [{ user: player, role: p.role }] : [];
        }),
      );
      await refreshSpyCard(spyService, notifications, event.id);
      res.json({ ok: true, round: round.number });
    } catch (error) {
      fail(res, error, 'start round');
    }
  });

  // POST /api/spy/:id/rounds/current/next — the current player, or a manager with `force`
  router.post('/:id/rounds/current/next', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'member');
      if (!event) return;

      const user = currentUser(req);
      const { force } = parseSpyNextBody(req.body);
      if (force && !(await isManager(event, user))) {
        res.status(403).json({ error: 'Host or admin only' });
        return;
      }

      const turn = await spyService.nextTurn(event.id, user.id, { force });
      const next = (await rosterUsers(event.id)).get(turn.currentUserId);
      if (next) await notifications.notifySpyTurn(event, next, turn.cycle, turn.deadline);
      await refreshSpyCard(spyService, notifications, event.id);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'next turn');
    }
  });

  // POST /api/spy/:id/rounds/current/voting (host or admin)
  router.post('/:id/rounds/current/voting', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'manager');
      if (!event) return;

      await spyService.openVoting(event.id);
      await refreshSpyCard(spyService, notifications, event.id);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'open voting');
    }
  });

  // POST /api/spy/:id/rounds/current/vote — { target_id }; the service lets only a living player of the round vote
  router.post('/:id/rounds/current/vote', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'member');
      if (!event) return;

      const { target_id } = parseSpyVoteBody(req.body);
      const outcome = await spyService.castVote(event.id, currentUser(req).id, target_id);

      if (outcome.state === 'tie') {
        const users = await rosterUsers(event.id);
        const leaders = outcome.leaders.flatMap((id) => (users.has(id) ? [users.get(id)!] : []));
        await notifications.notifySpyVoteTie(event, leaders, outcome.nextBallot);
      } else if (outcome.state === 'resolved') {
        await notifications.notifySpyRoundFinished(event, { round: outcome.round, players: outcome.players });
      }
      await refreshSpyCard(spyService, notifications, event.id);

      // Only a finished round may carry the reveal
      if (outcome.state === 'resolved') {
        res.json({ state: 'resolved', round: serializeSpyRound({ round: outcome.round, players: outcome.players }, event.turn_seconds ?? null) });
      } else {
        res.json({ state: outcome.state });
      }
    } catch (error) {
      fail(res, error, 'vote');
    }
  });

  // POST /api/spy/:id/rounds/current/guess — { guess }; a living spy of the round only (the service checks)
  router.post('/:id/rounds/current/guess', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'member');
      if (!event) return;

      const { guess } = parseSpyGuessBody(req.body);
      const outcome = await spyService.guess(event.id, currentUser(req).id, guess);
      if (outcome.result === 'close') {
        res.json({ result: 'close' });
        return;
      }

      await notifications.notifySpyRoundFinished(event, { round: outcome.round, players: outcome.players });
      await refreshSpyCard(spyService, notifications, event.id);
      res.json({
        result: outcome.result,
        round: serializeSpyRound({ round: outcome.round, players: outcome.players }, event.turn_seconds ?? null),
      });
    } catch (error) {
      fail(res, error, 'guess');
    }
  });

  // POST /api/spy/:id/rounds/current/eliminate — { user_id, eliminated } (host or admin)
  router.post('/:id/rounds/current/eliminate', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'manager');
      if (!event) return;

      const { user_id, eliminated } = parseSpyEliminateBody(req.body);
      const result = await spyService.eliminate(event.id, user_id, eliminated);
      if (result.finished) {
        await notifications.notifySpyRoundFinished(event, { round: result.round, players: result.players });
      }
      await refreshSpyCard(spyService, notifications, event.id);
      res.json({ ok: true, finished: result.finished });
    } catch (error) {
      fail(res, error, 'eliminate');
    }
  });

  // POST /api/spy/:id/rounds/current/abort (host or admin)
  router.post('/:id/rounds/current/abort', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'manager');
      if (!event) return;

      const result = await spyService.abortRound(event.id);
      await notifications.notifySpyRoundFinished(event, result);
      await refreshSpyCard(spyService, notifications, event.id);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'abort round');
    }
  });

  // GET /api/spy/:id/rounds/:number — the reveal of a FINISHED round; an unfinished one is a 409 without any data
  router.get('/:id/rounds/:number', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const event = await loadEvent(req, res, 'member');
      if (!event) return;

      const number = parseId(req.params.number);
      if (!number) { res.status(400).json({ error: 'Invalid round number' }); return; }

      const round = await spyService.getRound(event.id, number);
      if (!round) { res.status(404).json({ error: 'Round not found' }); return; }
      if (round.status !== SpyRoundStatus.FINISHED) {
        res.status(409).json({ error: 'Round is not finished' });
        return;
      }

      const players = await db.getRepository(SpyRoundPlayer).find({
        where: { round_id: round.id },
        relations: ['user'],
        order: { id: 'ASC' },
      });
      res.json(serializeSpyRound({ round, players }, event.turn_seconds ?? null));
    } catch (error) {
      fail(res, error, 'get round');
    }
  });

  return router;
}
