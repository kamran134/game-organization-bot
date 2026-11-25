import { EntityManager, In, IsNull, Not } from 'typeorm';
import { Database } from '../database/Database';
import { SpyEvent, SpyStatus } from '../models/SpyEvent';
import { SpyParticipant } from '../models/SpyParticipant';
import { SpyRound, SpyRoundStatus, SpyOutcome, SpyOutcomeReason } from '../models/SpyRound';
import { SpyRoundPlayer } from '../models/SpyRoundPlayer';
import { SpyVote } from '../models/SpyVote';
import { SpyRole } from '../models/SpyRole';
import { SpyLocation } from '../models/SpyLocation';
import { ConflictError, ValidationError } from '../utils/errors';
import { SPY_MAX_PLAYERS, SPY_MIN_PLAYERS, SPY_ROLE_TEAM, dealRoles, shuffleOrder, validateSpyCount } from '../utils/spyDeal';
import { SPY_PACKS, advanceTurn, shouldHint, turnDeadline } from '../utils/spyRound';
import { SpyBallot, SpyTally, SpyVoteResolution, resolveVote, tallyVotes } from '../utils/spyVote';
import { classifyGuess, GuessResult } from '../utils/spyGuess';

const TITLE_MAX = 100;
const PLACE_MAX = 200;
const LOCATION_NAME_MAX = 100;
const TURN_SECONDS_MIN = 15;
const TURN_SECONDS_MAX = 300;
const HINT_CYCLES_MIN = 1;
const HINT_CYCLES_MAX = 10;
const CUSTOM_PACK = 'custom';
const DEFAULT_MAX_PLAYERS = 10;
const DEFAULT_PACKS = ['base'];

export interface SpyEventInput {
  title: string;
  description?: string | null;
  starts_at?: Date | null;
  place?: string | null;
  max_players?: number;
  /** null = automatic (see suggestSpyCount). */
  spy_count?: number | null;
  double_agent?: boolean;
  mr_white?: boolean;
  packs?: string[];
  /** null = no turn timer. */
  turn_seconds?: number | null;
  /** null = the spy never gets a hint. */
  hint_after_cycles?: number | null;
}

/** A partial update: absent keys stay as they are, `null` clears the nullable ones. */
export type SpySettingsInput = Partial<SpyEventInput>;

export interface SpyEventListItem {
  event: SpyEvent;
  participantsCount: number;
  joined: boolean;
  isHost: boolean;
}

/** What a player may see about the running round; the location is null for a spy and Mr. White. */
export interface SpyCard {
  round: number;
  role: SpyRole;
  location: string | null;
  hint: string | null;
  cycle: number;
  currentUserId: number | null;
  isMyTurn: boolean;
  deadline: Date | null;
}

export interface SpyTurnState {
  roundId: number;
  previousUserId: number | null;
  currentUserId: number;
  cycle: number;
  deadline: Date | null;
}

export interface SpyTurnTimeout {
  eventId: number;
  roundId: number;
  previousUserId: number | null;
  currentUserId: number;
}

export type SpyVoteOutcome =
  | { state: 'pending'; round: SpyRound; ballot: number; tally: SpyTally }
  | { state: 'tie'; round: SpyRound; ballot: number; nextBallot: number; tally: SpyTally; leaders: number[] }
  | {
      state: 'resolved';
      round: SpyRound;
      ballot: number;
      tally: SpyTally;
      resolution: Exclude<SpyVoteResolution, 'tie'>;
      /** The full layout of roles, revealed. */
      players: SpyRoundPlayer[];
    };

export type SpyGuessOutcome =
  | { result: 'close' }
  | { result: Exclude<GuessResult, 'close'>; round: SpyRound; players: SpyRoundPlayer[] };

export interface SpyRoundResult {
  round: SpyRound;
  players: SpyRoundPlayer[];
}

export interface SpyEliminateResult {
  /** True when the leaver ended the round. */
  finished: boolean;
  round: SpyRound;
  players: SpyRoundPlayer[];
}

/** A player of the running round as the public card sees it: the role stays null until the round is finished. */
export interface SpyRoundViewPlayer {
  user_id: number;
  user: SpyRoundPlayer['user'];
  is_eliminated: boolean;
  role: SpyRole | null;
}

export interface SpyRoundView {
  round: SpyRound;
  players: SpyRoundViewPlayer[];
}

/** The ballot in progress. Who voted is public, whom they voted for is not (and is never returned). */
export interface SpyVotingState {
  roundId: number;
  ballot: number;
  voterIds: number[];
  counts: SpyTally['counts'];
  leaders: number[];
  /** Only for a repeated ballot: the leaders of the previous one, the only allowed targets. */
  candidateIds?: number[];
}

export interface SpyPlayerStats {
  user_id: number;
  user?: SpyRoundPlayer['user'];
  rounds: number;
  wins: number;
  spy_rounds: number;
  spy_wins: number;
  exposed: number;
  guessed: number;
  win_rate: number;
}

export class SpyService {
  constructor(private readonly db: Database) {}

