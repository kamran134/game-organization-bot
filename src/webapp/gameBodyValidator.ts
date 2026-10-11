import { ValidationError } from '../utils/errors';

/** 999 is the "unlimited" sentinel used for trainings (see TrainingCreationFlow). */
export const MAX_PARTICIPANTS_LIMIT = 999;
const MAX_NOTES_LENGTH = 1000;
// games.cost is DECIMAL(10, 2)
const MAX_COST = 99_999_999.99;
const DEFAULT_MIN_PARTICIPANTS = 2;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/** Fields of POST/PUT /api/games already validated and converted to their DB types. */
export interface ParsedGameBody {
  sport_id?: number;
  location_id?: number;
  game_date?: Date;
  min_participants?: number;
  max_participants?: number;
  /** null = clear the value (PUT only). */
  cost?: number | null;
  notes?: string | null;
}

export type GameBodyMode = 'create' | 'update';

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function parseInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new ValidationError(`${label}: некорректное значение`);
  }
  const num = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isInteger(num)) {
    throw new ValidationError(`${label}: должно быть целым числом`);
  }
  return num;
}

function parseId(value: unknown, label: string): number {
  const id = parseInteger(value, label);
  if (id < 1) throw new ValidationError(`${label}: некорректное значение`);
  return id;
}

function parseParticipants(value: unknown, label: string): number {
  const num = parseInteger(value, label);
  if (num < 1 || num > MAX_PARTICIPANTS_LIMIT) {
    throw new ValidationError(`${label}: допустимо от 1 до ${MAX_PARTICIPANTS_LIMIT}`);
  }
  return num;
}

function parseCost(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new ValidationError('Стоимость: некорректное значение');
  }
  const num = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isFinite(num) || num < 0 || num > MAX_COST) {
    throw new ValidationError('Стоимость: должно быть числом от 0');
  }
  return num;
}

function parseDate(value: unknown): Date {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new ValidationError('Дата: некорректное значение');
  }
  const date = new Date(value);
  const year = date.getFullYear();
  if (Number.isNaN(date.getTime()) || year < MIN_YEAR || year > MAX_YEAR) {
    throw new ValidationError('Дата: некорректное значение');
  }
  return date;
}

/**
 * Validates and normalises the body of POST (create) / PUT (update) /api/games.
 *
 * create: sport_id, game_date, location_id and max_participants are required; min defaults to 2
 *   (capped by max); empty cost/notes are simply omitted.
 * update: every field is optional; an absent field is left untouched, while an empty
 *   cost/notes explicitly clears the column (null).
 * Throws ValidationError (message is safe to show the user).
 */
export function parseGameBody(body: unknown, mode: GameBodyMode): ParsedGameBody {
  const raw = (body ?? {}) as Record<string, unknown>;
  const result: ParsedGameBody = {};

  const required = (key: string, label: string): void => {
    if (mode === 'create' && isBlank(raw[key])) {
      throw new ValidationError(`${label}: обязательное поле`);
    }
  };

  required('sport_id', 'Вид спорта');
  if (!isBlank(raw['sport_id'])) result.sport_id = parseId(raw['sport_id'], 'Вид спорта');

  required('location_id', 'Площадка');
  if (!isBlank(raw['location_id'])) result.location_id = parseId(raw['location_id'], 'Площадка');

  required('game_date', 'Дата');
  if (!isBlank(raw['game_date'])) result.game_date = parseDate(raw['game_date']);

  required('max_participants', 'Макс. игроков');
  if (!isBlank(raw['max_participants'])) {
    result.max_participants = parseParticipants(raw['max_participants'], 'Макс. игроков');
  }

  if (!isBlank(raw['min_participants'])) {
    result.min_participants = parseParticipants(raw['min_participants'], 'Мин. игроков');
  } else if (mode === 'create' && result.max_participants !== undefined) {
    result.min_participants = Math.min(DEFAULT_MIN_PARTICIPANTS, result.max_participants);
  }

  if (
    result.min_participants !== undefined &&
    result.max_participants !== undefined &&
    result.min_participants > result.max_participants
  ) {
    throw new ValidationError('Мин. игроков не может быть больше макс.');
  }

  if (isBlank(raw['cost'])) {
    if (mode === 'update' && raw['cost'] !== undefined) result.cost = null;
  } else {
    result.cost = parseCost(raw['cost']);
  }

  if (raw['notes'] !== undefined && raw['notes'] !== null && typeof raw['notes'] !== 'string') {
    throw new ValidationError('Заметки: некорректное значение');
  }
  const notes = typeof raw['notes'] === 'string' ? raw['notes'].trim() : '';
  if (notes.length > MAX_NOTES_LENGTH) {
    throw new ValidationError(`Заметки: не длиннее ${MAX_NOTES_LENGTH} символов`);
  }
  if (notes) {
    result.notes = notes;
  } else if (mode === 'update' && raw['notes'] !== undefined) {
    result.notes = null;
  }

  return result;
}
