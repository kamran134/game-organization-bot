import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAFIA_MAX_PLAYERS,
  MAFIA_MIN_PLAYERS,
  MAFIA_CARD_VARIANTS,
  MafiaRole,
  RoleCounts,
  dealRoles,
  suggestRoleCounts,
  validateRoleCounts,
} from '../../utils/mafiaDeal';
import { ValidationError } from '../../utils/errors';

/** Small deterministic PRNG so shuffles are reproducible. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function counts(partial: Partial<RoleCounts>): RoleCounts {
  return {
    civilian: 0, mafia: 0, don: 0, commissar: 0, doctor: 0, maniac: 0, lover: 0,
    ...partial,
  };
}

const ids = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

describe('suggestRoleCounts', () => {
  const table: Array<[number, Partial<RoleCounts>]> = [
    [4, { mafia: 1, civilian: 3 }],
    [5, { mafia: 1, commissar: 1, civilian: 3 }],
    [6, { don: 1, mafia: 1, commissar: 1, civilian: 3 }],
    [7, { don: 1, mafia: 1, commissar: 1, doctor: 1, civilian: 3 }],
    [10, { don: 1, mafia: 2, commissar: 1, doctor: 1, civilian: 5 }],
    [12, { don: 1, mafia: 3, commissar: 1, doctor: 1, civilian: 6 }],
  ];
  for (const [n, expected] of table) {
    test(`n = ${n}`, () => {
      assert.deepEqual(suggestRoleCounts(n), counts(expected));
    });
  }

  test('every suggestion is valid for the whole supported range', () => {
    for (let n = MAFIA_MIN_PLAYERS; n <= MAFIA_MAX_PLAYERS; n++) {
      validateRoleCounts(suggestRoleCounts(n), n);
    }
  });
});

describe('validateRoleCounts', () => {
  const ok = counts({ mafia: 1, civilian: 3 });

  test('accepts a playable layout', () => {
    validateRoleCounts(ok, 4);
  });

  test('rejects a missing, unknown or non-integer value', () => {
    const missing: Record<string, number> = { ...ok };
    delete missing['lover'];
    assert.throws(() => validateRoleCounts(missing, 4), ValidationError);
    assert.throws(() => validateRoleCounts({ ...ok, witch: 1 }, 4), ValidationError);
    assert.throws(() => validateRoleCounts({ ...ok, civilian: 2.5 }, 4), ValidationError);
    assert.throws(() => validateRoleCounts({ ...ok, civilian: '3' }, 4), ValidationError);
    assert.throws(() => validateRoleCounts({ ...ok, civilian: 4, doctor: -1 }, 4), ValidationError);
    assert.throws(() => validateRoleCounts(null, 4), ValidationError);
  });

  test('rejects a sum that differs from the player count', () => {
    assert.throws(() => validateRoleCounts(ok, 5), ValidationError);
    assert.throws(() => validateRoleCounts(counts({ mafia: 1, civilian: 4 }), 4), ValidationError);
  });

  test('requires at least one mafia or don', () => {
    assert.throws(() => validateRoleCounts(counts({ civilian: 4 }), 4), ValidationError);
    validateRoleCounts(counts({ don: 1, civilian: 3 }), 4);
  });

  test('don, commissar, doctor, maniac and lover are at most one each', () => {
    for (const role of ['don', 'commissar', 'doctor', 'maniac', 'lover'] as const) {
      const c = counts({ mafia: 1, civilian: 6, [role]: 2 });
      assert.throws(() => validateRoleCounts(c, 9), ValidationError, role);
    }
  });

  test('the mafia team must be a strict minority', () => {
    assert.throws(() => validateRoleCounts(counts({ mafia: 2, civilian: 2 }), 4), ValidationError);
    assert.throws(() => validateRoleCounts(counts({ mafia: 2, don: 1, civilian: 3 }), 6), ValidationError);
    validateRoleCounts(counts({ mafia: 2, don: 1, civilian: 4 }), 7);
  });
});

describe('dealRoles', () => {
  const layout = suggestRoleCounts(10);

  test('hands out exactly the requested counts', () => {
    const result = dealRoles(ids(10), layout, { assignSeats: false });
    assert.equal(result.size, 10);
    const tally = counts({});
    for (const { role } of result.values()) tally[role]++;
    assert.deepEqual(tally, layout);
  });

  test('seats are a permutation of 1..n, or null when off', () => {
    const seated = dealRoles(ids(10), layout, { assignSeats: true });
    assert.deepEqual([...seated.values()].map((d) => d.seat).sort((a, b) => a! - b!), ids(10));

    const unseated = dealRoles(ids(10), layout, { assignSeats: false });
    assert.ok([...unseated.values()].every((d) => d.seat === null));
  });

  test('players with the same role get different images while variants last', () => {
    const c = counts({ mafia: 1, civilian: 5 });
    const result = dealRoles(ids(6), c, { assignSeats: false }, seeded(7));
    const civilians = [...result.values()].filter((d) => d.role === MafiaRole.CIVILIAN);
    assert.equal(civilians.length, 5);
    assert.deepEqual(civilians.map((d) => d.variant).sort(), [1, 2, 3, 4, 5]);
  });

  test('variants stay within the role image count and wrap around when exhausted', () => {
    const result = dealRoles(ids(12), suggestRoleCounts(12), { assignSeats: false }, seeded(3));
    for (const { role, variant } of result.values()) {
      assert.ok(variant >= 1 && variant <= MAFIA_CARD_VARIANTS[role], `${role} ${variant}`);
    }
    const mafias = [...result.values()].filter((d) => d.role === MafiaRole.MAFIA);
    assert.equal(mafias.length, 3);
    assert.ok(mafias.every((d) => d.variant === 1));
  });

  test('a seeded random makes the deal deterministic', () => {
    const a = dealRoles(ids(10), layout, { assignSeats: true }, seeded(42));
    const b = dealRoles(ids(10), layout, { assignSeats: true }, seeded(42));
    assert.deepEqual([...a.entries()], [...b.entries()]);

    const c = dealRoles(ids(10), layout, { assignSeats: true }, seeded(43));
    assert.notDeepEqual([...a.entries()], [...c.entries()]);
  });

  test('rejects duplicate ids and out-of-range player counts', () => {
    assert.throws(() => dealRoles([1, 2, 3, 3], suggestRoleCounts(4), { assignSeats: false }), ValidationError);
    assert.throws(() => dealRoles(ids(3), counts({ mafia: 1, civilian: 2 }), { assignSeats: false }), ValidationError);
    const big = MAFIA_MAX_PLAYERS + 1;
    assert.throws(() => dealRoles(ids(big), suggestRoleCounts(big), { assignSeats: false }), ValidationError);
  });

  test('rejects counts that do not fit the players', () => {
    assert.throws(() => dealRoles(ids(5), suggestRoleCounts(4), { assignSeats: false }), ValidationError);
  });
});
