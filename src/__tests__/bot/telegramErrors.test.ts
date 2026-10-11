import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isMessageNotModified } from '../../bot/utils/telegramErrors';

describe('isMessageNotModified', () => {
  test('detects the Telegram API description', () => {
    const error = { description: 'Bad Request: message is not modified: specified new message content and reply markup are exactly the same' };
    assert.equal(isMessageNotModified(error), true);
  });

  test('detects the message of an Error instance', () => {
    assert.equal(isMessageNotModified(new Error('400: Bad Request: message is not modified')), true);
  });

  test('other Telegram errors are not swallowed', () => {
    assert.equal(isMessageNotModified({ description: 'Bad Request: message to edit not found' }), false);
    assert.equal(isMessageNotModified(new Error('boom')), false);
  });

  test('non-error values are handled', () => {
    assert.equal(isMessageNotModified(undefined), false);
    assert.equal(isMessageNotModified(null), false);
    assert.equal(isMessageNotModified('message is not modified'), false);
  });
});
