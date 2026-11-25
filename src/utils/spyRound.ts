import { ValidationError } from './errors';

/**
 * Moves the turn to the next player who is still in the game. `cycle` goes up each time the turn
 * wraps past the end of the order. Throws ValidationError when nobody is left.
 */
export function advanceTurn(
  order: number[],
  index: number,
  cycle: number,
  eliminated: Set<number>,
): { index: number; cycle: number } {
  let nextIndex = index;
  let nextCycle = cycle;
  for (let step = 0; step < order.length; step++) {
    nextIndex++;
    if (nextIndex >= order.length) {
      nextIndex = 0;
      nextCycle++;
    }
    if (!eliminated.has(order[nextIndex])) return { index: nextIndex, cycle: nextCycle };
  }
  throw new ValidationError('No players left to take a turn');
}

/** The spy gets a hint once more than `hintAfterCycles` full cycles have gone by. */
export function shouldHint(cycle: number, hintAfterCycles: number | null): boolean {
  return hintAfterCycles !== null && cycle > hintAfterCycles;
}

/** When the current turn runs out; `null` when the event has no turn timer. */
export function turnDeadline(turnStartedAt: Date, turnSeconds: number | null): Date | null {
  if (turnSeconds === null) return null;
  return new Date(turnStartedAt.getTime() + turnSeconds * 1000);
}

export interface SpyPack {
  id: string;
  title: string;
  emoji: string;
  adult: boolean;
}

/** Bounds of the per-turn timer, in seconds; mirrored by chk_spy_events_turn_seconds. */
export const SPY_TURN_SECONDS_MIN = 15;
export const SPY_TURN_SECONDS_MAX = 300;
/** Bounds of "hint the spy after N cycles"; mirrored by chk_spy_events_hint_after_cycles. */
export const SPY_HINT_CYCLES_MIN = 1;
export const SPY_HINT_CYCLES_MAX = 10;

export const SPY_PACKS: readonly SpyPack[] = [
  { id: 'base', title: 'Классика', emoji: '🏛', adult: false },
  { id: 'city', title: 'Баку и город', emoji: '🌆', adult: false },
  { id: 'movies', title: 'Кино и сериалы', emoji: '🎬', adult: false },
  { id: 'work', title: 'Работа и профессии', emoji: '💼', adult: false },
  { id: 'adult', title: '18+', emoji: '🔞', adult: true },
  { id: 'custom', title: 'Свои локации', emoji: '📍', adult: false },
];