  async createEvent(groupId: number, hostId: number, input: SpyEventInput): Promise<SpyEvent> {
    const patch = normalizeSettings(input, true);
    assertSpyCountFits(patch.spy_count ?? null, patch.max_players ?? DEFAULT_MAX_PLAYERS);

    const repo = this.db.getRepository(SpyEvent);
    const saved = await repo.save(repo.create({
      group_id: groupId,
      host_id: hostId,
      title: patch.title!,
      description: patch.description ?? null,
      starts_at: patch.starts_at ?? null,
      place: patch.place ?? null,
      max_players: patch.max_players ?? DEFAULT_MAX_PLAYERS,
      spy_count: patch.spy_count ?? null,
      double_agent: patch.double_agent ?? false,
      mr_white: patch.mr_white ?? false,
      packs: patch.packs ?? [...DEFAULT_PACKS],
      turn_seconds: patch.turn_seconds ?? null,
      hint_after_cycles: patch.hint_after_cycles ?? null,
      status: SpyStatus.REGISTRATION,
    }));
    // Notifications need the group (chat id), so hand back the event with it loaded
    return (await this.getEvent(saved.id)) ?? saved;
  }

  /** Loaded with the group and the host. */
  async getEvent(eventId: number): Promise<SpyEvent | null> {
    return this.db.getRepository(SpyEvent).findOne({ where: { id: eventId }, relations: ['group', 'host'] });
  }

  async listGroupEvents(groupId: number, userId: number): Promise<SpyEventListItem[]> {
    const events = await this.db.getRepository(SpyEvent).find({
      where: { group_id: groupId },
      relations: ['host'],
      order: { created_at: 'DESC', id: 'DESC' },
    });
    if (events.length === 0) return [];

    // Only ids: nothing secret (roles live in the round tables) goes through the list
    const participants = await this.db.getRepository(SpyParticipant).find({
      where: { event_id: In(events.map((e) => e.id)) },
      select: ['id', 'event_id', 'user_id', 'is_active'],
    });

    return events.map((event) => {
      const own = participants.filter((p) => p.event_id === event.id && p.is_active !== false);
      return {
        event,
        participantsCount: own.length,
        joined: own.some((p) => p.user_id === userId),
        isHost: event.host_id === userId,
      };
    });
  }

  /** Allowed before a round starts only: registration or closed. Returns the event with relations. */
  async updateSettings(eventId: number, input: SpySettingsInput): Promise<SpyEvent> {
    const patch = normalizeSettings(input, false);

    await this.db.dataSource.transaction(async (manager) => {
      const event = await this.lockEvent(manager, eventId, 'pessimistic_write', [SpyStatus.REGISTRATION, SpyStatus.CLOSED]);

      const maxPlayers = patch.max_players ?? event.max_players;
      const spyCount = patch.spy_count !== undefined ? patch.spy_count : event.spy_count ?? null;
      assertSpyCountFits(spyCount, maxPlayers);

      if (patch.max_players !== undefined) {
        const count = await manager.getRepository(SpyParticipant).count({ where: { event_id: eventId, is_active: true } });
        if (patch.max_players < count) throw new ConflictError('Fewer places than joined players');
      }

      Object.assign(event, patch);
      await manager.getRepository(SpyEvent).save(event);
    });

    return (await this.getEvent(eventId))!;
  }

  async getParticipants(eventId: number): Promise<SpyParticipant[]> {
    return this.db.getRepository(SpyParticipant).find({
      where: { event_id: eventId },
      relations: ['user'],
      order: { joined_at: 'ASC', id: 'ASC' },
    });
  }

  /** Unlike Mafia the organizer plays like everyone else, so joining is open to the host too. */
  async join(eventId: number, userId: number): Promise<void> {
    await this.db.dataSource.transaction(async (manager) => {
      // FOR UPDATE, not FOR SHARE: two concurrent joins under a shared lock would both pass the
      // max_players count below and overfill the evening.
      const event = await this.lockEvent(manager, eventId, 'pessimistic_write', [SpyStatus.REGISTRATION]);

      const repo = manager.getRepository(SpyParticipant);
      if (await repo.findOne({ where: { event_id: eventId, user_id: userId } })) {
        throw new ConflictError('Already joined');
      }
      if ((await repo.count({ where: { event_id: eventId, is_active: true } })) >= event.max_players) {
        throw new ConflictError('Event is full');
      }
      await repo.save(repo.create({ event_id: eventId, user_id: userId }));
    });
  }

  async leave(eventId: number, userId: number): Promise<void> {
    await this.removeFromRegistration(eventId, userId);
  }

  /** Host / admin use; unlike leaving on one's own it also works after registration was closed. */
  async removeParticipant(eventId: number, userId: number): Promise<void> {
    await this.removeFromRegistration(eventId, userId, [SpyStatus.REGISTRATION, SpyStatus.CLOSED]);
  }

  /** Stops registration early; needs enough active players to play. */
  async closeRegistration(eventId: number): Promise<void> {
    await this.db.dataSource.transaction(async (manager) => {
      const event = await this.lockEvent(manager, eventId, 'pessimistic_write', [SpyStatus.REGISTRATION]);

      const count = await manager.getRepository(SpyParticipant).count({ where: { event_id: eventId, is_active: true } });
      if (count < SPY_MIN_PLAYERS) throw new ConflictError('Not enough players');

      event.status = SpyStatus.CLOSED;
      await manager.getRepository(SpyEvent).save(event);
    });
  }

  /** Back to registration from closed / in_progress; the round counter is kept. Refused while a round is unfinished. */
  async reopen(eventId: number): Promise<void> {
    await this.db.dataSource.transaction(async (manager) => {
      const event = await this.lockEvent(manager, eventId, 'pessimistic_write', [SpyStatus.CLOSED, SpyStatus.IN_PROGRESS]);

      const open = await manager.getRepository(SpyRound).count({
        where: { event_id: eventId, status: Not(SpyRoundStatus.FINISHED) },
      });
      if (open > 0) throw new ConflictError('Round is not finished');

      event.status = SpyStatus.REGISTRATION;
      await manager.getRepository(SpyEvent).save(event);
    });
  }

