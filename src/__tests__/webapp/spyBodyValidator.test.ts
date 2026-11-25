import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSpyEventBody,
  parseSpySettingsBody,
  parseSpyVoteBody,
  parseSpyGuessBody,
  parseSpyLocationBody,
  parseSpyEliminateBody,
  parseSpyParticipantActiveBody,
  parseSpyNextBody,
} from '../../webapp/spyBodyValidator';
import { ValidationError } from '../../utils/errors';

describe('parseSpyEventBody', () => {
  test('a minimal body yields the trimmed title only: the defaults belong to the service', () => {
    assert.deepEqual(parseSpyEventBody({ title: '  Friday  ' }), { title: 'Friday' });
  });

  test('accepts a full body', () => {
    const parsed = parseSpyEventBody({
      title: 'Spy',
      description: 'bring snacks',
      starts_at: '2026-12-01T16:30:00.000Z',
      place: 'Cafe',
      max_players: 12,
      spy_count: 2,
      double_agent: true,
      mr_white: false,
      packs: ['base', 'custom'],
      turn_seconds: 60,
      hint_after_cycles: 2,
    });
    assert.equal(parsed.starts_at?.toISOString(), '2026-12-01T16:30:00.000Z');
    assert.equal(parsed.max_players, 12);
    assert.equal(parsed.spy_count, 2);
    assert.equal(parsed.double_agent, true);
    assert.equal(parsed.mr_white, false);
    assert.deepEqual(parsed.packs, ['base', 'custom']);
    assert.equal(parsed.turn_seconds, 60);
    assert.equal(parsed.hint_after_cycles, 2);
  });

  test('empty optional strings and explicit nulls become null', () => {
    const parsed = parseSpyEventBody({
      title: 'x', description: ' ', place: '', starts_at: '', spy_count: null, turn_seconds: null, hint_after_cycles: null,
    });
    assert.equal(parsed.description, null);
    assert.equal(parsed.place, null);
    assert.equal(parsed.starts_at, null);
    assert.equal(parsed.spy_count, null);
    assert.equal(parsed.turn_seconds, null);
    assert.equal(parsed.hint_after_cycles, null);
  });

  test('rejects a missing, blank or too long title', () => {
    for (const body of [undefined, {}, { title: '   ' }, { title: 5 }, { title: 'x'.repeat(101) }]) {
      assert.throws(() => parseSpyEventBody(body), ValidationError);
    }
    assert.equal(parseSpyEventBody({ title: 'x'.repeat(100) }).title.length, 100);
  });

  test('rejects bad description, place and start time', () => {
    const base = { title: 'x' };
    assert.throws(() => parseSpyEventBody({ ...base, description: 'x'.repeat(501) }), ValidationError);
    assert.throws(() => parseSpyEventBody({ ...base, description: 5 }), ValidationError);
    assert.throws(() => parseSpyEventBody({ ...base, place: 'x'.repeat(201) }), ValidationError);
    assert.throws(() => parseSpyEventBody({ ...base, place: 5 }), ValidationError);
    assert.throws(() => parseSpyEventBody({ ...base, starts_at: 'tomorrow' }), ValidationError);
    assert.throws(() => parseSpyEventBody({ ...base, starts_at: '2026-12-01T16:30' }), ValidationError, 'no zone');
    assert.throws(() => parseSpyEventBody({ ...base, starts_at: '2026-13-45T10:00:00Z' }), ValidationError);
    assert.throws(() => parseSpyEventBody({ ...base, starts_at: 123 }), ValidationError);
    assert.equal(parseSpyEventBody({ ...base, place: 'x'.repeat(200) }).place?.length, 200);
  });

  test('max_players must be an integer from 3 to 20', () => {
    for (const bad of [2, 21, 0, -1, 7.5, '10', NaN, null]) {
      assert.throws(() => parseSpyEventBody({ title: 'x', max_players: bad }), ValidationError, String(bad));
    }
    assert.equal(parseSpyEventBody({ title: 'x', max_players: 3 }).max_players, 3);
    assert.equal(parseSpyEventBody({ title: 'x', max_players: 20 }).max_players, 20);
  });

  test('spy_count is null or an integer of at least 1', () => {
    for (const bad of [0, -1, 1.5, '2', true]) {
      assert.throws(() => parseSpyEventBody({ title: 'x', spy_count: bad }), ValidationError, String(bad));
    }
    assert.equal(parseSpyEventBody({ title: 'x', spy_count: 1 }).spy_count, 1);
  });

  test('flags must be booleans', () => {
    for (const key of ['double_agent', 'mr_white']) {
      for (const bad of ['yes', 1, null]) {
        assert.throws(() => parseSpyEventBody({ title: 'x', [key]: bad }), ValidationError, `${key}=${String(bad)}`);
      }
    }
  });

  test('packs: a non-empty array of known ids without duplicates', () => {
    for (const bad of [[], ['nope'], ['base', 'base'], 'base', [1], null, ['base', 'nope']]) {
      assert.throws(() => parseSpyEventBody({ title: 'x', packs: bad }), ValidationError, JSON.stringify(bad));
    }
    assert.deepEqual(parseSpyEventBody({ title: 'x', packs: ['city', 'adult'] }).packs, ['city', 'adult']);
  });

  test('turn_seconds is null or 15..300', () => {
    for (const bad of [14, 301, 0, 30.5, '60']) {
      assert.throws(() => parseSpyEventBody({ title: 'x', turn_seconds: bad }), ValidationError, String(bad));
    }
    assert.equal(parseSpyEventBody({ title: 'x', turn_seconds: 15 }).turn_seconds, 15);
    assert.equal(parseSpyEventBody({ title: 'x', turn_seconds: 300 }).turn_seconds, 300);
  });

  test('hint_after_cycles is null or 1..10', () => {
    for (const bad of [0, 11, 1.5, '2']) {
      assert.throws(() => parseSpyEventBody({ title: 'x', hint_after_cycles: bad }), ValidationError, String(bad));
    }
    assert.equal(parseSpyEventBody({ title: 'x', hint_after_cycles: 1 }).hint_after_cycles, 1);
    assert.equal(parseSpyEventBody({ title: 'x', hint_after_cycles: 10 }).hint_after_cycles, 10);
  });
});

