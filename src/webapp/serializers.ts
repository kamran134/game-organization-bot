import { Game } from '../models/Game';
import { GameParticipant } from '../models/GameParticipant';
import { Location } from '../models/Location';
import { User } from '../models/User';
import { Group } from '../models/Group';
import { Sport } from '../models/Sport';
import { SantaEvent } from '../models/SantaEvent';
import { SantaParticipant } from '../models/SantaParticipant';
import { MafiaEvent } from '../models/MafiaEvent';
import { MafiaParticipant } from '../models/MafiaParticipant';
import { SpyEvent } from '../models/SpyEvent';
import { SpyParticipant } from '../models/SpyParticipant';
import { SpyLocation } from '../models/SpyLocation';
import { SpyRoundPlayer } from '../models/SpyRoundPlayer';
import { SpyRoundStatus } from '../models/SpyRound';
import { turnDeadline } from '../utils/spyRound';
import type { SpyCard, SpyPlayerStats, SpyRoundView, SpyVotingState } from '../services/SpyService';
import type { MafiaCard,MafiaLayoutRow, MafiaLogEntryView, MafiaLogView } from '../services/MafiaService';

// Response DTOs: expose only what the client reads, never raw entities
// (users carry `phone`, groups carry `invite_code`).

export function serializeUser(user: User): {
  id: number;
  telegram_id: number;
  first_name?: string;
  last_name?: string;
  username?: string | null;
} {
  return {
    id: user.id,
    telegram_id: user.telegram_id,
    first_name: user.first_name,
    last_name: user.last_name,
    username: user.username,
  };
}

function serializeGroup(group: Group): { id: number; name: string } {
  return { id: group.id, name: group.name };
}

function serializeSport(sport: Sport): { id: number; name: string; emoji: string; group_id?: number | null } {
  return { id: sport.id, name: sport.name, emoji: sport.emoji, group_id: sport.group_id };
}

export function serializeLocation(location: Location): {
  id: number;
  name: string;
  group_id: number;
  map_url?: string;
  is_active: boolean;
} {
  return {
    id: location.id,
    name: location.name,
    group_id: location.group_id,
    map_url: location.map_url,
    is_active: location.is_active,
  };
}

function serializeParticipant(p: GameParticipant): Record<string, unknown> {
  return {
    id: p.id,
    game_id: p.game_id,
    user_id: p.user_id,
    participation_status: p.participation_status,
    guest_name: p.guest_name,
    position: p.position,
    team: p.team ?? null,
    joined_at: p.joined_at,
    user: p.user ? serializeUser(p.user) : undefined,
  };
}

export function serializeGame(game: Game): Record<string, unknown> {
  return {
    id: game.id,
    group_id: game.group_id,
    creator_id: game.creator_id,
    sport_id: game.sport_id,
    location_id: game.location_id,
    game_date: game.game_date,
    min_participants: game.min_participants,
    max_participants: game.max_participants,
    cost: game.cost,
    status: game.status,
    type: game.type,
    notes: game.notes,
    registration_lock_hours: game.registration_lock_hours,
    team_count: game.team_count ?? null,
    group: game.group ? serializeGroup(game.group) : undefined,
    creator: game.creator ? serializeUser(game.creator) : undefined,
    sport: game.sport ? serializeSport(game.sport) : undefined,
    location: game.location ? serializeLocation(game.location) : undefined,
    participants: game.participants?.map(serializeParticipant),
  };
}

// Secret Santa DTOs. Deliberately without receiver_id, wishlist, phone and telegram_id:
// nobody may learn who gives to whom, and other participants' wishlists stay hidden.

interface SantaPerson {
  first_name?: string;
  last_name?: string;
  username?: string | null;
}

export function serializeSantaPerson(user: SantaPerson): SantaPerson {
  return { first_name: user.first_name, last_name: user.last_name, username: user.username };
}