  /** Ends the evening; a round still running is aborted so no turn timer keeps ticking for it. */
  async finish(eventId: number): Promise<void> {
    await this.db.dataSource.transaction(async (manager) => {
      const event = await this.lockEvent(manager, eventId, 'pessimistic_write', [
        SpyStatus.REGISTRATION,
        SpyStatus.CLOSED,
        SpyStatus.IN_PROGRESS,
      ]);

      await manager.getRepository(SpyRound).update(
        { event_id: eventId, status: Not(SpyRoundStatus.FINISHED) },
        { status: SpyRoundStatus.FINISHED, outcome: 'aborted', outcome_reason: 'manual', finished_at: new Date() },
      );

      event.status = SpyStatus.FINISHED;
      await manager.getRepository(SpyEvent).save(event);
    });
  }

  async deleteEvent(eventId: number): Promise<void> {
    await this.db.getRepository(SpyEvent).delete(eventId);
  }

  /** Remembers the group message that holds the live card of the event. */
  async setCardMessage(eventId: number, chatId: number, messageId: number): Promise<void> {
    await this.db.getRepository(SpyEvent).update(eventId, { card_chat_id: String(chatId), card_message_id: messageId });
  }

  // ---- Rounds ----

  /** Deals the next round to the active participants; refused while the previous one is unfinished. */
  async startRound(eventId: number): Promise<{ round: SpyRound; players: SpyRoundPlayer[] }> {
    return this.db.dataSource.transaction(async (manager) => {
      const event = await this.lockEvent(manager, eventId, 'pessimistic_write', [
        SpyStatus.REGISTRATION,
        SpyStatus.CLOSED,
        SpyStatus.IN_PROGRESS,
      ]);

      const open = await manager.getRepository(SpyRound).count({
        where: { event_id: eventId, status: Not(SpyRoundStatus.FINISHED) },
      });
      if (open > 0) throw new ConflictError('Round is not finished');

      const participants = await manager.getRepository(SpyParticipant).find({
        where: { event_id: eventId, is_active: true },
        order: { joined_at: 'ASC', id: 'ASC' },
      });
      const n = participants.length;
      if (n < SPY_MIN_PLAYERS) throw new ConflictError('Not enough players');

      const locations = await findLocations(manager, event.group_id, event.packs);
      if (locations.length === 0) throw new ConflictError('No locations to play');
      const location = locations[Math.floor(Math.random() * locations.length)];

      // The setting was validated against max_players; fewer players showed up, so clamp instead of failing
      const spyCap = Math.floor((n - 1) / 2);
      const spyCount = event.spy_count == null ? null : Math.min(event.spy_count, spyCap);
      const dealt = dealRoles(
        participants.map((p) => p.user_id),
        { spyCount, doubleAgent: event.double_agent, mrWhite: event.mr_white },
      );
      const order = shuffleOrder(dealt.map((d) => d.userId));

      const roundRepo = manager.getRepository(SpyRound);
      const round = await roundRepo.save(roundRepo.create({
        event_id: eventId,
        number: event.round + 1,
        location_id: location.id,
        location_name: location.name,
        location_pack: location.pack,
        status: SpyRoundStatus.IN_PROGRESS,
        turn_order: order,
        turn_index: 0,
        cycle: 1,
        turn_started_at: new Date(),
      }));

      const playerRepo = manager.getRepository(SpyRoundPlayer);
      const players = await playerRepo.save(
        dealt.map((d) => playerRepo.create({ round_id: round.id, user_id: d.userId, role: d.role, is_eliminated: false })),
      );

      event.round += 1;
      event.status = SpyStatus.IN_PROGRESS;
      await manager.getRepository(SpyEvent).save(event);

      return { round, players };
    });
  }

  /** The latest round of the evening (any status), or null before the first one. */
  async getCurrentRound(eventId: number): Promise<SpyRound | null> {
    return this.db.getRepository(SpyRound).findOne({ where: { event_id: eventId }, order: { number: 'DESC' } });
  }

  async getRound(eventId: number, number: number): Promise<SpyRound | null> {
    return this.db.getRepository(SpyRound).findOne({ where: { event_id: eventId, number } });
  }

  /**
   * The caller's own card of the latest round, null when they do not play it. Nobody else's role is
   * read, and the location never reaches a spy or Mr. White.
   */
  async getMyCard(eventId: number, userId: number): Promise<SpyCard | null> {
    const event = await this.db.getRepository(SpyEvent).findOne({ where: { id: eventId } });
    if (!event) return null;
    const round = await this.getCurrentRound(eventId);
    if (!round) return null;

    const mine = await this.db.getRepository(SpyRoundPlayer).findOne({ where: { round_id: round.id, user_id: userId } });
    if (!mine) return null;

    const knowsLocation = mine.role === SpyRole.CIVILIAN || mine.role === SpyRole.DOUBLE_AGENT;
    const hinted = mine.role === SpyRole.SPY && shouldHint(round.cycle, event.hint_after_cycles ?? null);
    const turnRunning = round.status === SpyRoundStatus.IN_PROGRESS;
    const currentUserId = turnRunning ? round.turn_order[round.turn_index] ?? null : null;

    return {
      round: round.number,
      role: mine.role,
      location: knowsLocation ? round.location_name : null,
      hint: hinted ? SPY_PACKS.find((p) => p.id === round.location_pack)?.title ?? null : null,
      cycle: round.cycle,
      currentUserId,
      isMyTurn: currentUserId === userId,
      deadline: turnRunning && round.turn_started_at ? turnDeadline(new Date(round.turn_started_at), event.turn_seconds ?? null) : null,
    };
  }

