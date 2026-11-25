import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyGuess, normalizeGuess, similarity } from '../../utils/spyGuess';

describe('normalizeGuess', () => {
  test('trims, lower-cases and folds yo', () => {
    assert.equal(normalizeGuess('  Берёзовая РОЩА '), 'березовая роща');
  });

  test('collapses inner whitespace', () => {
    assert.equal(normalizeGuess('Ночной   \t клуб'), 'ночной клуб');
  });

  test('strips punctuation at the edges only', () => {
    assert.equal(normalizeGuess('"Больница!"'), 'больница');
    assert.equal(normalizeGuess('...кафе-бар?!'), 'кафе-бар');
  });

  test('empty and punctuation-only input becomes empty', () => {
    assert.equal(normalizeGuess(''), '');
    assert.equal(normalizeGuess('   '), '');
    assert.equal(normalizeGuess('?!..'), '');
  });
});

describe('similarity', () => {
  test('identical strings score 100', () => {
    assert.equal(similarity('школа', 'школа'), 100);
  });

  test('disjoint strings score 0', () => {
    assert.equal(similarity('abc', 'xyz'), 0);
  });

  test('empty strings', () => {
    assert.equal(similarity('', ''), 100);
    assert.equal(similarity('abc', ''), 0);
    assert.equal(similarity('', 'abc'), 0);
  });

  test('matches rapidfuzz fuzz.ratio on known pairs', () => {
    // fuzz.ratio("this is a test", "this is a test!") == 96.55172413793103
    assert.ok(Math.abs(similarity('this is a test', 'this is a test!') - 96.55172413793103) < 1e-9);
    // fuzz.ratio("abcd", "abce") == 75.0
    assert.equal(similarity('abcd', 'abce'), 75);
  });

  test('is symmetric', () => {
    assert.equal(similarity('больница', 'больнца'), similarity('больнца', 'больница'));
  });
});

describe('classifyGuess', () => {
  test('case-insensitive exact match is correct', () => {
    assert.equal(classifyGuess('больница', 'Больница'), 'correct');
  });

  test('yo and surrounding noise do not matter', () => {
    assert.equal(classifyGuess(' берёзовая роща! ', 'Березовая роща'), 'correct');
  });

  test('a different location is wrong', () => {
    assert.equal(classifyGuess('школа', 'Больница'), 'wrong');
  });

  test('a one-letter typo is not wrong', () => {
    assert.notEqual(classifyGuess('больнца', 'Больница'), 'wrong');
    assert.notEqual(classifyGuess('болница', 'Больница'), 'wrong');
  });

  test('a long name with one typo is correct', () => {
    assert.equal(classifyGuess('железнодорожный вокзал', 'Железнодорожный вокзал'), 'correct');
    assert.equal(classifyGuess('железнодорожный вокзл', 'Железнодорожный вокзал'), 'correct');
  });

  test('thresholds: 85 and above is correct, 70 and above is close', () => {
    // 20 chars vs 20 chars sharing 17 -> 85 exactly (correct); sharing 14 -> 70 exactly (close).
    const location = 'a'.repeat(20);
    assert.equal(classifyGuess('a'.repeat(17) + 'b'.repeat(3), location), 'correct');
    assert.equal(classifyGuess('a'.repeat(14) + 'b'.repeat(6), location), 'close');
    assert.equal(classifyGuess('a'.repeat(13) + 'b'.repeat(7), location), 'wrong');
  });

  test('an empty guess is wrong', () => {
    assert.equal(classifyGuess('', 'Больница'), 'wrong');
    assert.equal(classifyGuess('  ?! ', 'Больница'), 'wrong');
  });
});
