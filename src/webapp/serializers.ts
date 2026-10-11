import { Game } from '../models/Game';
import { GameParticipant } from '../models/GameParticipant';
import { Location } from '../models/Location';
import { User } from '../models/User';
import { Group } from '../models/Group';
import { Sport } from '../models/Sport';

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