  /** Passes the turn on. Only the current player may do it, unless `force` (a manager) is set. */
  async nextTurn(eventId: number, actorId: number, options: { force?: boolean } = {}): Promise<SpyTurnState> {
    return this.db.dataSource.transaction(async (manager) => {
      const event = await this.lockEvent(manager, eventId, 'pessimistic_write', [SpyStatus.IN_PROGRESS]);
      const round = await this.latestRound(manager, eventId, [SpyRoundStatus.IN_PROGRESS]);

      if (!options.force && round.turn_order[round.turn_index] !== actorId) {
        throw new ConflictError('Not your turn');
      }
      const players = await this.loadPlayers(manager, round.id);
      return this.advance(manager, event, round, players, new Date());
    });
  }

  /** Stops the turns and lets the players vote. */
  async openVoting(eventId: number): Promise<SpyRound> {
    return this.db.dataSource.transaction(async (manager) => {
      await this.lockEvent(manager, eventId, 'pessimistic_write', [SpyStatus.IN_PROGRESS]);
      const round = await this.latestRound(manager, eventId, [SpyRoundStatus.IN_PROGRESS]);

      round.status = SpyRoundStatus.VOTING;
      return manager.getRepository(SpyRound).save(round);
    });
  }

  /** Records (or replaces) the voter's ballot in the current ballot round and settles the vote when everyone has voted. */
  async castVote(eventId: number, voterId: number, targetId: number): Promise<SpyVoteOutcome> {
    return this.db.dataSource.transaction(async (manager) => {
      await this.lockEvent(manager, eventId, 'pessimistic_write', [SpyStatus.IN_PROGRESS]);
      const round = await this.latestRound(manager, eventId, [SpyRoundStatus.VOTING]);
      const players = await this.loadPlayers(manager, round.id);
      const alive = aliveIds(players);

      if (!alive.includes(voterId)) throw new ConflictError('Voter is not in the game');
      if (voterId === targetId) throw new ValidationError('Cannot vote for yourself');
      if (!alive.includes(targetId)) throw new ValidationError('Target is not in the game');

      const voteRepo = manager.getRepository(SpyVote);
      const votes = await voteRepo.find({ where: { round_id: round.id } });
      const ballot = currentBallot(votes, alive);
      if (ballot > 1) {
        const previous = tallyVotes(ballotsOf(votes, ballot - 1, alive), alive);
        if (!previous.leaders.includes(targetId)) throw new ValidationError('Vote for one of the leaders');
      }

      const existing = votes.find((v) => v.ballot === ballot && v.voter_id === voterId);
      if (existing) {
        existing.target_id = targetId;
        await voteRepo.save(existing);
      } else {
        const created = await voteRepo.save(voteRepo.create({ round_id: round.id, voter_id: voterId, target_id: targetId, ballot }));
        votes.push(created);
      }
      return this.settleVote(manager, round, players, votes);
    });
  }

  /** A spy names the location. `close` changes nothing, so the spy may try again. */
  async guess(eventId: number, userId: number, text: string): Promise<SpyGuessOutcome> {
    const clean = typeof text === 'string' ? text.trim() : '';
    if (!clean) throw new ValidationError('Guess is required');
    if (clean.length > LOCATION_NAME_MAX * 2) throw new ValidationError('Guess is too long');

    return this.db.dataSource.transaction(async (manager) => {
      await this.lockEvent(manager, eventId, 'pessimistic_write', [SpyStatus.IN_PROGRESS]);
      const round = await this.latestRound(manager, eventId, [SpyRoundStatus.IN_PROGRESS, SpyRoundStatus.VOTING]);
      const players = await this.loadPlayers(manager, round.id);

      const me = players.find((p) => p.user_id === userId);
      if (!me || me.role !== SpyRole.SPY || me.is_eliminated) throw new ConflictError('Only a living spy can guess');

      const result = classifyGuess(clean, round.location_name);
      if (result === 'close') return { result };

      round.guess = clean;
      round.guessed_by = userId;
      const finished = result === 'correct'
        ? await this.closeRound(manager, round, 'spies', 'guess_correct')
        : await this.closeRound(manager, round, 'town', 'guess_wrong');
      return { result, round: finished, players };
    });
  }

  /** Ends the running round with the given result; the roles become public. Returns the full layout. */
  async finishRound(eventId: number, outcome: SpyOutcome, reason: SpyOutcomeReason): Promise<SpyRoundResult> {
    return this.db.dataSource.transaction(async (manager) => {
      await this.lockEvent(manager, eventId, 'pessimistic_write', [SpyStatus.IN_PROGRESS]);
      const round = await this.latestRound(manager, eventId, [SpyRoundStatus.IN_PROGRESS, SpyRoundStatus.VOTING]);
      const players = await this.loadPlayers(manager, round.id);
      return { round: await this.closeRound(manager, round, outcome, reason), players };
    });
  }

  /** The manager closes the round without a result. */
  async abortRound(eventId: number): Promise<SpyRoundResult> {
    return this.finishRound(eventId, 'aborted', 'manual');
  }

