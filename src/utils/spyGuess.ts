export type GuessResult = 'correct' | 'close' | 'wrong';

/** Similarity (0..100) from which a guess counts as a hit. */
export const GUESS_CORRECT_THRESHOLD = 85;
/** Similarity (0..100) from which a guess counts as close, so the round goes on. */
export const GUESS_CLOSE_THRESHOLD = 70;

/** Trims, lower-cases, folds `ё` to `е`, collapses whitespace and strips edge punctuation. */
export function normalizeGuess(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .trim();
}

/**
 * Similarity of two strings on a 0..100 scale: a normalised Levenshtein (indel) ratio,
 * `2 * LCS / (|a| + |b|)`, the same metric as rapidfuzz `fuzz.ratio`.
 */
export function similarity(a: string, b: string): number {
  const total = a.length + b.length;
  if (total === 0) return 100;
  if (a.length === 0 || b.length === 0) return 0;

  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const curr = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    prev = curr;
  }
  return (2 * prev[b.length] * 100) / total;
}

/** Compares a spy's guess with the location name; both sides are normalised first. */
export function classifyGuess(guess: string, location: string): GuessResult {
  const normalizedGuess = normalizeGuess(guess);
  if (normalizedGuess === '') return 'wrong';
  const score = similarity(normalizedGuess, normalizeGuess(location));
  if (score >= GUESS_CORRECT_THRESHOLD) return 'correct';
  if (score >= GUESS_CLOSE_THRESHOLD) return 'close';
  return 'wrong';
}
