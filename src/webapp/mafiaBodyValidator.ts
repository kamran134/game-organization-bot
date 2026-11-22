import { ValidationError } from '../utils/errors';
import { MAFIA_MAX_PLAYERS, MAFIA_MIN_PLAYERS, MAFIA_ROLE_ORDER, RoleCounts } from '../utils/mafiaDeal';

const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_PLACE_LENGTH = 200;
const DEFAULT_MAX_PLAYERS = 10;

/** Fields of POST /api/mafia already validated; empty optional values are null. */
export interface ParsedMafiaEventBody {
  title: string;
  description: string | null;
  starts_at: Date | null;
  place: string | null;
  show_mafia_team: boolean;
  assign_seats: boolean;
  max_players: number;
}

/** Optional trimmed string: absent / empty → null. Throws when it is not a string or too long. */
function optionalText(value: unknown, maxLength: number, notStringError: string, tooLongError: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new ValidationError(notStringError);
  const text = value.trim();
  if (text.length > maxLength) throw new ValidationError(tooLongError);
  return text || null;
}

function parseStartsAt(value: unknown): Date | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new ValidationError('Invalid date');
  const text = value.trim();
  if (!text) return null;
  // Needs an explicit zone (the client sends toISOString()): a bare local time would be read as server time
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(text)) {
    throw new ValidationError('Invalid date');
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new ValidationError('Invalid date');
  return date;
}

function optionalFlag(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value !== 'boolean') throw new ValidationError('Invalid flag');
  return value;
}

function parseMaxPlayers(value: unknown): number {
  if (value === undefined || value === null) return DEFAULT_MAX_PLAYERS;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < MAFIA_MIN_PLAYERS || value > MAFIA_MAX_PLAYERS) {
    throw new ValidationError('Invalid max players');
  }
  return value;
}

/** Validates the body of POST /api/mafia. Throws ValidationError (message is safe to show). */
export function parseMafiaEventBody(body: unknown): ParsedMafiaEventBody {
  const raw = (body ?? {}) as Record<string, unknown>;

  if (typeof raw['title'] !== 'string' || !raw['title'].trim()) {
    throw new ValidationError('Title is required');
  }
  const title = raw['title'].trim();
  if (title.length > MAX_TITLE_LENGTH) throw new ValidationError('Title is too long');

  return {
    title,
    description: optionalText(raw['description'], MAX_DESCRIPTION_LENGTH, 'Invalid description', 'Description is too long'),
    starts_at: parseStartsAt(raw['starts_at']),
    place: optionalText(raw['place'], MAX_PLACE_LENGTH, 'Invalid place', 'Place is too long'),
    show_mafia_team: optionalFlag(raw['show_mafia_team'], true),
    assign_seats: optionalFlag(raw['assign_seats'], false),
    max_players: parseMaxPlayers(raw['max_players']),
  };
}

/**
 * Validates the shape of the optional `counts` of POST /api/mafia/:id/deal: absent → undefined,
 * otherwise every role present as a non-negative integer. Whether it fits the players is the service's check.
 */
export function parseRoleCountsBody(body: unknown): RoleCounts | undefined {
  const counts = (body as Record<string, unknown> | null | undefined)?.['counts'];
  if (counts === undefined || counts === null) return undefined;
  if (typeof counts !== 'object' || Array.isArray(counts)) throw new ValidationError('Invalid roles');

  const record = counts as Record<string, unknown>;
  const known = new Set<string>(MAFIA_ROLE_ORDER);
  if (Object.keys(record).some((key) => !known.has(key))) throw new ValidationError('Invalid roles');

  const result = {} as RoleCounts;
  for (const role of MAFIA_ROLE_ORDER) {
    const value = record[role];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new ValidationError('Invalid roles');
    result[role] = value;
  }
  return result;
}