  /**
   * Marks a player as gone home (or back). The remaining players decide the round: fewer than three
   * left aborts it, nobody of the spy team left gives the town the win.
   */
  async eliminate(eventId: number, userId: number, eliminated: boolean): Promise<SpyEliminateResult> {
    return this.db.dataSource.transaction(async (manager) => {
      const event = await this.lockEvent(manager, eventId, 'pessimistic_write', [SpyStatus.IN_PROGRESS]);
      const round = await this.latestRound(manager, eventId, [SpyRoundStatus.IN_PROGRESS, SpyRoundStatus.VOTING]);
      const players = await this.loadPlayers(manager, round.id);

      const target = players.find((p) => p.user_id === userId);
      if (!target) throw new ConflictError('Not in the round');
      target.is_eliminated = eliminated;
      await manager.getRepository(SpyRoundPlayer).save(target);

      const alive = players.filter((p) => !p.is_eliminated);
      if (alive.length < SPY_MIN_PLAYERS) {
        return { finished: true, round: await this.closeRound(manager, round, 'aborted', 'manual'), players };
      }
      if (!alive.some((p) => SPY_ROLE_TEAM[p.role] === 'spies')) {
        return { finished: true, round: await this.closeRound(manager, round, 'town', 'manual'), players };
      }

      if (round.status === SpyRoundStatus.VOTING) {
        // The ballot may have become complete with the leaver gone
        const votes = await manager.getRepository(SpyVote).find({ where: { round_id: round.id } });
        if (votes.length > 0) {
          const settled = await this.settleVote(manager, round, players, votes);
          if (settled.state === 'resolved') return { finished: true, round: settled.round, players };
        }
      } else if (eliminated && round.turn_order[round.turn_index] === userId) {
        await this.advance(manager, event, round, players, new Date());
      }
      return { finished: false, round, players };
    });
  }

  /** Takes a player out of (or back into) the next rounds without removing them from the evening. */
  async setParticipantActive(eventId: number, userId: number, isActive: boolean): Promise<void> {
    await this.db.dataSource.transaction(async (manager) => {
      const event = await this.lockEvent(manager, eventId, 'pessimistic_write', [
        SpyStatus.REGISTRATION,
        SpyStatus.CLOSED,
        SpyStatus.IN_PROGRESS,
      ]);

      const repo = manager.getRepository(SpyParticipant);
      const row = await repo.findOne({ where: { event_id: eventId, user_id: userId } });
      if (!row) throw new ConflictError('Not joined');
      if (row.is_active === isActive) return;

      if (isActive && (await repo.count({ where: { event_id: eventId, is_active: true } })) >= event.max_players) {
        throw new ConflictError('Event is full');
      }
      row.is_active = isActive;
      await repo.save(row);
    });
  }

  /** Every role of the latest round: open to non-players at any time and to everyone once it is finished. */
  async getLayout(eventId: number, userId: number): Promise<SpyRoundPlayer[]> {
    const round = await this.getCurrentRound(eventId);
    if (!round) throw new ConflictError('No round');

    const players = await this.db.getRepository(SpyRoundPlayer).find({
      where: { round_id: round.id },
      relations: ['user'],
      order: { id: 'ASC' },
    });
    if (round.status !== SpyRoundStatus.FINISHED && players.some((p) => p.user_id === userId)) {
      throw new ConflictError('Round is not finished');
    }
    return players;
  }

  /** The latest round with its players for public display; roles are filled in only once the round is finished. */
  async getRoundView(eventId: number): Promise<SpyRoundView | null> {
    const round = await this.getCurrentRound(eventId);
    if (!round) return null;

    const rows = await this.db.getRepository(SpyRoundPlayer).find({
      where: { round_id: round.id },
      relations: ['user'],
      order: { id: 'ASC' },
    });
    const revealed = round.status === SpyRoundStatus.FINISHED;
    const players = rows.map((p) => ({
      user_id: p.user_id,
      user: p.user,
      is_eliminated: p.is_eliminated,
      role: revealed ? p.role : null,
    }));
    return { round, players };
  }

  /** The ballot of the round being voted on; null when there is no such round. Exposes no vote targets. */
  async getVotingState(eventId: number): Promise<SpyVotingState | null> {
    const round = await this.getCurrentRound(eventId);
    if (!round || round.status !== SpyRoundStatus.VOTING) return null;

    const players = await this.db.getRepository(SpyRoundPlayer).find({ where: { round_id: round.id } });
    const alive = aliveIds(players);
    const votes = await this.db.getRepository(SpyVote).find({ where: { round_id: round.id } });

    const ballot = currentBallot(votes, alive);
    const current = ballotsOf(votes, ballot, alive);
    const { counts, leaders } = tallyVotes(current, alive);
    const voterIds = [...new Set(current.map((b) => b.voterId).filter((id) => alive.includes(id)))];
    const candidateIds = ballot > 1 ? tallyVotes(ballotsOf(votes, ballot - 1, alive), alive).leaders : undefined;

    return { roundId: round.id, ballot, voterIds, counts, leaders, candidateIds };
  }

  /**
   * Passes the turn in every running round whose timer ran out. One failing round does not stop the
   * others. The result feeds the notifications.
   */
  async runTurnTimeouts(now: Date = new Date()): Promise<SpyTurnTimeout[]> {
    const running = await this.db.getRepository(SpyRound).find({ where: { status: SpyRoundStatus.IN_PROGRESS } });
    if (running.length === 0) return [];

    const events = await this.db.getRepository(SpyEvent).find({ where: { id: In(running.map((r) => r.event_id)) } });
    const timed = new Map(events.filter((e) => e.turn_seconds != null).map((e) => [e.id, e]));

    const result: SpyTurnTimeout[] = [];
    for (const candidate of running) {
      const candidateEvent = timed.get(candidate.event_id);
      if (!candidateEvent || !isExpired(candidate, candidateEvent, now)) continue;

      try {
        const moved = await this.db.dataSource.transaction(async (manager) => {
          const event = await this.lockEvent(manager, candidate.event_id, 'pessimistic_write', [SpyStatus.IN_PROGRESS]);
          // Re-read under the lock: someone may have passed the turn or ended the round meanwhile
          const round = await manager.getRepository(SpyRound).findOne({ where: { id: candidate.id } });
          if (!round || round.status !== SpyRoundStatus.IN_PROGRESS || !isExpired(round, event, now)) return null;

          const players = await this.loadPlayers(manager, round.id);
          return this.advance(manager, event, round, players, now);
        });
        if (moved) {
          result.push({
            eventId: candidate.event_id,
            roundId: candidate.id,
            previousUserId: moved.previousUserId,
            currentUserId: moved.currentUserId,
          });
        }
      } catch (err) {
        console.error(`Spy turn timeout failed for round ${candidate.id}:`, err);
      }
    }
    return result;
  }

