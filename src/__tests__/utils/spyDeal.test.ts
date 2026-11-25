import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DealtSpyRole,
  SPY_MAX_PLAYERS,
  SPY_MIN_PLAYERS,
  SPY_ROLE_DESCRIPTION,
  SPY_ROLE_NAME,
  SPY_ROLE_TEAM,
  SpyRole,
  dealRoles,
  shuffleOrder,
  suggestSpyCount,
  validateSpyCount,
} from '../../utils/spyDeal';
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

const ids = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

function countRoles(dealt: DealtSpyRole[]): Record<SpyRole, number> {
  const result = {
    [SpyRole.CIVILIAN]: 0,
    [SpyRole.SPY]: 0,
    [SpyRole.DOUBLE_AGENT]: 0,
    [SpyRole.MR_WHITE]: 0,
  };
  for (const { role } of dealt) result[role]++;
  return result;
}

describe('constants', () => {
  test('player bounds', () => {
    assert.equal(SPY_MIN_PLAYERS, 3);
    assert.equal(SPY_MAX_PLAYERS, 20);
  });

  test('every role has a name, description and team', () => {
    for (const role of Object.values(SpyRole)) {
      assert.ok(SPY_ROLE_NAME[role]);
      assert.ok(SPY_ROLE_DESCRIPTION[role]);
    }
    assert.equal(SPY_ROLE_TEAM[SpyRole.CIVILIAN], 'town');
    assert.equal(SPY_ROLE_TEAM[SpyRole.SPY], 'spies');
    assert.equal(SPY_ROLE_TEAM[SpyRole.DOUBLE_AGENT], 'spies');
    assert.equal(SPY_ROLE_TEAM[SpyRole.MR_WHITE], 'spies');
  });
});

describe('suggestSpyCount', () => {
  const table: Array<[number, number]> = [
    [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 2], [10, 2], [12, 2], [13, 3], [15, 3], [20, 4],
  ];
  for (const [n, expected] of table) {
    test(`${n} players -> ${expected}`, () => assert.equal(suggestSpyCount(n), expected));
  }

  test('always a valid count for every supported size', () => {
    for (let n = SPY_MIN_PLAYERS; n <= SPY_MAX_PLAYERS; n++) {
      assert.doesNotThrow(() => validateSpyCount(suggestSpyCount(n), n));
    }
  });
});

describe('validateSpyCount', () => {
  test('accepts 1 up to floor((n - 1) / 2)', () => {
    assert.doesNotThrow(() => validateSpyCount(1, 3));
    assert.doesNotThrow(() => validateSpyCount(2, 5));
    assert.doesNotThrow(() => validateSpyCount(3, 7));
    assert.doesNotThrow(() => validateSpyCount(3, 8));
  });

  test('rejects values out of range', () => {
    assert.throws(() => validateSpyCount(0, 5), ValidationError);
    assert.throws(() => validateSpyCount(-1, 5), ValidationError);
    assert.throws(() => validateSpyCount(2, 4), ValidationError);
    assert.throws(() => validateSpyCount(3, 6), ValidationError);
  });

  test('rejects non-integers and non-numbers', () => {
    assert.throws(() => validateSpyCount(1.5, 8), ValidationError);
    assert.throws(() => validateSpyCount(NaN, 8), ValidationError);
    assert.throws(() => validateSpyCount('1', 8), ValidationError);
    assert.throws(() => validateSpyCount(null, 8), ValidationError);
    assert.throws(() => validateSpyCount(undefined, 8), ValidationError);
  });
});

