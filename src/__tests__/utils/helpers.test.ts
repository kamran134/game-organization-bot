import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeMarkdownV1, escapeMarkdown, generateInviteCode, formatDate } from '../../utils/helpers';

describe('escapeMarkdownV1', () => {
  test('escapes underscore', () => {
    assert.equal(escapeMarkdownV1('hello_world'), 'hello\\_world');
  });

  test('escapes asterisk', () => {
    assert.equal(escapeMarkdownV1('*bold*'), '\\*bold\\*');
  });

  test('escapes backtick', () => {
    assert.equal(escapeMarkdownV1('`code`'), '\\`code\\`');
  });

  test('escapes opening bracket', () => {
    assert.equal(escapeMarkdownV1('[link]'), '\\[link]');
  });

  test('does not escape closing bracket', () => {
    assert.equal(escapeMarkdownV1('a]b'), 'a]b');
  });

  test('leaves plain text unchanged', () => {
    assert.equal(escapeMarkdownV1('Hello World 123'), 'Hello World 123');
  });

  test('handles empty string', () => {
    assert.equal(escapeMarkdownV1(''), '');
  });

  test('escapes multiple chars in one string', () => {
    assert.equal(escapeMarkdownV1('_*`['), '\\_\\*\\`\\[');
  });
});

describe('escapeMarkdown (MarkdownV2)', () => {
  test('escapes exclamation mark', () => {
    assert.equal(escapeMarkdown('Hello!'), 'Hello\\!');
  });

  test('escapes dot', () => {
    assert.equal(escapeMarkdown('v1.0'), 'v1\\.0');
  });

  test('escapes dash', () => {
    assert.equal(escapeMarkdown('a-b'), 'a\\-b');
  });

  test('escapes parentheses', () => {
    assert.equal(escapeMarkdown('(text)'), '\\(text\\)');
  });

  test('escapes tilde', () => {
    assert.equal(escapeMarkdown('~strike~'), '\\~strike\\~');
  });

  test('leaves alphanumeric unchanged', () => {
    assert.equal(escapeMarkdown('hello123'), 'hello123');
  });

  test('handles empty string', () => {
    assert.equal(escapeMarkdown(''), '');
  });
});

describe('generateInviteCode', () => {
  test('returns 8 characters by default', () => {
    assert.equal(generateInviteCode().length, 8);
  });

  test('returns only uppercase hex characters', () => {
    assert.match(generateInviteCode(), /^[0-9A-F]{8}$/);
  });

  test('respects custom length', () => {
    assert.equal(generateInviteCode(12).length, 12);
    assert.equal(generateInviteCode(4).length, 4);
  });

  test('generates unique codes each call', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateInviteCode()));
    // With 8 hex chars there are 16^8 = 4B possibilities; 20 collisions would be astronomically unlikely
    assert.equal(codes.size, 20);
  });
});

describe('formatDate', () => {
  test('contains day, year, and time', () => {
    const date = new Date(2026, 1, 15, 18, 30); // Feb 15 2026 18:30
    const result = formatDate(date);
    assert.match(result, /15/);
    assert.match(result, /2026/);
    assert.match(result, /18:30/);
  });

  test('uses Russian locale month names', () => {
    const date = new Date(2026, 5, 1, 10, 0); // June 1 2026
    const result = formatDate(date);
    assert.match(result, /июн/i);
  });
});