export function serializeSantaEvent(event: SantaEvent): Record<string, unknown> {
  return {
    id: event.id,
    group_id: event.group_id,
    title: event.title,
    description: event.description ?? null,
    budget: event.budget ?? null,
    exchange_date: event.exchange_date ?? null,
    status: event.status,
    drawn_at: event.drawn_at ?? null,
  };
}

export function serializeSantaParticipant(p: SantaParticipant): Record<string, unknown> {
  return { user_id: p.user_id, ...serializeSantaPerson(p.user) };
}

/** The caller's own recipient: the only pair information that ever leaves the server. */
export function serializeSantaAssignment(assignment: { receiver: User; wishlist: string | null }): Record<string, unknown> {
  return { receiver: serializeSantaPerson(assignment.receiver), wishlist: assignment.wishlist };
}

// Mafia DTOs. Roles and card variants are secret: they appear only in the caller's own card
// and in the host's layout. Seat is public (shown in the participant list after a deal).

export function serializeMafiaEvent(event: MafiaEvent): Record<string, unknown> {
  return {
    id: event.id,
    group_id: event.group_id,
    title: event.title,
    description: event.description ?? null,
    starts_at: event.starts_at ?? null,
    place: event.place ?? null,
    status: event.status,
    host: event.host ? serializeSantaPerson(event.host) : null,
    show_mafia_team: event.show_mafia_team,
    assign_seats: event.assign_seats,
    max_players: event.max_players,
    round: event.round,
    dealt_at: event.dealt_at ?? null,
  };
}

export function serializeMafiaParticipant(p: MafiaParticipant): Record<string, unknown> {
  // gender is not a secret (unlike the role): the host layout and the cards need it for role names
  return { user_id: p.user_id, ...serializeSantaPerson(p.user), gender: p.user.gender ?? null, seat: p.seat ?? null };
}

/** The caller's own card: the only place a role reaches a player. */
export function serializeMafiaCard(card: MafiaCard): Record<string, unknown> {
  return {
    round: card.round,
    role: card.role,
    gender: card.gender,
    seat: card.seat,
    variant: card.variant,
    teammates: card.teammates.map((t) => ({ name: t.name, role: t.role, seat: t.seat })),
  };
}

/** One row of the host's layout. */
export function serializeMafiaLayoutRow(row: MafiaLayoutRow): Record<string, unknown> {
  return {
    user_id: row.user.id,
    ...serializeSantaPerson(row.user),
    gender: row.user.gender ?? null,
    seat: row.seat,
    role: row.role,
  };
}

/**
 * One line of the host's log. `target_role` (found by a `check`) is a secret: log responses
 * go to the host only, like the layout.
 */
export function serializeMafiaLogEntry(view: MafiaLogEntryView): Record<string, unknown> {
  const { entry, target } = view;
  return {
    id: entry.id,
    cycle: entry.cycle,
    phase: entry.phase,
    type: entry.type,
    target_user_id: entry.target_user_id ?? null,
    target: target ? { ...serializeSantaPerson(target), gender: target.gender ?? null } : null,
    target_role: view.targetRole,
    note: entry.note ?? null,
    created_at: entry.created_at,
  };
}

/** The whole host log: the current game's entries and the alive / dead state derived from them. */
export function serializeMafiaLog(log: MafiaLogView): Record<string, unknown> {
  return {
    round: log.round,
    entries: log.entries.map(serializeMafiaLogEntry),
    state: log.state,
  };
}

// Spy DTOs. The location and the roles are secret until the round is finished: they reach a player
// only through their own card (serializeSpyCard), the layout (non-players), or a finished round.

export function serializeSpyEvent(event: SpyEvent): Record<string, unknown> {
  return {
    id: event.id,
    group_id: event.group_id,
    title: event.title,
    description: event.description ?? null,
    starts_at: event.starts_at ?? null,
    place: event.place ?? null,
    status: event.status,
    host_id: event.host_id ?? null,
    host: event.host ? serializeSantaPerson(event.host) : null,
    max_players: event.max_players,
    spy_count: event.spy_count ?? null,
    double_agent: event.double_agent,
    mr_white: event.mr_white,
    packs: event.packs,
    turn_seconds: event.turn_seconds ?? null,
    hint_after_cycles: event.hint_after_cycles ?? null,
    round: event.round,
  };
}

