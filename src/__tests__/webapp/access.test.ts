import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createGroupAccessChecker } from '../../webapp/access';

const user = { id: 7, telegram_id: 555 };

function makeChecker(opts: {
  isMember?: boolean;
  chatId?: number | string | null;
  chatMember?: { status: string; is_member?: boolean } | Error;
}) {
  const calls = { getChatMember: 0 };
  const source = {
    isUserMember: async () => opts.isMember ?? false,
    getTelegramChatId: async () => opts.chatId ?? null,
  };
  const telegram = {
    getChatMember: async () => {
      calls.getChatMember += 1;
      if (opts.chatMember instanceof Error) throw opts.chatMember;
      return opts.chatMember ?? { status: 'left' };
    },
  };
  return { check: createGroupAccessChecker(source, telegram), calls };
}

describe('canAccessGroup', () => {
  test('active member is allowed without asking Telegram', async () => {
    const { check, calls } = makeChecker({ isMember: true, chatId: -100 });
    assert.equal(await check(user, 1), true);
    assert.equal(calls.getChatMember, 0);
  });

  test('non-member who is in the chat is allowed', async () => {
    for (const status of ['creator', 'administrator', 'member']) {
      const { check } = makeChecker({ chatId: -100, chatMember: { status } });
      assert.equal(await check(user, 1), true, status);
    }
  });

  test('restricted user counts only when still in the chat', async () => {
    assert.equal(await makeChecker({ chatId: -100, chatMember: { status: 'restricted', is_member: true } }).check(user, 1), true);
    assert.equal(await makeChecker({ chatId: -100, chatMember: { status: 'restricted', is_member: false } }).check(user, 1), false);
  });

  test('left or kicked user is denied', async () => {
    for (const status of ['left', 'kicked']) {
      const { check } = makeChecker({ chatId: -100, chatMember: { status } });
      assert.equal(await check(user, 1), false, status);
    }
  });

  test('Telegram API error denies access', async () => {
    const { check } = makeChecker({ chatId: -100, chatMember: new Error('Bad Request: chat not found') });
    assert.equal(await check(user, 1), false);
  });

  test('group without a linked chat denies non-members', async () => {
    const { check, calls } = makeChecker({ chatId: null });
    assert.equal(await check(user, 1), false);
    assert.equal(calls.getChatMember, 0);
  });
});
