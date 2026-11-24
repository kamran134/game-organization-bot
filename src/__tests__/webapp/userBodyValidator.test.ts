import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFirstNameField, parseGenderField, parseLastNameField } from '../../webapp/userBodyValidator';
import { Gender } from '../../models/Gender';
import { ValidationError } from '../../utils/errors';

describe('parseGenderField', () => {
  test('accepts the two known values', () => {
    assert.equal(parseGenderField('male'), Gender.MALE);
    assert.equal(parseGenderField('female'), Gender.FEMALE);
  });

  test('null clears the gender, an absent field leaves it untouched', () => {
    assert.equal(parseGenderField(null), null);
    assert.equal(parseGenderField(undefined), undefined);
  });

  test('rejects anything else instead of silently dropping it', () => {
    for (const value of ['м', 'ж', 'other', 'Male', 'MALE', '', 123, 0, true, {}, ['male']]) {
      assert.throws(() => parseGenderField(value), ValidationError, JSON.stringify(value));
    }
  });

  test('the rejection message is the one the client shows', () => {
    assert.throws(() => parseGenderField('other'), { message: 'Invalid gender' });
  });
});

describe('parseFirstNameField', () => {
  test('trims a non-empty name', () => {
    assert.equal(parseFirstNameField('  Mia  '), 'Mia');
  });

  test('rejects an empty, blank or non-string name', () => {
    for (const value of ['', '   ', undefined, null, 42, {}]) {
      assert.throws(() => parseFirstNameField(value), ValidationError, JSON.stringify(value));
    }
  });
});

describe('parseLastNameField', () => {
  test('absent leaves it untouched, empty clears it', () => {
    assert.equal(parseLastNameField(undefined), undefined);
    assert.equal(parseLastNameField(null), undefined);
    assert.equal(parseLastNameField('  '), '');
    assert.equal(parseLastNameField(' Wallace '), 'Wallace');
  });

  test('rejects a non-string', () => {
    assert.throws(() => parseLastNameField(42), ValidationError);
  });
});
