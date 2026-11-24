import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMafiaEventBody, parseMafiaLogBody, parseRoleCountsBody } from '../../webapp/mafiaBodyValidator';
import { ValidationError } from '../../utils/errors';

describe('parseMafiaEventBody', () => {
  test('accepts a minimal body and applies the defaults', () => {
    assert.deepEqual(parseMafiaEventBody({ title: '  Friday  ' }), {
      title: 'Friday',
      description: null,
      starts_at: null,
      place: null,
      show_mafia_team: true,
      assign_seats: false,
      max_players: 10,
    });
  });

  test('accepts a full body', () => {
    const parsed = parseMafiaEventBody({
      title: 'Mafia',
      description: 'bring snacks',
      starts_at: '2026-12-01T16:30:00.000Z',
      place: 'Cafe',
      show_mafia_team: false,
      assign_seats: true,
      max_players: 12,
    });
    assert.equal(parsed.starts_at?.toISOString(), '2026-12-01T16:30:00.000Z');
    assert.equal(parsed.place, 'Cafe');
    assert.equal(parsed.show_mafia_team, false);
    assert.equal(parsed.assign_seats, true);
    assert.equal(parsed.max_players, 12);
  });

  test('empty optional strings become null', () => {
    const parsed = parseMafiaEventBody({ title: 'x', description: ' ', place: '', starts_at: '' });
    assert.equal(parsed.description, null);
    assert.equal(parsed.place, null);
    assert.equal(parsed.starts_at, null);
  });

  test('rejects a missing, blank or too long title', () => {
    for (const body of [undefined, {}, { title: '   ' }, { title: 5 }, { title: 'x'.repeat(101) }]) {
      assert.throws(() => parseMafiaEventBody(body), ValidationError);
    }
  });

  test('rejects bad optional fields', () => {
    const base = { title: 'x' };
    assert.throws(() => parseMafiaEventBody({ ...base, description: 'x'.repeat(501) }), ValidationError);
    assert.throws(() => parseMafiaEventBody({ ...base, description: 5 }), ValidationError);
    assert.throws(() => parseMafiaEventBody({ ...base, place: 'x'.repeat(201) }), ValidationError);
    assert.throws(() => parseMafiaEventBody({ ...base, place: 5 }), ValidationError);
    assert.throws(() => parseMafiaEventBody({ ...base, starts_at: 'tomorrow' }), ValidationError);
    assert.throws(() => parseMafiaEventBody({ ...base, starts_at: '2026-12-01T16:30' }), ValidationError, 'no zone');
    assert.throws(() => parseMafiaEventBody({ ...base, starts_at: '2026-13-45T10:00:00Z' }), ValidationError);
    assert.throws(() => parseMafiaEventBody({ ...base, starts_at: 123 }), ValidationError);
    assert.throws(() => parseMafiaEventBody({ ...base, show_mafia_team: 'yes' }), ValidationError);
    assert.throws(() => parseMafiaEventBody({ ...base, assign_seats: 1 }), ValidationError);
  });

  test('max_players must be an integer from 4 to 30', () => {
    for (const bad of [3, 31, 0, -1, 7.5, '10', NaN]) {
      assert.throws(() => parseMafiaEventBody({ title: 'x', max_players: bad }), ValidationError, String(bad));
    }
    assert.equal(parseMafiaEventBody({ title: 'x', max_players: 4 }).max_players, 4);
    assert.equal(parseMafiaEventBody({ title: 'x', max_players: 30 }).max_players, 30);
  });
});

describe('parseRoleCountsBody', () => {
  const full = { civilian: 3, mafia: 1, don: 0, commissar: 0, doctor: 0, maniac: 0, lover: 0 };

  test('absent counts mean "use the default layout"', () => {
    assert.equal(parseRoleCountsBody(undefined), undefined);
    assert.equal(parseRoleCountsBody({}), undefined);
    assert.equal(parseRoleCountsBody({ counts: null }), undefined);
  });

  test('accepts a complete layout', () => {
    assert.deepEqual(parseRoleCountsBody({ counts: full }), full);
  });

  test('rejects a wrong shape', () => {
    const missing: Record<string, number> = { ...full };
    delete missing['lover'];
    for (const counts of [missing, { ...full, witch: 1 }, { ...full, mafia: 1.5 }, { ...full, mafia: -1 }, { ...full, mafia: '1' }, [], 'x']) {
      assert.throws(() => parseRoleCountsBody({ counts }), ValidationError);
    }
  });
});

