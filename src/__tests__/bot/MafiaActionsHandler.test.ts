import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MafiaActionsHandler } from '../../bot/handlers/MafiaActionsHandler';
import { ConflictError } from '../../utils/errors';

interface Answer {
  text?: string;
  alert: boolean;
}

function makeHandler(options: {
  joinError?: string;
  leaveError?: string;
  closeError?: string;
  hostId?: number;
  isAdmin?: boolean;
  event?: unknown;
} = {}) {
  const answers: Answer[] = [];
  const calls: string[] = [];
  const event = options.event === undefined
    ? { id: 1, group_id: 5, host_id: options.hostId ?? 100, group: { telegram_chat_id: '-1' }, card_chat_id: null, card_message_id: null }
    : options.event;

  const mafiaService = {
    getEvent: async () => event,
    getParticipants: async () => [],
    join: async () => { calls.push('join'); if (options.joinError) throw new ConflictError(options.joinError); },
    leave: async () => { calls.push('leave'); if (options.leaveError) throw new ConflictError(options.leaveError); },
    closeRegistration: async () => { calls.push('close'); if (options.closeError) throw new ConflictError(options.closeError); },
  };
  const services = {
    mafiaService,
    userService: {
      findOrCreateUser: async () => ({ id: 7 }),
      getUserByTelegramId: async () => ({ id: 7 }),
    },
    groupService: {
      isUserMember: async () => false,
      addMemberToGroup: async () => { calls.push('addMember'); },
      isUserAdmin: async () => options.isAdmin ?? false,
    },
    notificationService: { updateMafiaCard: async () => { calls.push('refresh'); } },
  };
  const ctx = {
    from: { id: 1, first_name: 'A' },
    answerCbQuery: async (text?: string, extra?: { show_alert?: boolean }) => {
      answers.push({ text, alert: !!extra?.show_alert });
    },
  };
  const handler = new MafiaActionsHandler(services as never);
  return { handler, ctx: ctx as never, answers, calls };
}

describe('MafiaActionsHandler.handleJoin', () => {
  test('registers the user in the group, joins and refreshes the card', async () => {
    const { handler, ctx, answers, calls } = makeHandler();
    await handler.handleJoin(ctx, 1);
    assert.deepEqual(calls, ['addMember', 'join', 'refresh']);
    assert.deepEqual(answers, [{ text: '✅ Вы записаны', alert: false }]);
  });

  test('maps rejections to alerts and does not refresh', async () => {
    const cases: Array<[string, string]> = [
      ['Host cannot play', 'Ведущий не играет'],
      ['Already joined', 'Вы уже записаны'],
      ['Event is full', 'Мест нет'],
      ['Registration closed', 'Запись закрыта'],
      ['Roles already dealt', 'Запись закрыта'],
    ];
    for (const [error, text] of cases) {
      const { handler, ctx, answers, calls } = makeHandler({ joinError: error });
      await handler.handleJoin(ctx, 1);
      assert.deepEqual(answers, [{ text, alert: true }], error);
      assert.ok(!calls.includes('refresh'));
    }
  });

  test('an unknown event is answered, not joined', async () => {
    const { handler, ctx, answers, calls } = makeHandler({ event: null });
    await handler.handleJoin(ctx, 1);
    assert.equal(answers.length, 1);
    assert.ok(!calls.includes('join'));
  });
});

describe('MafiaActionsHandler.handleLeave', () => {
  test('leaves and refreshes', async () => {
    const { handler, ctx, answers, calls } = makeHandler();
    await handler.handleLeave(ctx, 1);
    assert.deepEqual(calls, ['leave', 'refresh']);
    assert.equal(answers[0].text, 'Вы вышли');
  });

  test('answers when not joined or already closed', async () => {
    const notJoined = makeHandler({ leaveError: 'Not joined' });
    await notJoined.handler.handleLeave(notJoined.ctx, 1);
    assert.deepEqual(notJoined.answers, [{ text: 'Вы не записаны', alert: true }]);

    const closed = makeHandler({ leaveError: 'Registration closed' });
    await closed.handler.handleLeave(closed.ctx, 1);
    assert.deepEqual(closed.answers, [{ text: 'Запись закрыта', alert: true }]);
  });
});

describe('MafiaActionsHandler.handleClose', () => {
  test('the host can close', async () => {
    const { handler, ctx, answers, calls } = makeHandler({ hostId: 7 });
    await handler.handleClose(ctx, 1);
    assert.deepEqual(calls, ['close', 'refresh']);
    assert.equal(answers[0].alert, false);
  });

  test('a group admin can close', async () => {
    const { handler, ctx, calls } = makeHandler({ isAdmin: true });
    await handler.handleClose(ctx, 1);
    assert.deepEqual(calls, ['close', 'refresh']);
  });

  test('anyone else gets an alert and nothing happens', async () => {
    const { handler, ctx, answers, calls } = makeHandler();
    await handler.handleClose(ctx, 1);
    assert.deepEqual(calls, []);
    assert.deepEqual(answers, [{ text: 'Только ведущий или админ может закрыть запись', alert: true }]);
  });

  test('too few players and an already closed event are reported', async () => {
    const few = makeHandler({ hostId: 7, closeError: 'Not enough players' });
    await few.handler.handleClose(few.ctx, 1);
    assert.equal(few.answers[0].alert, true);
    assert.ok(few.answers[0].text!.includes('минимум'));
    assert.ok(!few.calls.includes('refresh'));

    const closed = makeHandler({ hostId: 7, closeError: 'Registration closed' });
    await closed.handler.handleClose(closed.ctx, 1);
    assert.deepEqual(closed.answers, [{ text: 'Запись закрыта', alert: true }]);
  });
});
