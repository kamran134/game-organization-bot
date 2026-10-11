import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { rejectionForStatus } from '../../utils/gameStatusGuard';
import { GameStatus } from '../../models/Game';

describe('rejectionForStatus', () => {
  test('planned games are open', () => {
    assert.equal(rejectionForStatus(GameStatus.PLANNED), null);
  });

  test('cancelled games map to the 409 error and the bot alert', () => {
    assert.deepEqual(rejectionForStatus(GameStatus.CANCELLED), {
      webError: 'Game cancelled',
      botAlert: '❌ Игра отменена',
    });
  });

  test('completed games map to the 409 error and the bot alert', () => {
    assert.deepEqual(rejectionForStatus(GameStatus.COMPLETED), {
      webError: 'Game completed',
      botAlert: '🏁 Игра уже завершена',
    });
  });
});
