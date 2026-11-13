import { ValidationError } from '../utils/errors';

const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_BUDGET_LENGTH = 50;
const MAX_WISHLIST_LENGTH = 1000;

/** Fields of POST /api/santa already validated; empty optional values are null. */
export interface ParsedSantaEventBody {
  title: string;
  description: string | null;
  budget: string | null;
  exchange_date: string | null;
}

/** Optional trimmed string: absent / empty → null. Throws when it is not a string or too long. */
function optionalText(value: unknown, maxLength: number, notStringError: string, tooLongError: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new ValidationError(notStringError);
  const text = value.trim();
  if (text.length > maxLength) throw new ValidationError(tooLongError);
  return text || null;
}

function parseExchangeDate(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new ValidationError('Invalid exchange date');
  const text = value.trim();
  if (!text) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new ValidationError('Invalid exchange date');
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls 2026-02-30 over to March, so a mismatch means the day does not exist
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new ValidationError('Invalid exchange date');
  }
  return text;
}

/** Validates the body of POST /api/santa. Throws ValidationError (message is safe to show). */
export function parseSantaEventBody(body: unknown): ParsedSantaEventBody {
  const raw = (body ?? {}) as Record<string, unknown>;

  if (typeof raw['title'] !== 'string' || !raw['title'].trim()) {
    throw new ValidationError('Title is required');
  }
  const title = raw['title'].trim();
  if (title.length > MAX_TITLE_LENGTH) throw new ValidationError('Title is too long');

  return {
    title,
    description: optionalText(raw['description'], MAX_DESCRIPTION_LENGTH, 'Invalid description', 'Description is too long'),
    budget: optionalText(raw['budget'], MAX_BUDGET_LENGTH, 'Invalid budget', 'Budget is too long'),
    exchange_date: parseExchangeDate(raw['exchange_date']),
  };
}

/** Validates a wishlist value: absent / empty → null. Throws ValidationError. */
export function parseWishlist(value: unknown): string | null {
  return optionalText(value, MAX_WISHLIST_LENGTH, 'Invalid wishlist', 'Wishlist is too long');
}
