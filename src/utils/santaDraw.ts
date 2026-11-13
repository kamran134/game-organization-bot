import { ValidationError } from './errors';

export const SANTA_MIN_PARTICIPANTS = 3;

/** Maps giver userId → receiver userId as one single cycle over all ids (no self-gifts, no mutual pairs for n ≥ 3). */
export function buildSantaCycle(
  userIds: readonly number[],
  random: () => number = Math.random,
): Map<number, number> {
  if (new Set(userIds).size !== userIds.length) {
    throw new ValidationError('Duplicate participants');
  }
  if (userIds.length < SANTA_MIN_PARTICIPANTS) {
    throw new ValidationError('Not enough participants');
  }

  const shuffled = [...userIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // One cycle (not independent pairs) guarantees nobody gets themselves and nobody swaps with a single person
  const result = new Map<number, number>();
  for (let i = 0; i < shuffled.length; i++) {
    result.set(shuffled[i], shuffled[(i + 1) % shuffled.length]);
  }
  return result;
}
