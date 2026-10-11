import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { KeyboardBuilder } from '../../bot/ui/KeyboardBuilder';

function callbackData(gameId: number, isAdmin: boolean, inGroup: boolean): string[] {
  const keyboard = KeyboardBuilder.createGameActionsKeyboard(gameId, 2, isAdmin, 1, inGroup, 3);
  return keyboard.reply_markup.inline_keyboard
    .flat()
    .map((button) => ('callback_data' in button ? button.callback_data : ''));
}

describe('KeyboardBuilder.createGameActionsKeyboard admin buttons', () => {
  test('admin in a group chat gets no admin buttons', () => {
    const data = callbackData(7, true, true);

    assert.ok(!data.includes('set_lock_7'));
    assert.ok(!data.includes('delete_game_7'));
    assert.ok(data.includes('send_to_dm_7'));
  });

  test('group keyboard is identical for admins and non-admins', () => {
    assert.deepEqual(callbackData(7, true, true), callbackData(7, false, true));
  });

  test('admin in a private chat gets lock and delete buttons', () => {
    const data = callbackData(7, true, false);

    assert.ok(data.includes('set_lock_7'));
    assert.ok(data.includes('delete_game_7'));
    assert.ok(!data.includes('send_to_dm_7'));
  });

  test('non-admin in a private chat gets no admin buttons', () => {
    const data = callbackData(7, false, false);

    assert.ok(!data.includes('set_lock_7'));
    assert.ok(!data.includes('delete_game_7'));
  });
});
