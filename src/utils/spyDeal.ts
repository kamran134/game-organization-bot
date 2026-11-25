import { SpyRole, SpyTeam } from '../models/SpyRole';
import { ValidationError } from './errors';

export { SpyRole };
export type { SpyTeam };

export const SPY_MIN_PLAYERS = 3;
export const SPY_MAX_PLAYERS = 20;

/** Minimum players for the optional roles. */
const DOUBLE_AGENT_MIN_PLAYERS = 6;
const MR_WHITE_MIN_PLAYERS = 5;
/** Plain civilians that must remain after the optional roles are dealt. */
const MIN_CIVILIANS = 2;

export const SPY_ROLE_NAME: Record<SpyRole, string> = {
  [SpyRole.CIVILIAN]: 'Мирный',
  [SpyRole.SPY]: 'Шпион',
  [SpyRole.DOUBLE_AGENT]: 'Двойной агент',
  [SpyRole.MR_WHITE]: 'Мистер Белый',
};

export const SPY_ROLE_DESCRIPTION: Record<SpyRole, string> = {
  [SpyRole.CIVILIAN]: 'Вы знаете локацию. Найдите шпиона, не выдав место.',
  [SpyRole.SPY]: 'Вы не знаете локацию. Поймите, где вы, или угадайте её.',
  [SpyRole.DOUBLE_AGENT]: 'Вы знаете локацию, но играете за шпионов. Не дайте себя разоблачить.',
  [SpyRole.MR_WHITE]: 'Вы считаете себя мирным, но не помните, где находитесь. Выкручивайтесь.',
};

export const SPY_ROLE_TEAM: Record<SpyRole, SpyTeam> = {
  [SpyRole.CIVILIAN]: 'town',
  [SpyRole.SPY]: 'spies',
  [SpyRole.DOUBLE_AGENT]: 'spies',
  [SpyRole.MR_WHITE]: 'spies',
};

/** Spies take a fifth of the table, at least one and always a strict minority. */
export function suggestSpyCount(n: number): number {
  const max = Math.floor((n - 1) / 2);
  return Math.min(Math.max(1, Math.round(n * 0.2)), max);
}

/** Throws ValidationError unless `count` is an integer within [1, floor((n - 1) / 2)]. */
export function validateSpyCount(count: unknown, n: number): asserts count is number {
  if (
    typeof count !== 'number' ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > Math.floor((n - 1) / 2)
  ) {
    throw new ValidationError('Invalid spy count');
  }
}

export interface SpyDealOptions {
  /** `null` / `undefined` = automatic, see suggestSpyCount. */
  spyCount?: number | null;
  doubleAgent?: boolean;
  mrWhite?: boolean;
}

export interface DealtSpyRole {
  userId: number;
  role: SpyRole;
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Deals roles to the players, keeping the input order in the result. Spies are picked first, then
 * the double agent (n >= 6), then Mr. White (n >= 5). An optional role that would leave fewer than
 * two plain civilians is silently skipped.
 */
export function dealRoles(
  userIds: readonly number[],
  options: SpyDealOptions,
  random: () => number = Math.random,
): DealtSpyRole[] {
  if (new Set(userIds).size !== userIds.length) throw new ValidationError('Duplicate players');
  const n = userIds.length;
  if (n < SPY_MIN_PLAYERS || n > SPY_MAX_PLAYERS) throw new ValidationError('Wrong number of players');

  const spyCount = options.spyCount ?? suggestSpyCount(n);
  validateSpyCount(spyCount, n);

  const picked = shuffle(userIds, random);
  const roleOf = new Map<number, SpyRole>();
  for (const userId of picked.slice(0, spyCount)) roleOf.set(userId, SpyRole.SPY);

  let civilians = n - spyCount;
  const rest = picked.slice(spyCount);
  const dealOptional = (enabled: boolean | undefined, minPlayers: number, role: SpyRole): void => {
    if (!enabled || n < minPlayers || civilians - 1 < MIN_CIVILIANS) return;
    roleOf.set(rest.shift()!, role);
    civilians--;
  };
  dealOptional(options.doubleAgent, DOUBLE_AGENT_MIN_PLAYERS, SpyRole.DOUBLE_AGENT);
  dealOptional(options.mrWhite, MR_WHITE_MIN_PLAYERS, SpyRole.MR_WHITE);

  return userIds.map((userId) => ({ userId, role: roleOf.get(userId) ?? SpyRole.CIVILIAN }));
}

/** Random speaking order for a round. */
export function shuffleOrder(userIds: number[], random: () => number = Math.random): number[] {
  return shuffle(userIds, random);
}