  /**
   * Per-player results of the group over finished rounds (aborted ones do not count). `spy_rounds`
   * counts the SPY role only; Mr. White and the double agent are in `rounds` but not in `spy_rounds`.
   * `win_rate` is a 0..1 fraction.
   */
  async getGroupStats(groupId: number): Promise<SpyPlayerStats[]> {
    const events = await this.db.getRepository(SpyEvent).find({ where: { group_id: groupId } });
    if (events.length === 0) return [];

    const finished = (await this.db.getRepository(SpyRound).find({
      where: { event_id: In(events.map((e) => e.id)), status: SpyRoundStatus.FINISHED },
    })).filter((r) => r.outcome === 'town' || r.outcome === 'spies');
    if (finished.length === 0) return [];

    const roundIds = finished.map((r) => r.id);
    const players = await this.db.getRepository(SpyRoundPlayer).find({
      where: { round_id: In(roundIds) },
      relations: ['user'],
    });
    const votes = await this.db.getRepository(SpyVote).find({ where: { round_id: In(roundIds) } });

    // Who the vote exposed: the single leader of the last ballot
    const accusedOf = new Map<number, number>();
    for (const round of finished) {
      if (round.outcome_reason !== 'vote_hit') continue;
      const own = votes.filter((v) => v.round_id === round.id);
      if (own.length === 0) continue;
      const last = Math.max(...own.map((v) => v.ballot));
      const everyone = players.filter((p) => p.round_id === round.id).map((p) => p.user_id);
      const leaders = tallyVotes(ballotsOf(own, last, everyone), everyone).leaders;
      if (leaders.length === 1) accusedOf.set(round.id, leaders[0]);
    }

    const roundById = new Map(finished.map((r) => [r.id, r]));
    const stats = new Map<number, SpyPlayerStats>();
    for (const p of players) {
      const round = roundById.get(p.round_id)!;
      const row = stats.get(p.user_id) ?? {
        user_id: p.user_id, user: p.user, rounds: 0, wins: 0, spy_rounds: 0, spy_wins: 0, exposed: 0, guessed: 0, win_rate: 0,
      };
      const won = SPY_ROLE_TEAM[p.role] === round.outcome;
      row.rounds++;
      if (won) row.wins++;
      if (p.role === SpyRole.SPY) {
        row.spy_rounds++;
        if (won) row.spy_wins++;
      }
      if (round.outcome_reason === 'vote_hit' && accusedOf.get(round.id) === p.user_id) row.exposed++;
      if (round.outcome_reason === 'guess_correct' && round.guessed_by === p.user_id) row.guessed++;
      stats.set(p.user_id, row);
    }

    return [...stats.values()]
      .map((s) => ({ ...s, win_rate: s.rounds > 0 ? s.wins / s.rounds : 0 }))
      .sort((a, b) => b.rounds - a.rounds || b.win_rate - a.win_rate || a.user_id - b.user_id);
  }

  /** Looks at the ballot in progress: still waiting, a tie (the next ballot opens) or a verdict. */
  private async settleVote(
    manager: EntityManager,
    round: SpyRound,
    players: SpyRoundPlayer[],
    votes: SpyVote[],
  ): Promise<SpyVoteOutcome> {
    const alive = aliveIds(players);
    // The ballot that holds the latest votes, not the one a tie would open next
    const ballot = Math.max(...votes.map((v) => v.ballot));
    const tally = tallyVotes(ballotsOf(votes, ballot, alive), alive);
    if (!tally.complete) return { state: 'pending', round, ballot, tally };

    const roleOf = new Map(players.map((p) => [p.user_id, p.role]));
    const resolution = resolveVote(tally.leaders, (id) => roleOf.get(id)!);
    if (resolution === 'tie') {
      return { state: 'tie', round, ballot, nextBallot: ballot + 1, tally, leaders: tally.leaders };
    }
    const finished = await this.closeRound(manager, round, resolution.outcome, resolution.reason);
    return { state: 'resolved', round: finished, ballot, tally, resolution, players };
  }

  /** Marks the round finished (the caller holds the event lock). */
  private async closeRound(
    manager: EntityManager,
    round: SpyRound,
    outcome: SpyOutcome,
    reason: SpyOutcomeReason,
  ): Promise<SpyRound> {
    round.status = SpyRoundStatus.FINISHED;
    round.outcome = outcome;
    round.outcome_reason = reason;
    round.finished_at = new Date();
    return manager.getRepository(SpyRound).save(round);
  }

