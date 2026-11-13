import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSantaEventBody, parseWishlist } from '../../webapp/santaBodyValidator';
import { ValidationError } from '../../utils/errors';

describe('parseSantaEventBody', () => {
  test('trims fields and keeps a valid date', () => {
    const body = parseSantaEventBody({
      title: '  Новый год  ', budget: ' до 30 AZN ', description: ' fun ', exchange_date: '2026-12-31',
    });
    assert.deepEqual(body, { title: 'Новый год', budget: 'до 30 AZN', description: 'fun', exchange_date: '2026-12-31' });
  });

  test('empty optional fields become null', () => {
    const body = parseSantaEventBody({ title: 'X', budget: '  ', description: '', exchange_date: '' });
    assert.deepEqual(body, { title: 'X', budget: null, description: null, exchange_date: null });
  });

  test('absent optional fields become null', () => {
    assert.deepEqual(parseSantaEventBody({ title: 'X' }), {
      title: 'X', budget: null, description: null, exchange_date: null,
    });
  });

  test('title is required and limited to 100', () => {
    assert.throws(() => parseSantaEventBody({}), ValidationError);
    assert.throws(() => parseSantaEventBody({ title: '   ' }), ValidationError);
    assert.throws(() => parseSantaEventBody({ title: 5 }), ValidationError);
    assert.doesNotThrow(() => parseSantaEventBody({ title: 'a'.repeat(100) }));
    assert.throws(() => parseSantaEventBody({ title: 'a'.repeat(101) }), ValidationError);
  });

  test('description is limited to 500 and budget to 50', () => {
    assert.doesNotThrow(() => parseSantaEventBody({ title: 'X', description: 'a'.repeat(500) }));
    assert.throws(() => parseSantaEventBody({ title: 'X', description: 'a'.repeat(501) }), ValidationError);
    assert.doesNotThrow(() => parseSantaEventBody({ title: 'X', budget: 'a'.repeat(50) }));
    assert.throws(() => parseSantaEventBody({ title: 'X', budget: 'a'.repeat(51) }), ValidationError);
  });

  test('rejects invalid dates', () => {
    for (const bad of ['2026-02-30', 'abc', '2026-13-01', '2026-1-1', '31.12.2026', 20261231]) {
      assert.throws(() => parseSantaEventBody({ title: 'X', exchange_date: bad }), ValidationError, String(bad));
    }
  });

  test('accepts a leap day only in a leap year', () => {
    assert.doesNotThrow(() => parseSantaEventBody({ title: 'X', exchange_date: '2028-02-29' }));
    assert.throws(() => parseSantaEventBody({ title: 'X', exchange_date: '2027-02-29' }), ValidationError);
  });
});

describe('parseWishlist', () => {
  test('trims and turns empty into null', () => {
    assert.equal(parseWishlist('  socks  '), 'socks');
    assert.equal(parseWishlist('   '), null);
    assert.equal(parseWishlist(undefined), null);
    assert.equal(parseWishlist(null), null);
  });

  test('is limited to 1000 characters', () => {
    assert.equal(parseWishlist('a'.repeat(1000))?.length, 1000);
    assert.throws(() => parseWishlist('a'.repeat(1001)), ValidationError);
  });

  test('rejects non-strings', () => {
    assert.throws(() => parseWishlist(42), ValidationError);
    assert.throws(() => parseWishlist({}), ValidationError);
    assert.throws(() => parseWishlist(['a']), ValidationError);
  });
});
