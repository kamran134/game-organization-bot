import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isWizardInput } from '../../bot/utils/wizardInput';

const BOT_ID = 999;

function makeCtx(chatType: string, replyFromId?: number, botId: number | undefined = BOT_ID): any {
  return {
    chat: { type: chatType },
    botInfo: botId === undefined ? undefined : { id: botId },
    message: {
      text: 'hello',
      ...(replyFromId !== undefined ? { reply_to_message: { from: { id: replyFromId } } } : {}),
    },
  };
}

describe('isWizardInput', () => {
  test('private chat: any text counts', () => {
    assert.equal(isWizardInput(makeCtx('private')), true);
  });

  test('private chat: a reply to someone else still counts', () => {
    assert.equal(isWizardInput(makeCtx('private', 123)), true);
  });

  test('group: plain message does not count', () => {
    assert.equal(isWizardInput(makeCtx('group')), false);
    assert.equal(isWizardInput(makeCtx('supergroup')), false);
  });

  test('group: reply to the bot counts', () => {
    assert.equal(isWizardInput(makeCtx('supergroup', BOT_ID)), true);
  });

  test('group: reply to another user does not count', () => {
    assert.equal(isWizardInput(makeCtx('group', 123)), false);
  });

  test('group: unknown bot id never matches', () => {
    assert.equal(isWizardInput(makeCtx('group', undefined, undefined)), false);
  });
});