  private async advance(
    manager: EntityManager,
    event: SpyEvent,
    round: SpyRound,
    players: SpyRoundPlayer[],
    now: Date,
  ): Promise<SpyTurnState> {
    const previousUserId = round.turn_order[round.turn_index] ?? null;
    const eliminated = new Set(players.filter((p) => p.is_eliminated).map((p) => p.user_id));
    const next = advanceTurn(round.turn_order, round.turn_index, round.cycle, eliminated);

    round.turn_index = next.index;
    round.cycle = next.cycle;
    round.turn_started_at = now;
    await manager.getRepository(SpyRound).save(round);

    return {
      roundId: round.id,
      previousUserId,
      currentUserId: round.turn_order[next.index],
      cycle: next.cycle,
      deadline: turnDeadline(now, event.turn_seconds ?? null),
    };
  }

  /** The latest round of the event, required to be in one of the given statuses. */
  private async latestRound(manager: EntityManager, eventId: number, allowed: SpyRoundStatus[]): Promise<SpyRound> {
    const round = await manager.getRepository(SpyRound).findOne({ where: { event_id: eventId }, order: { number: 'DESC' } });
    if (!round) throw new ConflictError('No round');
    if (!allowed.includes(round.status)) {
      throw new ConflictError(round.status === SpyRoundStatus.FINISHED ? 'Round finished' : 'Wrong round state');
    }
    return round;
  }

  private async loadPlayers(manager: EntityManager, roundId: number): Promise<SpyRoundPlayer[]> {
    return manager.getRepository(SpyRoundPlayer).find({ where: { round_id: roundId }, relations: ['user'], order: { id: 'ASC' } });
  }

  // ---- Locations ----

  /**
   * Active locations for the given packs (all packs when omitted): global ones whose pack is selected,
   * plus the group's own when `custom` is selected.
   */
  async listLocations(groupId: number, packs?: string[]): Promise<SpyLocation[]> {
    const selected = packs ?? SPY_PACKS.map((p) => p.id);
    const where = locationFilter(groupId, selected);
    if (where.length === 0) return [];

    return this.db.getRepository(SpyLocation).find({ where: where as never, order: { name: 'ASC', id: 'ASC' } });
  }

  async addGroupLocation(groupId: number, name: string): Promise<SpyLocation> {
    const clean = normalizeLocationName(name);
    const repo = this.db.getRepository(SpyLocation);

    await this.assertNameFree(groupId, clean);
    try {
      return await repo.save(repo.create({ group_id: groupId, name: clean, pack: CUSTOM_PACK, is_active: true }));
    } catch (err) {
      // A concurrent insert slipped past the check above; the unique index is the final word
      if ((err as { code?: string }).code === '23505') throw new ConflictError('Location already exists');
      throw err;
    }
  }

  async renameGroupLocation(groupId: number, locationId: number, name: string): Promise<SpyLocation> {
    const clean = normalizeLocationName(name);
    const repo = this.db.getRepository(SpyLocation);
    const location = await this.findOwnLocation(groupId, locationId);

    await this.assertNameFree(groupId, clean, location.id);
    location.name = clean;
    try {
      return await repo.save(location);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new ConflictError('Location already exists');
      throw err;
    }
  }

  async deleteGroupLocation(groupId: number, locationId: number): Promise<void> {
    const location = await this.findOwnLocation(groupId, locationId);
    // Past rounds keep their own name snapshot, so a hard delete loses no history
    await this.db.getRepository(SpyLocation).delete(location.id);
  }

  /** The location, only when it belongs to this group; global ones are immutable. */
  private async findOwnLocation(groupId: number, locationId: number): Promise<SpyLocation> {
    const location = await this.db.getRepository(SpyLocation).findOne({ where: { id: locationId } });
    if (!location) throw new ConflictError('Location not found');
    if (location.group_id == null) throw new ConflictError('Global locations cannot be changed');
    if (location.group_id !== groupId) throw new ConflictError('Location not found');
    return location;
  }

  /** Case-insensitive duplicate check within the group's own locations (inactive ones count: the index does). */
  private async assertNameFree(groupId: number, name: string, exceptId?: number): Promise<void> {
    const existing = await this.db.getRepository(SpyLocation).find({ where: { group_id: groupId } });
    const lower = name.toLowerCase();
    if (existing.some((l) => l.id !== exceptId && l.name.toLowerCase() === lower)) {
      throw new ConflictError('Location already exists');
    }
  }

  private async removeFromRegistration(
    eventId: number,
    userId: number,
    allowed: SpyStatus[] = [SpyStatus.REGISTRATION],
  ): Promise<void> {
    await this.db.dataSource.transaction(async (manager) => {
      await this.lockEvent(manager, eventId, 'pessimistic_read', allowed);

      const repo = manager.getRepository(SpyParticipant);
      const row = await repo.findOne({ where: { event_id: eventId, user_id: userId } });
      if (!row) throw new ConflictError('Not joined');
      await repo.delete(row.id);
    });
  }

  /** Locks the event row, then checks its status; ConflictError when it is not one of the allowed ones. */
  private async lockEvent(
    manager: EntityManager,
    eventId: number,
    mode: 'pessimistic_read' | 'pessimistic_write',
    allowed: SpyStatus[],
  ): Promise<SpyEvent> {
    const event = await manager.getRepository(SpyEvent).findOne({ where: { id: eventId }, lock: { mode } });
    if (!event) throw new ConflictError('Event not found');

    if (!allowed.includes(event.status)) {
      throw new ConflictError(rejectionMessage(event.status));
    }
    return event;
  }
}

function aliveIds(players: SpyRoundPlayer[]): number[] {
  return players.filter((p) => !p.is_eliminated).map((p) => p.user_id);
}

/** Ballots of one ballot round that point at a living player. */
function ballotsOf(votes: SpyVote[], ballot: number, alive: number[]): SpyBallot[] {
  return votes
    .filter((v) => v.ballot === ballot && alive.includes(v.target_id))
    .map((v) => ({ voterId: v.voter_id, targetId: v.target_id }));
}

