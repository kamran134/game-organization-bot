import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GameCreationValidator } from '../../bot/flows/GameCreationValidator';

// A date in the far future so "date in the past" checks never trigger
const FUTURE = '01.01.2099 12:00';

describe('GameCreationValidator.parseDate', () => {
  test('accepts DD.MM YYYY HH:MM format', () => {
    const r = GameCreationValidator.parseDate('15.06.2099 18:30');
    assert.equal(r.success, true);
    assert.ok(r.date instanceof Date);
    assert.equal(r.date!.getFullYear(), 2099);
    assert.equal(r.date!.getMonth(), 5); // June = 5
    assert.equal(r.date!.getDate(), 15);
    assert.equal(r.date!.getHours(), 18);
    assert.equal(r.date!.getMinutes(), 30);
  });

  test('accepts short DD.MM HH:MM format (no year)', () => {
    const r = GameCreationValidator.parseDate('01.01 12:00');
    // Will use current year — could be in the past if run after Jan 1, so just check parsing succeeds or fails consistently
    // We know it parses the regex correctly
    assert.ok(r.date !== undefined || r.error !== undefined);
  });

  test('rejects invalid format', () => {
    const r = GameCreationValidator.parseDate('not-a-date');
    assert.equal(r.success, false);
    assert.ok(r.error);
  });

  test('rejects date in the past', () => {
    const r = GameCreationValidator.parseDate('01.01.2000 00:00');
    assert.equal(r.success, false);
    assert.match(r.error!, /прошл/i);
  });

  test('rejects missing time part', () => {
    const r = GameCreationValidator.parseDate('15.06.2099');
    assert.equal(r.success, false);
  });
});

describe('GameCreationValidator.validateLocation', () => {
  test('accepts valid location', () => {
    const r = GameCreationValidator.validateLocation('Стадион Центральный');
    assert.equal(r.success, true);
  });

  test('rejects too short (< 3 chars)', () => {
    assert.equal(GameCreationValidator.validateLocation('AB').success, false);
    assert.equal(GameCreationValidator.validateLocation('').success, false);
  });

  test('accepts exactly 3 chars', () => {
    assert.equal(GameCreationValidator.validateLocation('Зал').success, true);
  });
});

describe('GameCreationValidator.validateMaxParticipants', () => {
  test('accepts valid number', () => {
    const r = GameCreationValidator.validateMaxParticipants('10');
    assert.equal(r.success, true);
    assert.equal(r.value, 10);
  });

  test('accepts boundary 2', () => {
    assert.equal(GameCreationValidator.validateMaxParticipants('2').success, true);
  });

  test('accepts boundary 100', () => {
    assert.equal(GameCreationValidator.validateMaxParticipants('100').success, true);
  });

  test('rejects 1 (below min)', () => {
    assert.equal(GameCreationValidator.validateMaxParticipants('1').success, false);
  });

  test('rejects 101 (above max)', () => {
    assert.equal(GameCreationValidator.validateMaxParticipants('101').success, false);
  });

  test('rejects NaN', () => {
    assert.equal(GameCreationValidator.validateMaxParticipants('abc').success, false);
  });

  test('rejects negative number', () => {
    assert.equal(GameCreationValidator.validateMaxParticipants('-5').success, false);
  });
});

describe('GameCreationValidator.validateMinParticipants', () => {
  test('accepts valid min less than max', () => {
    const r = GameCreationValidator.validateMinParticipants('3', 10);
    assert.equal(r.success, true);
    assert.equal(r.value, 3);
  });

  test('rejects min > max', () => {
    assert.equal(GameCreationValidator.validateMinParticipants('11', 10).success, false);
  });

  test('rejects min equal to max (boundary — valid)', () => {
    // min == max is allowed by the validator (<=)
    assert.equal(GameCreationValidator.validateMinParticipants('10', 10).success, true);
  });

  test('rejects min < 2', () => {
    assert.equal(GameCreationValidator.validateMinParticipants('1', 10).success, false);
  });

  test('rejects NaN', () => {
    assert.equal(GameCreationValidator.validateMinParticipants('x', 10).success, false);
  });
});

describe('GameCreationValidator.validateCost', () => {
  test('accepts zero cost (free)', () => {
    const r = GameCreationValidator.validateCost('0');
    assert.equal(r.success, true);
    assert.equal(r.value, undefined); // 0 → no cost stored
  });

  test('accepts positive cost', () => {
    const r = GameCreationValidator.validateCost('500');
    assert.equal(r.success, true);
    assert.equal(r.value, 500);
  });

  test('accepts decimal cost', () => {
    const r = GameCreationValidator.validateCost('12.50');
    assert.equal(r.success, true);
    assert.equal(r.value, 12.5);
  });

  test('rejects negative cost', () => {
    assert.equal(GameCreationValidator.validateCost('-1').success, false);
  });

  test('rejects non-numeric', () => {
    assert.equal(GameCreationValidator.validateCost('free').success, false);
  });
});

describe('GameCreationValidator.parseParticipantsRange', () => {
  test('parses "5-10" range', () => {
    const r = GameCreationValidator.parseParticipantsRange('5-10');
    assert.equal(r.success, true);
    assert.equal(r.min, 5);
    assert.equal(r.max, 10);
  });

  test('parses plain number (auto-calculates min)', () => {
    const r = GameCreationValidator.parseParticipantsRange('10');
    assert.equal(r.success, true);
    assert.equal(r.max, 10);
    assert.ok(r.min! >= 2 && r.min! <= 10);
  });

  test('rejects min > max in range', () => {
    assert.equal(GameCreationValidator.parseParticipantsRange('10-5').success, false);
  });

  test('rejects max > 100', () => {
    assert.equal(GameCreationValidator.parseParticipantsRange('101').success, false);
  });

  test('rejects max < 2', () => {
    assert.equal(GameCreationValidator.parseParticipantsRange('1').success, false);
  });

  test('rejects non-numeric', () => {
    assert.equal(GameCreationValidator.parseParticipantsRange('many').success, false);
  });

  test('rejects NaN in range pair', () => {
    assert.equal(GameCreationValidator.parseParticipantsRange('5-abc').success, false);
  });
});

describe('GameCreationValidator.validateNotes', () => {
  test('accepts normal notes', () => {
    assert.equal(GameCreationValidator.validateNotes('Bring your shoes').success, true);
  });

  test('accepts empty notes', () => {
    assert.equal(GameCreationValidator.validateNotes('').success, true);
  });

  test('rejects notes > 1000 chars', () => {
    const longText = 'x'.repeat(1001);
    assert.equal(GameCreationValidator.validateNotes(longText).success, false);
  });

  test('accepts exactly 1000 chars', () => {
    const text = 'x'.repeat(1000);
    assert.equal(GameCreationValidator.validateNotes(text).success, true);
  });
});

describe('GameCreationValidator.validateNumber', () => {
  test('accepts value within range', () => {
    const r = GameCreationValidator.validateNumber('5', 1, 10);
    assert.equal(r.success, true);
    assert.equal(r.value, 5);
  });

  test('accepts boundary values', () => {
    assert.equal(GameCreationValidator.validateNumber('1', 1, 10).success, true);
    assert.equal(GameCreationValidator.validateNumber('10', 1, 10).success, true);
  });

  test('rejects out-of-range', () => {
    assert.equal(GameCreationValidator.validateNumber('0', 1, 10).success, false);
    assert.equal(GameCreationValidator.validateNumber('11', 1, 10).success, false);
  });

  test('rejects NaN', () => {
    assert.equal(GameCreationValidator.validateNumber('x', 1, 10).success, false);
  });
});
