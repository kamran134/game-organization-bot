import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from '../../utils/errors';
import { SPY_PACKS, advanceTurn, shouldHint, turnDeadline } from '../../utils/spyRound';

describe('advanceTurn', () => {
  const order = [10, 20, 30];

  test('moves to the next player within the cycle', () => {
    assert.deepEqual(advanceTurn(order, 0, 1, new Set()), { index: 1, cycle: 1 });
    assert.deepEqual(advanceTurn(order, 1, 1, new Set()), { index: 2, cycle: 1 });
  });

  test('wrapping to the start begins the next cycle', () => {
    assert.deepEqual(advanceTurn(order, 2, 1, new Set()), { index: 0, cycle: 2 });
  });

  test('skips eliminated players', () => {
    assert.deepEqual(advanceTurn(order, 0, 1, new Set([20])), { index: 2, cycle: 1 });
  });

  test('skipping across the end still counts the wrap once', () => {
    assert.deepEqual(advanceTurn(order, 1, 1, new Set([30, 10])), { index: 1, cycle: 2 });
    assert.deepEqual(advanceTurn(order, 1, 1, new Set([30])), { index: 0, cycle: 2 });
  });

  test('a lone survivor gets the turn again in a new cycle', () => {
    assert.deepEqual(advanceTurn(order, 2, 3, new Set([10, 20])), { index: 2, cycle: 4 });
  });

  test('throws instead of looping when nobody is alive', () => {
    assert.throws(() => advanceTurn(order, 0, 1, new Set(order)), ValidationError);
    assert.throws(() => advanceTurn([], 0, 1, new Set()), ValidationError);
  });

  test('does not mutate its inputs', () => {
    const eliminated = new Set([20]);
    const copy = [...order];
    advanceTurn(order, 0, 1, eliminated);
    assert.deepEqual(order, copy);
    assert.deepEqual([...eliminated], [20]);
  });
});

describe('shouldHint', () => {
  test('never when hints are off', () => {
    assert.equal(shouldHint(1, null), false);
    assert.equal(shouldHint(99, null), false);
  });

  test('only after the configured number of full cycles', () => {
    assert.equal(shouldHint(1, 1), false);
    assert.equal(shouldHint(2, 1), true);
    assert.equal(shouldHint(2, 2), false);
    assert.equal(shouldHint(3, 2), true);
  });
});

describe('turnDeadline', () => {
  const start = new Date('2026-01-01T12:00:00.000Z');

  test('null without a timer', () => {
    assert.equal(turnDeadline(start, null), null);
  });

  test('adds the turn length', () => {
    assert.equal(turnDeadline(start, 60)?.toISOString(), '2026-01-01T12:01:00.000Z');
  });

  test('does not mutate the start date', () => {
    turnDeadline(start, 30);
    assert.equal(start.toISOString(), '2026-01-01T12:00:00.000Z');
  });
});

describe('SPY_PACKS', () => {
  test('lists the six packs in order', () => {
    assert.deepEqual(
      SPY_PACKS.map((p) => p.id),
      ['base', 'city', 'movies', 'work', 'adult', 'custom'],
    );
  });

  test('only the 18+ pack is adult', () => {
    assert.deepEqual(SPY_PACKS.filter((p) => p.adult).map((p) => p.id), ['adult']);
  });

  test('every pack has a title and an emoji', () => {
    for (const pack of SPY_PACKS) {
      assert.ok(pack.title);
      assert.ok(pack.emoji);
    }
  });
});