describe('dealRoles', () => {
  test('result keeps the input order and covers every player once', () => {
    const input = [30, 10, 20, 50, 40];
    const dealt = dealRoles(input, {}, seeded(1));
    assert.deepEqual(dealt.map((d) => d.userId), input);
  });

  test('automatic spy count with no optional roles', () => {
    const counts = countRoles(dealRoles(ids(10), {}, seeded(2)));
    assert.deepEqual(counts, { civilian: 8, spy: 2, double_agent: 0, mr_white: 0 });
  });

  test('explicit spy count', () => {
    const counts = countRoles(dealRoles(ids(10), { spyCount: 3 }, seeded(3)));
    assert.equal(counts.spy, 3);
    assert.equal(counts.civilian, 7);
  });

  test('rejects an invalid explicit spy count', () => {
    assert.throws(() => dealRoles(ids(6), { spyCount: 3 }, seeded(1)), ValidationError);
    assert.throws(() => dealRoles(ids(6), { spyCount: 0 }, seeded(1)), ValidationError);
  });

  test('rejects wrong player counts and duplicates', () => {
    assert.throws(() => dealRoles(ids(2), {}), ValidationError);
    assert.throws(() => dealRoles(ids(SPY_MAX_PLAYERS + 1), {}), ValidationError);
    assert.throws(() => dealRoles([1, 2, 2, 3], {}), ValidationError);
  });

  test('double agent needs six players', () => {
    assert.equal(countRoles(dealRoles(ids(5), { doubleAgent: true }, seeded(4))).double_agent, 0);
    assert.equal(countRoles(dealRoles(ids(6), { doubleAgent: true }, seeded(4))).double_agent, 1);
  });

  test('Mr. White needs five players', () => {
    assert.equal(countRoles(dealRoles(ids(4), { mrWhite: true }, seeded(5))).mr_white, 0);
    assert.equal(countRoles(dealRoles(ids(5), { mrWhite: true }, seeded(5))).mr_white, 1);
  });

  test('optional roles are not dealt when the flag is off', () => {
    const counts = countRoles(dealRoles(ids(10), {}, seeded(6)));
    assert.equal(counts.double_agent, 0);
    assert.equal(counts.mr_white, 0);
  });

  test('both optional roles together', () => {
    const counts = countRoles(dealRoles(ids(8), { doubleAgent: true, mrWhite: true }, seeded(7)));
    assert.deepEqual(counts, { civilian: 4, spy: 2, double_agent: 1, mr_white: 1 });
  });

  test('keeps at least two plain civilians, skipping extra roles silently', () => {
    // 5 players, 2 spies -> 3 civilians: Mr. White fits (leaves 2), nothing more.
    const five = countRoles(dealRoles(ids(5), { spyCount: 2, mrWhite: true }, seeded(8)));
    assert.deepEqual(five, { civilian: 2, spy: 2, double_agent: 0, mr_white: 1 });

    // 6 players, 2 spies -> 4 civilians: double agent fits (3 left), Mr. White fits (2 left).
    const six = countRoles(dealRoles(ids(6), { spyCount: 2, doubleAgent: true, mrWhite: true }, seeded(8)));
    assert.deepEqual(six, { civilian: 2, spy: 2, double_agent: 1, mr_white: 1 });

    // 7 players, 3 spies -> 4 civilians: both roles fit and exactly two remain.
    const seven = countRoles(dealRoles(ids(7), { spyCount: 3, doubleAgent: true, mrWhite: true }, seeded(8)));
    assert.equal(seven.civilian, 2);

    // 5 players, 2 spies, only a double agent requested -> needs n >= 6, skipped.
    const skipped = countRoles(dealRoles(ids(5), { spyCount: 2, doubleAgent: true }, seeded(8)));
    assert.equal(skipped.double_agent, 0);
  });

  test('invariant holds for every size and flag combination', () => {
    for (let n = SPY_MIN_PLAYERS; n <= SPY_MAX_PLAYERS; n++) {
      for (let spyCount = 1; spyCount <= Math.floor((n - 1) / 2); spyCount++) {
        const counts = countRoles(dealRoles(ids(n), { spyCount, doubleAgent: true, mrWhite: true }, seeded(n)));
        assert.ok(counts.civilian >= Math.min(2, n - spyCount), `n=${n} spies=${spyCount}`);
        assert.equal(counts.spy, spyCount);
        assert.equal(counts.civilian + counts.spy + counts.double_agent + counts.mr_white, n);
      }
    }
  });

  test('deterministic for a given random source', () => {
    const a = dealRoles(ids(12), { doubleAgent: true, mrWhite: true }, seeded(42));
    const b = dealRoles(ids(12), { doubleAgent: true, mrWhite: true }, seeded(42));
    assert.deepEqual(a, b);
  });

  test('a stub random picks spies from a known permutation', () => {
    // random() = 0 makes the Fisher-Yates shuffle rotate the list left by one: 2,3,4,5,1.
    const dealt = dealRoles([1, 2, 3, 4, 5], { spyCount: 1, mrWhite: true }, () => 0);
    const roleOf = new Map(dealt.map((d) => [d.userId, d.role]));
    assert.equal(roleOf.get(2), SpyRole.SPY);
    assert.equal(roleOf.get(3), SpyRole.MR_WHITE);
    assert.equal(roleOf.get(1), SpyRole.CIVILIAN);
    assert.equal(roleOf.get(4), SpyRole.CIVILIAN);
    assert.equal(roleOf.get(5), SpyRole.CIVILIAN);
  });

  test('different seeds give different layouts', () => {
    const layouts = new Set(
      [1, 2, 3, 4, 5, 6].map((seed) => dealRoles(ids(10), {}, seeded(seed)).map((d) => d.role).join()),
    );
    assert.ok(layouts.size > 1);
  });
});

describe('shuffleOrder', () => {
  test('is a permutation and does not mutate the input', () => {
    const input = ids(8);
    const copy = [...input];
    const result = shuffleOrder(input, seeded(9));
    assert.deepEqual(input, copy);
    assert.deepEqual([...result].sort((a, b) => a - b), copy);
  });

  test('deterministic for a given random source', () => {
    assert.deepEqual(shuffleOrder(ids(10), seeded(11)), shuffleOrder(ids(10), seeded(11)));
  });

  test('a stub random yields a known order', () => {
    assert.deepEqual(shuffleOrder([1, 2, 3, 4], () => 0), [2, 3, 4, 1]);
  });

  test('handles empty and single-item lists', () => {
    assert.deepEqual(shuffleOrder([]), []);
    assert.deepEqual(shuffleOrder([7]), [7]);
  });
});