describe('parseMafiaLogBody', () => {
  test('accepts every valid type / phase pair', () => {
    for (const type of ['kill', 'heal', 'check', 'block']) {
      assert.deepEqual(parseMafiaLogBody({ cycle: 1, phase: 'night', type, target_user_id: 5 }), {
        cycle: 1, phase: 'night', type, target_user_id: 5, note: null,
      });
    }
    assert.equal(parseMafiaLogBody({ cycle: 3, phase: 'day', type: 'lynch', target_user_id: 5 }).phase, 'day');
    for (const phase of ['night', 'day']) {
      assert.equal(parseMafiaLogBody({ cycle: 1, phase, type: 'note', note: 'text' }).type, 'note');
    }
  });

  test('rejects every forbidden type / phase pair', () => {
    for (const type of ['kill', 'heal', 'check', 'block']) {
      assert.throws(
        () => parseMafiaLogBody({ cycle: 1, phase: 'day', type, target_user_id: 5 }),
        /Invalid phase for this entry/,
        type,
      );
    }
    assert.throws(
      () => parseMafiaLogBody({ cycle: 1, phase: 'night', type: 'lynch', target_user_id: 5 }),
      /Invalid phase for this entry/,
    );
  });

  test('rejects unknown or missing type and phase', () => {
    assert.throws(() => parseMafiaLogBody({ cycle: 1, phase: 'night', type: 'poison', target_user_id: 5 }), /Invalid entry type/);
    assert.throws(() => parseMafiaLogBody({ cycle: 1, phase: 'night', target_user_id: 5 }), /Invalid entry type/);
    assert.throws(() => parseMafiaLogBody({ cycle: 1, phase: 'dusk', type: 'kill', target_user_id: 5 }), /Invalid phase/);
    assert.throws(() => parseMafiaLogBody({ cycle: 1, type: 'kill', target_user_id: 5 }), /Invalid phase/);
  });

  test('requires a target for everything except a note', () => {
    for (const [type, phase] of [['kill', 'night'], ['heal', 'night'], ['check', 'night'], ['block', 'night'], ['lynch', 'day']]) {
      assert.throws(() => parseMafiaLogBody({ cycle: 1, phase, type }), /Target is required/, type);
      assert.throws(() => parseMafiaLogBody({ cycle: 1, phase, type, target_user_id: null }), /Target is required/, type);
    }
  });

  test('rejects a malformed target', () => {
    for (const target of [0, -1, 1.5, '5', true, {}]) {
      assert.throws(
        () => parseMafiaLogBody({ cycle: 1, phase: 'night', type: 'kill', target_user_id: target }),
        ValidationError,
        String(target),
      );
    }
  });

  test('a note needs non-empty text of at most 500 characters', () => {
    assert.throws(() => parseMafiaLogBody({ cycle: 1, phase: 'day', type: 'note' }), /Note is required/);
    assert.throws(() => parseMafiaLogBody({ cycle: 1, phase: 'day', type: 'note', note: '   ' }), /Note is required/);
    assert.throws(() => parseMafiaLogBody({ cycle: 1, phase: 'day', type: 'note', note: 'a'.repeat(501) }), /Note is too long/);
    assert.throws(() => parseMafiaLogBody({ cycle: 1, phase: 'day', type: 'note', note: 5 }), ValidationError);
    assert.equal(parseMafiaLogBody({ cycle: 1, phase: 'day', type: 'note', note: ` ${'a'.repeat(500)} ` }).note?.length, 500);
  });

  test('a note may point at a player, other types may carry an optional note', () => {
    assert.equal(parseMafiaLogBody({ cycle: 1, phase: 'day', type: 'note', note: 'x', target_user_id: 4 }).target_user_id, 4);
    assert.equal(parseMafiaLogBody({ cycle: 1, phase: 'night', type: 'kill', target_user_id: 4, note: ' saved ' }).note, 'saved');
    assert.throws(
      () => parseMafiaLogBody({ cycle: 1, phase: 'night', type: 'kill', target_user_id: 4, note: 'a'.repeat(501) }),
      /Note is too long/,
    );
  });

  test('cycle must be an integer from 1 to 50', () => {
    const base = { phase: 'night', type: 'kill', target_user_id: 5 };
    for (const cycle of [0, 51, -1, 1.5, '1', null, undefined]) {
      assert.throws(() => parseMafiaLogBody({ ...base, cycle }), /Invalid cycle/, String(cycle));
    }
    assert.equal(parseMafiaLogBody({ ...base, cycle: 50 }).cycle, 50);
    assert.throws(() => parseMafiaLogBody(null), /Invalid cycle/);
  });
});
