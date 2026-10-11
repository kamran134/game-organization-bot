import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { KeyboardBuilder, GameLifecycleState } from '../../bot/ui/KeyboardBuilder';
import { GameStatus } from '../../models/Game';

function callbackData(gameId: number, isAdmin: boolean, inGroup: boolean, game?: GameLifecycleState): string[] {
  const keyboard = KeyboardBuilder.createGameActionsKeyboard(gameId, 2, isAdmin, 1, inGroup, 3, game);
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

describe('KeyboardBuilder.createGameActionsKeyboard lifecycle buttons', () => {
  const future = { status: GameStatus.PLANNED, game_date: new Date(Date.now() + 3600 * 1000) };
  const started = { status: GameStatus.PLANNED, game_date: new Date(Date.now() - 3600 * 1000) };

  test('admin in private chat sees cancel before the game starts', () => {
    const data = callbackData(7, true, false, future);

    assert.ok(data.includes('call_off_7'));
    assert.ok(!data.includes('complete_game_7'));
  });

  test('admin in private chat sees complete once the game has started', () => {
    const data = callbackData(7, true, false, started);

    assert.ok(data.includes('complete_game_7'));
    assert.ok(!data.includes('call_off_7'));
  });

  test('without a game the card is treated as planned and not started', () => {
    assert.ok(callbackData(7, true, false).includes('call_off_7'));
  });

  test('cancelled and completed games have no lifecycle buttons but keep join/leave', () => {
    for (const status of [GameStatus.CANCELLED, GameStatus.COMPLETED]) {
      const data = callbackData(7, true, false, { status, game_date: future.game_date });

      assert.ok(!data.includes('call_off_7'));
      assert.ok(!data.includes('complete_game_7'));
      assert.ok(data.includes('join_confirmed_7'));
      assert.ok(data.includes('leave_game_7'));
    }
  });

  test('non-admins and group chats never see lifecycle buttons', () => {
    for (const data of [callbackData(7, false, false, future), callbackData(7, true, true, future), callbackData(7, false, false, started)]) {
      assert.ok(!data.includes('call_off_7'));
      assert.ok(!data.includes('complete_game_7'));
    }
  });
});
