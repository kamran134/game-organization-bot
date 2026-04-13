import { describe, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { StateManager } from '../../utils/StateManager';

describe('StateManager — basic operations', () => {
  test('get returns undefined for unknown key', () => {
    const sm = new StateManager<string>();
    assert.equal(sm.get(999), undefined);
  });

  test('set and get round-trips value', () => {
    const sm = new StateManager<number>();
    sm.set(1, 42);
    assert.equal(sm.get(1), 42);
  });

  test('has returns false when key absent', () => {
    const sm = new StateManager<string>();
    assert.equal(sm.has(1), false);
  });

  test('has returns true after set', () => {
    const sm = new StateManager<string>();
    sm.set(1, 'x');
    assert.equal(sm.has(1), true);
  });

  test('delete removes the entry', () => {
    const sm = new StateManager<string>();
    sm.set(1, 'x');
    sm.delete(1);
    assert.equal(sm.has(1), false);
    assert.equal(sm.get(1), undefined);
  });

  test('delete on absent key does not throw', () => {
    const sm = new StateManager<string>();
    assert.doesNotThrow(() => sm.delete(999));
  });

  test('overwrite replaces existing value', () => {
    const sm = new StateManager<string>();
    sm.set(1, 'first');
    sm.set(1, 'second');
    assert.equal(sm.get(1), 'second');
  });

  test('multiple users stored independently', () => {
    const sm = new StateManager<string>();
    sm.set(1, 'alice');
    sm.set(2, 'bob');
    assert.equal(sm.get(1), 'alice');
    assert.equal(sm.get(2), 'bob');
  });

  test('clear removes all entries', () => {
    const sm = new StateManager<string>();
    sm.set(1, 'a');
    sm.set(2, 'b');
    sm.set(3, 'c');
    sm.clear();
    assert.equal(sm.has(1), false);
    assert.equal(sm.has(2), false);
    assert.equal(sm.has(3), false);
  });

  test('works with object values', () => {
    const sm = new StateManager<{ step: string; data: number }>();
    sm.set(1, { step: 'name', data: 0 });
    const state = sm.get(1)!;
    assert.equal(state.step, 'name');
    assert.equal(state.data, 0);
  });
});

describe('StateManager — TTL expiry', () => {
  test('state expires after 30 minutes', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const sm = new StateManager<string>();
    sm.set(42, 'active');
    assert.equal(sm.has(42), true);

    // Advance time past the 30-minute TTL
    t.mock.timers.tick(30 * 60 * 1000 + 1);

    assert.equal(sm.has(42), false);
    assert.equal(sm.get(42), undefined);
  });

  test('resetting state resets the TTL', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const sm = new StateManager<string>();
    sm.set(1, 'v1');

    // Advance 20 minutes (not expired yet)
    t.mock.timers.tick(20 * 60 * 1000);
    assert.equal(sm.has(1), true);

    // Reset the state — TTL should restart from now
    sm.set(1, 'v2');

    // Advance another 20 minutes (40 min from original set, but only 20 from reset)
    t.mock.timers.tick(20 * 60 * 1000);
    assert.equal(sm.has(1), true);
    assert.equal(sm.get(1), 'v2');

    // Now advance past the full TTL from the reset point
    t.mock.timers.tick(10 * 60 * 1000 + 1);
    assert.equal(sm.has(1), false);
  });

  test('delete cancels the TTL timer', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const sm = new StateManager<string>();
    sm.set(1, 'x');
    sm.delete(1);

    // Firing all timers should not throw and state stays absent
    t.mock.timers.tick(30 * 60 * 1000 + 1);
    assert.equal(sm.has(1), false);
  });
});
