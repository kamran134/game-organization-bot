import { ValidationError } from '../utils/errors';
import { SPY_MAX_PLAYERS, SPY_MIN_PLAYERS } from '../utils/spyDeal';
import {
  SPY_PACKS,
  SPY_TURN_SECONDS_MIN as TURN_SECONDS_MIN,
  SPY_TURN_SECONDS_MAX as TURN_SECONDS_MAX,
  SPY_HINT_CYCLES_MIN as HINT_CYCLES_MIN,
  SPY_HINT_CYCLES_MAX as HINT_CYCLES_MAX,
} from '../utils/spyRound';
import type { SpyEventInput, SpySettingsInput } from '../services/SpyService';

const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_PLACE_LENGTH = 200;
const MAX_LOCATION_NAME_LENGTH = 100;
const MAX_GUESS_LENGTH = 200;

type RawBody = Record<string, unknown>;

function asRecord(body: unknown): RawBody {
  return (body ?? {}) as RawBody;
}

function isIntInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/** Positive integer id: a JSON number, never a numeric string. */
function requireId(value: unknown, error: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new ValidationError(error);
  return value;
}

/** Trimmed string: empty / null → null. Throws when it is not a string or too long. */
function nullableText(value: unknown, maxLength: number, notStringError: string, tooLongError: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new ValidationError(notStringError);
  const text = value.trim();
  if (text.length > maxLength) throw new ValidationError(tooLongError);
  return text || null;
}

function parseStartsAt(value: unknown): Date | null {
  if (value === null) return null;
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

function parseFlag(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new ValidationError('Invalid flag');
  return value;
}

function parsePacks(value: unknown): string[] {
  const known = new Set(SPY_PACKS.map((p) => p.id));
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((p) => typeof p !== 'string' || !known.has(p)) ||
    new Set(value).size !== value.length
  ) {
    throw new ValidationError('Invalid packs');
  }
  return [...(value as string[])];
}

/** Validates the keys that are present; an absent (undefined) key stays absent. `null` is accepted where the column is nullable. */
function parseSettingsFields(raw: RawBody): SpySettingsInput {
  const out: SpySettingsInput = {};

  if (raw['description'] !== undefined) {
    out.description = nullableText(raw['description'], MAX_DESCRIPTION_LENGTH, 'Invalid description', 'Description is too long');
  }
  if (raw['place'] !== undefined) {
    out.place = nullableText(raw['place'], MAX_PLACE_LENGTH, 'Invalid place', 'Place is too long');
  }
  if (raw['starts_at'] !== undefined) out.starts_at = parseStartsAt(raw['starts_at']);

  if (raw['max_players'] !== undefined) {
    if (!isIntInRange(raw['max_players'], SPY_MIN_PLAYERS, SPY_MAX_PLAYERS)) throw new ValidationError('Invalid max players');
    out.max_players = raw['max_players'];
  }
  if (raw['spy_count'] !== undefined) {
    const spyCount = raw['spy_count'];
    // The upper bound depends on max_players, which the service checks
    if (spyCount !== null && !isIntInRange(spyCount, 1, SPY_MAX_PLAYERS)) throw new ValidationError('Invalid spy count');
    out.spy_count = spyCount;
  }
  if (raw['double_agent'] !== undefined) out.double_agent = parseFlag(raw['double_agent']);
  if (raw['mr_white'] !== undefined) out.mr_white = parseFlag(raw['mr_white']);
  if (raw['packs'] !== undefined) out.packs = parsePacks(raw['packs']);

  if (raw['turn_seconds'] !== undefined) {
    const seconds = raw['turn_seconds'];
    if (seconds !== null && !isIntInRange(seconds, TURN_SECONDS_MIN, TURN_SECONDS_MAX)) throw new ValidationError('Invalid turn time');
    out.turn_seconds = seconds;
  }
  if (raw['hint_after_cycles'] !== undefined) {
    const cycles = raw['hint_after_cycles'];
    if (cycles !== null && !isIntInRange(cycles, HINT_CYCLES_MIN, HINT_CYCLES_MAX)) throw new ValidationError('Invalid hint cycles');
    out.hint_after_cycles = cycles;
  }
  return out;
}

function parseTitle(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError('Title is required');
  const title = value.trim();
  if (title.length > MAX_TITLE_LENGTH) throw new ValidationError('Title is too long');
  return title;
}

/** Validates the body of POST /api/spy. Absent optional keys are left for the service defaults. */
export function parseSpyEventBody(body: unknown): SpyEventInput {
  const raw = asRecord(body);
  return { ...parseSettingsFields(raw), title: parseTitle(raw['title']) };
}

/** Validates the body of PATCH /api/spy/:id: a partial update, absent keys stay as they are. */
export function parseSpySettingsBody(body: unknown): SpySettingsInput {
  const raw = asRecord(body);
  const settings = parseSettingsFields(raw);
  if (raw['title'] !== undefined) settings.title = parseTitle(raw['title']);
  if (Object.keys(settings).length === 0) throw new ValidationError('Nothing to update');
  return settings;
}

/** POST /api/spy/:id/rounds/current/vote */
export function parseSpyVoteBody(body: unknown): { target_id: number } {
  return { target_id: requireId(asRecord(body)['target_id'], 'Invalid target') };
}

/** POST /api/spy/:id/rounds/current/guess */
export function parseSpyGuessBody(body: unknown): { guess: string } {
  const guess = asRecord(body)['guess'];
  if (typeof guess !== 'string' || !guess.trim()) throw new ValidationError('Guess is required');
  const text = guess.trim();
  if (text.length > MAX_GUESS_LENGTH) throw new ValidationError('Guess is too long');
  return { guess: text };
}

/** POST /api/spy/locations */
export function parseSpyLocationBody(body: unknown): { group_id: number; name: string } {
  const raw = asRecord(body);
  const groupId = requireId(raw['group_id'], 'Invalid group_id');
  if (typeof raw['name'] !== 'string' || !raw['name'].trim()) throw new ValidationError('Name is required');
  const name = raw['name'].trim();
  if (name.length > MAX_LOCATION_NAME_LENGTH) throw new ValidationError('Name is too long');
  return { group_id: groupId, name };
}

/** POST /api/spy/:id/rounds/current/eliminate */
export function parseSpyEliminateBody(body: unknown): { user_id: number; eliminated: boolean } {
  const raw = asRecord(body);
  const userId = requireId(raw['user_id'], 'Invalid user id');
  if (typeof raw['eliminated'] !== 'boolean') throw new ValidationError('Invalid flag');
  return { user_id: userId, eliminated: raw['eliminated'] };
}

/** PATCH /api/spy/:id/participants/:userId */
export function parseSpyParticipantActiveBody(body: unknown): { is_active: boolean } {
  const isActive = asRecord(body)['is_active'];
  if (typeof isActive !== 'boolean') throw new ValidationError('Invalid flag');
  return { is_active: isActive };
}

/** POST /api/spy/:id/rounds/current/next: `force` is optional and defaults to false. */
export function parseSpyNextBody(body: unknown): { force: boolean } {
  const force = asRecord(body)['force'];
  if (force === undefined || force === null) return { force: false };
  if (typeof force !== 'boolean') throw new ValidationError('Invalid flag');
  return { force };
}
