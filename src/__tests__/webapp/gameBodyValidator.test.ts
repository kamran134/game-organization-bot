import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGameBody } from '../../webapp/gameBodyValidator';
import { ValidationError } from '../../utils/errors';

const valid = {
  sport_id: '1',
  location_id: '2',
  game_date: '2030-05-01T18:00',
  max_participants: '12',
};

function rejects(body: unknown, mode: 'create' | 'update'): void {
  assert.throws(() => parseGameBody(body, mode), ValidationError);
}

describe('parseGameBody (create)', () => {
  test('parses strings from the form into numbers and a Date', () => {
    const r = parseGameBody({ ...valid, min_participants: '6', cost: '150.5', notes: ' hi ' }, 'create');
    assert.equal(r.sport_id, 1);
    assert.equal(r.location_id, 2);
    assert.equal(r.max_participants, 12);
    assert.equal(r.min_participants, 6);
    assert.equal(r.cost, 150.5);
    assert.equal(r.notes, 'hi');
    assert.ok(r.game_date instanceof Date && !isNaN(r.game_date.getTime()));
  });

  test('min defaults to 2 but never exceeds max', () => {
    assert.equal(parseGameBody(valid, 'create').min_participants, 2);
    assert.equal(parseGameBody({ ...valid, max_participants: 1 }, 'create').min_participants, 1);
  });

  test('empty cost and notes are omitted', () => {
    const r = parseGameBody({ ...valid, cost: '', notes: '' }, 'create');
    assert.equal(r.cost, undefined);
    assert.equal(r.notes, undefined);
  });

  test('accepts 999 (unlimited training) as max', () => {
    assert.equal(parseGameBody({ ...valid, max_participants: 999 }, 'create').max_participants, 999);
  });

  test('rejects missing required fields', () => {
    for (const key of ['sport_id', 'location_id', 'game_date', 'max_participants']) {
      const body: Record<string, unknown> = { ...valid };
      delete body[key];
      rejects(body, 'create');
    }
    rejects(undefined, 'create');
  });

  test('rejects partially numeric and non-integer values', () => {
    rejects({ ...valid, sport_id: '12abc' }, 'create');
    rejects({ ...valid, max_participants: '1.5' }, 'create');
    rejects({ ...valid, max_participants: 'abc' }, 'create');
    rejects({ ...valid, location_id: [1] }, 'create');
    rejects({ ...valid, sport_id: 0 }, 'create');
  });

  test('rejects out-of-range or inconsistent participants', () => {
    rejects({ ...valid, max_participants: 0 }, 'create');
    rejects({ ...valid, max_participants: 1000 }, 'create');
    rejects({ ...valid, max_participants: Infinity }, 'create');
    rejects({ ...valid, min_participants: 13 }, 'create');
    rejects({ ...valid, min_participants: -1 }, 'create');
  });

  test('rejects invalid cost', () => {
    rejects({ ...valid, cost: '-1' }, 'create');
    rejects({ ...valid, cost: 'Infinity' }, 'create');
    rejects({ ...valid, cost: 'abc' }, 'create');
    rejects({ ...valid, cost: 1e12 }, 'create');
  });

  test('rejects invalid dates', () => {
    rejects({ ...valid, game_date: 'x' }, 'create');
    rejects({ ...valid, game_date: '0001-01-01T00:00' }, 'create');
    rejects({ ...valid, game_date: { a: 1 } }, 'create');
  });

  test('rejects over-long or non-string notes', () => {
    rejects({ ...valid, notes: 'x'.repeat(1001) }, 'create');
    rejects({ ...valid, notes: 5 }, 'create');
    assert.equal(parseGameBody({ ...valid, notes: 'x'.repeat(1000) }, 'create').notes?.length, 1000);
  });
});

describe('parseGameBody (update)', () => {
  test('absent fields are left out entirely', () => {
    assert.deepEqual(parseGameBody({}, 'update'), {});
  });

  test('empty or null cost and notes clear the columns', () => {
    assert.deepEqual(parseGameBody({ cost: '', notes: '' }, 'update'), { cost: null, notes: null });
    assert.deepEqual(parseGameBody({ cost: null, notes: null }, 'update'), { cost: null, notes: null });
  });

  test('updates only the provided fields', () => {
    const r = parseGameBody({ max_participants: '20', cost: '100' }, 'update');
    assert.equal(r.max_participants, 20);
    assert.equal(r.cost, 100);
    assert.equal(r.min_participants, undefined);
    assert.equal(r.sport_id, undefined);
  });

  test('still validates the fields that are present', () => {
    rejects({ min_participants: 10, max_participants: 5 }, 'update');
    rejects({ game_date: 'x' }, 'update');
    rejects({ sport_id: '12abc' }, 'update');
  });
});