describe('parseSpySettingsBody', () => {
  test('keeps only the keys that were sent', () => {
    assert.deepEqual(parseSpySettingsBody({ mr_white: true }), { mr_white: true });
    assert.deepEqual(parseSpySettingsBody({ turn_seconds: null }), { turn_seconds: null });
  });

  test('the title is optional but validated when present', () => {
    assert.equal(parseSpySettingsBody({ title: ' New ' }).title, 'New');
    assert.throws(() => parseSpySettingsBody({ title: '' }), ValidationError);
    assert.throws(() => parseSpySettingsBody({ title: 'x'.repeat(101) }), ValidationError);
  });

  test('an empty update is refused', () => {
    assert.throws(() => parseSpySettingsBody({}), ValidationError);
    assert.throws(() => parseSpySettingsBody(undefined), ValidationError);
  });

  test('shares the field rules with the event body', () => {
    assert.throws(() => parseSpySettingsBody({ max_players: 2 }), ValidationError);
    assert.throws(() => parseSpySettingsBody({ packs: [] }), ValidationError);
    assert.throws(() => parseSpySettingsBody({ turn_seconds: 5 }), ValidationError);
    assert.throws(() => parseSpySettingsBody({ spy_count: 0 }), ValidationError);
  });
});

describe('parseSpyVoteBody', () => {
  test('needs a positive integer target', () => {
    assert.deepEqual(parseSpyVoteBody({ target_id: 4 }), { target_id: 4 });
    for (const body of [undefined, {}, { target_id: 0 }, { target_id: -1 }, { target_id: 1.5 }, { target_id: '4' }, { target_id: null }]) {
      assert.throws(() => parseSpyVoteBody(body), ValidationError);
    }
  });
});

describe('parseSpyGuessBody', () => {
  test('trims the guess and refuses an empty or oversized one', () => {
    assert.deepEqual(parseSpyGuessBody({ guess: '  Больница ' }), { guess: 'Больница' });
    for (const body of [undefined, {}, { guess: '' }, { guess: '   ' }, { guess: 5 }, { guess: 'x'.repeat(201) }]) {
      assert.throws(() => parseSpyGuessBody(body), ValidationError);
    }
  });
});

describe('parseSpyLocationBody', () => {
  test('needs a group and a name of 1..100 characters', () => {
    assert.deepEqual(parseSpyLocationBody({ group_id: 2, name: ' Кафе ' }), { group_id: 2, name: 'Кафе' });
    assert.equal(parseSpyLocationBody({ group_id: 2, name: 'x'.repeat(100) }).name.length, 100);
    for (const body of [
      undefined, {}, { name: 'x' }, { group_id: 0, name: 'x' }, { group_id: '2', name: 'x' },
      { group_id: 2 }, { group_id: 2, name: '  ' }, { group_id: 2, name: 7 }, { group_id: 2, name: 'x'.repeat(101) },
    ]) {
      assert.throws(() => parseSpyLocationBody(body), ValidationError, JSON.stringify(body));
    }
  });
});

describe('parseSpyEliminateBody', () => {
  test('needs a user id and an explicit boolean', () => {
    assert.deepEqual(parseSpyEliminateBody({ user_id: 3, eliminated: false }), { user_id: 3, eliminated: false });
    for (const body of [undefined, {}, { user_id: 3 }, { eliminated: true }, { user_id: 0, eliminated: true }, { user_id: 3, eliminated: 'true' }]) {
      assert.throws(() => parseSpyEliminateBody(body), ValidationError);
    }
  });
});

describe('parseSpyParticipantActiveBody', () => {
  test('needs an explicit boolean', () => {
    assert.deepEqual(parseSpyParticipantActiveBody({ is_active: false }), { is_active: false });
    for (const body of [undefined, {}, { is_active: 1 }, { is_active: null }, { is_active: 'false' }]) {
      assert.throws(() => parseSpyParticipantActiveBody(body), ValidationError);
    }
  });
});

describe('parseSpyNextBody', () => {
  test('force defaults to false and must be a boolean when given', () => {
    assert.deepEqual(parseSpyNextBody(undefined), { force: false });
    assert.deepEqual(parseSpyNextBody({}), { force: false });
    assert.deepEqual(parseSpyNextBody({ force: true }), { force: true });
    assert.throws(() => parseSpyNextBody({ force: 'yes' }), ValidationError);
  });
});
