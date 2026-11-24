import { Gender, isGender } from '../models/Gender';
import { ValidationError } from '../utils/errors';

/**
 * Gender straight from a request body. The single place the value is checked:
 * absent means "leave as is", explicit null clears it, anything else is rejected
 * rather than silently dropped.
 */
export function parseGenderField(value: unknown): Gender | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!isGender(value)) throw new ValidationError('Invalid gender');
  return value;
}

/** First name of a profile update: required when present, trimmed, never empty. */
export function parseFirstNameField(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError('first_name is required');
  return value.trim();
}

/** Last name of a profile update: absent leaves it untouched, '' clears it. */
export function parseLastNameField(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new ValidationError('Invalid last_name');
  return value.trim();
}
