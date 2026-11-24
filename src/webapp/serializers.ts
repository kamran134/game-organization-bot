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
import type { MafiaCard, MafiaLayoutRow } from '../services/MafiaService';

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