/** The ballot round that takes votes now: the latest one, or the next after a complete tie. */
function currentBallot(votes: SpyVote[], alive: number[]): number {
  if (votes.length === 0) return 1;
  const latest = Math.max(...votes.map((v) => v.ballot));
  const tally = tallyVotes(ballotsOf(votes, latest, alive), alive);
  return tally.complete && tally.leaders.length > 1 ? latest + 1 : latest;
}

function isExpired(round: SpyRound, event: SpyEvent, now: Date): boolean {
  if (!round.turn_started_at) return false;
  const deadline = turnDeadline(new Date(round.turn_started_at), event.turn_seconds ?? null);
  return deadline !== null && deadline.getTime() <= now.getTime();
}

/** Active locations of the selected packs: global ones by pack, plus the group's own for `custom`. */
async function findLocations(manager: EntityManager, groupId: number, packs: string[]): Promise<SpyLocation[]> {
  const where = locationFilter(groupId, packs);
  if (where.length === 0) return [];
  return manager.getRepository(SpyLocation).find({ where: where as never, order: { name: 'ASC', id: 'ASC' } });
}

function locationFilter(groupId: number, selected: string[]): Array<Record<string, unknown>> {
  const where: Array<Record<string, unknown>> = [];
  const globalPacks = selected.filter((p) => p !== CUSTOM_PACK);
  if (globalPacks.length > 0) where.push({ group_id: IsNull(), pack: In(globalPacks), is_active: true });
  if (selected.includes(CUSTOM_PACK)) where.push({ group_id: groupId, is_active: true });
  return where;
}

function rejectionMessage(actual: SpyStatus): string {
  if (actual === SpyStatus.FINISHED) return 'Event finished';
  if (actual === SpyStatus.CLOSED) return 'Registration closed';
  return actual === SpyStatus.IN_PROGRESS ? 'Round in progress' : 'Registration is open';
}

function normalizeLocationName(name: unknown): string {
  const clean = typeof name === 'string' ? name.trim() : '';
  if (!clean) throw new ValidationError('Location name is required');
  if (clean.length > LOCATION_NAME_MAX) throw new ValidationError('Location name is too long');
  return clean;
}

function isIntInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/** `spy_count` against the player limit: null (automatic) always fits. */
function assertSpyCountFits(spyCount: number | null, maxPlayers: number): void {
  if (spyCount !== null) validateSpyCount(spyCount, maxPlayers);
}

function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new ValidationError(`Invalid ${field}`);
  const clean = value.trim();
  if (clean.length > max) throw new ValidationError(`${field} is too long`);
  return clean === '' ? null : clean;
}

/** Validates the keys that are present and returns them cleaned; absent (undefined) keys are dropped. */
function normalizeSettings(input: SpySettingsInput, requireTitle: boolean): SpySettingsInput {
  const out: SpySettingsInput = {};

  if (input.title !== undefined || requireTitle) {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title) throw new ValidationError('Title is required');
    if (title.length > TITLE_MAX) throw new ValidationError('Title is too long');
    out.title = title;
  }
  if (input.description !== undefined) out.description = optionalText(input.description, 'description', Number.MAX_SAFE_INTEGER);
  if (input.place !== undefined) out.place = optionalText(input.place, 'place', PLACE_MAX);
  if (input.starts_at !== undefined) {
    if (input.starts_at !== null && !(input.starts_at instanceof Date && !Number.isNaN(input.starts_at.getTime()))) {
      throw new ValidationError('Invalid start time');
    }
    out.starts_at = input.starts_at;
  }
  if (input.max_players !== undefined) {
    if (!isIntInRange(input.max_players, SPY_MIN_PLAYERS, SPY_MAX_PLAYERS)) throw new ValidationError('Invalid player limit');
    out.max_players = input.max_players;
  }
  if (input.spy_count !== undefined) {
    // The upper bound depends on max_players, so the caller checks it with assertSpyCountFits
    if (input.spy_count !== null && !isIntInRange(input.spy_count, 1, SPY_MAX_PLAYERS)) throw new ValidationError('Invalid spy count');
    out.spy_count = input.spy_count;
  }
  for (const flag of ['double_agent', 'mr_white'] as const) {
    if (input[flag] !== undefined) {
      if (typeof input[flag] !== 'boolean') throw new ValidationError(`Invalid ${flag}`);
      out[flag] = input[flag];
    }
  }
  if (input.packs !== undefined) {
    const known = new Set(SPY_PACKS.map((p) => p.id));
    const packs = input.packs;
    if (
      !Array.isArray(packs) ||
      packs.length === 0 ||
      packs.some((p) => typeof p !== 'string' || !known.has(p)) ||
      new Set(packs).size !== packs.length
    ) {
      throw new ValidationError('Invalid packs');
    }
    out.packs = [...packs];
  }
  if (input.turn_seconds !== undefined) {
    if (input.turn_seconds !== null && !isIntInRange(input.turn_seconds, TURN_SECONDS_MIN, TURN_SECONDS_MAX)) {
      throw new ValidationError('Invalid turn time');
    }
    out.turn_seconds = input.turn_seconds;
  }
  if (input.hint_after_cycles !== undefined) {
    if (input.hint_after_cycles !== null && !isIntInRange(input.hint_after_cycles, HINT_CYCLES_MIN, HINT_CYCLES_MAX)) {
      throw new ValidationError('Invalid hint cycles');
    }
    out.hint_after_cycles = input.hint_after_cycles;
  }
  return out;
}