export function serializeSpyParticipant(p: SpyParticipant): Record<string, unknown> {
  return { user_id: p.user_id, ...serializeSantaPerson(p.user), is_active: p.is_active };
}

/**
 * The round as everyone may see it. `location_name`, `location_pack`, `outcome`, `outcome_reason`, `guess`,
 * `guessed_by` and the players' roles are added ONLY for a finished round; before that the keys are
 * absent altogether (not null), whatever the input carries. Built field by field: the entity is never spread.
 */
export function serializeSpyRound(view: SpyRoundView, turnSeconds: number | null = null): Record<string, unknown> {
  const { round } = view;
  const finished = round.status === SpyRoundStatus.FINISHED;
  const running = round.status === SpyRoundStatus.IN_PROGRESS;

  const dto: Record<string, unknown> = {
    id: round.id,
    number: round.number,
    status: round.status,
    cycle: round.cycle,
    turn_order: round.turn_order,
    current_user_id: running ? round.turn_order[round.turn_index] ?? null : null,
    deadline: running && round.turn_started_at ? turnDeadline(new Date(round.turn_started_at), turnSeconds) : null,
    started_at: round.started_at,
    finished_at: round.finished_at ?? null,
    players: view.players.map((p) => {
      const player: Record<string, unknown> = { user_id: p.user_id, ...serializeSantaPerson(p.user), is_eliminated: p.is_eliminated };
      if (finished) player['role'] = p.role;
      return player;
    }),
  };
  if (finished) {
    dto['location_name'] = round.location_name;
    dto['location_pack'] = round.location_pack;
    dto['outcome'] = round.outcome ?? null;
    dto['outcome_reason'] = round.outcome_reason ?? null;
    dto['guess'] = round.guess ?? null;
    dto['guessed_by'] = round.guessed_by ?? null;
  }
  return dto;
}

/** The caller's own card: the only place a role and the location reach a player during a round. */
export function serializeSpyCard(card: SpyCard): Record<string, unknown> {
  return {
    round: card.round,
    role: card.role,
    location: card.location,
    hint: card.hint,
    cycle: card.cycle,
    current_user_id: card.currentUserId,
    is_my_turn: card.isMyTurn,
    deadline: card.deadline,
  };
}

/** The ballot in progress: who has voted and the score, never whom a voter chose. */
export function serializeSpyVotingState(state: SpyVotingState): Record<string, unknown> {
  return {
    round_id: state.roundId,
    ballot: state.ballot,
    voter_ids: state.voterIds,
    counts: state.counts.map((c) => ({ user_id: c.userId, votes: c.votes })),
    leaders: state.leaders,
    candidate_ids: state.candidateIds ?? null,
  };
}

export function serializeSpyStats(stats: SpyPlayerStats): Record<string, unknown> {
  return {
    user_id: stats.user_id,
    ...(stats.user ? serializeSantaPerson(stats.user) : {}),
    rounds: stats.rounds,
    wins: stats.wins,
    spy_rounds: stats.spy_rounds,
    spy_wins: stats.spy_wins,
    exposed: stats.exposed,
    guessed: stats.guessed,
    win_rate: stats.win_rate,
  };
}

export function serializeSpyLocation(location: SpyLocation): Record<string, unknown> {
  return {
    id: location.id,
    name: location.name,
    pack: location.pack,
    group_id: location.group_id ?? null,
    is_active: location.is_active,
  };
}

/** One row of the full layout (served to non-players or after the round); carries the role. */
export function serializeSpyLayoutRow(row: SpyRoundPlayer): Record<string, unknown> {
  return { user_id: row.user_id, ...serializeSantaPerson(row.user), role: row.role, is_eliminated: row.is_eliminated };
}
