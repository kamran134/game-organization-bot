import { ValidationError } from '../utils/errors';
import { MafiaLogPhase, MafiaLogType } from '../models/MafiaLogEntry';
import { MAFIA_MAX_PLAYERS, MAFIA_MIN_PLAYERS, MAFIA_ROLE_ORDER, RoleCounts } from '../utils/mafiaDeal';

const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_PLACE_LENGTH = 200;
const DEFAULT_MAX_PLAYERS = 10;
const MAX_LOG_NOTE_LENGTH = 500;
const MAX_LOG_CYCLE = 50;

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

/** Fields of POST /api/mafia/:id/log already validated. */
export interface ParsedMafiaLogBody {
  cycle: number;
  phase: MafiaLogPhase;
  type: MafiaLogType;
  target_user_id: number | null;
  note: string | null;
}

/** The phase each entry type can happen in; a note belongs to either. */
const LOG_PHASES: Record<MafiaLogType, MafiaLogPhase[]> = {
  [MafiaLogType.KILL]: [MafiaLogPhase.NIGHT],
  [MafiaLogType.HEAL]: [MafiaLogPhase.NIGHT],
  [MafiaLogType.CHECK]: [MafiaLogPhase.NIGHT],
  [MafiaLogType.BLOCK]: [MafiaLogPhase.NIGHT],
  [MafiaLogType.LYNCH]: [MafiaLogPhase.DAY],
  [MafiaLogType.NOTE]: [MafiaLogPhase.NIGHT, MafiaLogPhase.DAY],
};

/** Validates the body of POST /api/mafia/:id/log. Throws ValidationError (message is safe to show). */
export function parseMafiaLogBody(body: unknown): ParsedMafiaLogBody {
  const raw = (body ?? {}) as Record<string, unknown>;

  const cycle = raw['cycle'];
  if (typeof cycle !== 'number' || !Number.isInteger(cycle) || cycle < 1 || cycle > MAX_LOG_CYCLE) {
    throw new ValidationError('Invalid cycle');
  }

  const type = Object.values(MafiaLogType).find((t) => t === raw['type']);
  if (!type) throw new ValidationError('Invalid entry type');
  const phase = Object.values(MafiaLogPhase).find((p) => p === raw['phase']);
  if (!phase) throw new ValidationError('Invalid phase');
  if (!LOG_PHASES[type].includes(phase)) throw new ValidationError('Invalid phase for this entry');

  const rawTarget = raw['target_user_id'];
  let target: number | null = null;
  if (rawTarget !== undefined && rawTarget !== null) {
    if (typeof rawTarget !== 'number' || !Number.isInteger(rawTarget) || rawTarget < 1) {
      throw new ValidationError('Target is required');
    }
    target = rawTarget;
  }
  if (type !== MafiaLogType.NOTE && target === null) throw new ValidationError('Target is required');

  const note = optionalText(raw['note'], MAX_LOG_NOTE_LENGTH, 'Invalid note', 'Note is too long');
  if (type === MafiaLogType.NOTE && note === null) throw new ValidationError('Note is required');

  return { cycle, phase, type, target_user_id: target, note };
}
