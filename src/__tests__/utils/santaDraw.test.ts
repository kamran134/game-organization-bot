import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSantaCycle, SANTA_MIN_PARTICIPANTS } from '../../utils/santaDraw';
import { ValidationError } from '../../utils/errors';

/** Deterministic PRNG (mulberry32) so failures are reproducible. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ids(n: number): number[] {
  return Array.from({ length: n }, (_, i) => 100 + i * 7);
}

describe('buildSantaCycle', () => {
  for (let n = 3; n <= 30; n++) {
    test(`n = ${n}: a permutation, no self-gifts, one cycle, no mutual pairs`, () => {
      const users = ids(n);
      const map = buildSantaCycle(users, seeded(n));

      assert.equal(map.size, n);
      assert.deepEqual([...map.keys()].sort((a, b) => a - b), users);
      assert.deepEqual([...map.values()].sort((a, b) => a - b), users);

      for (const [giver, receiver] of map) {
        assert.notEqual(giver, receiver);
        assert.notEqual(map.get(receiver), giver);
      }

      let current = users[0];
      let steps = 0;
      do {
        current = map.get(current)!;
        steps++;
      } while (current !== users[0] && steps <= n);
      assert.equal(steps, n);
    });
  }

  test('is deterministic for the same seed', () => {
    const a = buildSantaCycle(ids(10), seeded(42));
    const b = buildSantaCycle(ids(10), seeded(42));
    assert.deepEqual([...a.entries()], [...b.entries()]);
  });

  test('works with the default random source', () => {
    assert.equal(buildSantaCycle(ids(5)).size, 5);
  });

  test('throws ValidationError for fewer than the minimum participants', () => {
    for (let n = 0; n < SANTA_MIN_PARTICIPANTS; n++) {
      assert.throws(() => buildSantaCycle(ids(n)), ValidationError);
    }
  });

  test('throws ValidationError for duplicate ids', () => {
    assert.throws(() => buildSantaCycle([1, 2, 3, 3]), ValidationError);
  });
});
