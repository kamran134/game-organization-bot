import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Telegraf } from 'telegraf';
import { SpyActionsHandler } from '../../bot/handlers/SpyActionsHandler';
import { ConflictError, ValidationError } from '../../utils/errors';

interface Answer {
  text?: string;
  alert: boolean;
}

type VoteResult = Record<string, unknown>;

function makeHandler(options: {
  failWith?: Error;
  hostId?: number;
  isAdmin?: boolean;
  event?: unknown;
  voteResult?: VoteResult;
  turn?: { currentUserId: number; cycle: number; deadline: Date | null };
} = {}) {
  const answers: Answer[] = [];
  const calls: string[] = [];
  const event = options.event === undefined
    ? { id: 1, group_id: 5, host_id: options.hostId ?? 100, group: { telegram_chat_id: '-1' }, card_chat_id: null, card_message_id: null }
    : options.event;
  const fail = async (name: string, args?: unknown): Promise<void> => {
    calls.push(args === undefined ? name : `${name}:${JSON.stringify(args)}`);
    if (options.failWith) throw options.failWith;
  };

  const spyService = {
    getEvent: async () => event,
    getParticipants: async () => [
      { user_id: 7, user: { id: 7, fullName: 'Me' } },
      { user_id: 8, user: { id: 8, fullName: 'Other' } },
    ],
    join: (_e: number, userId: number) => fail('join', userId),
    leave: () => fail('leave'),
    closeRegistration: () => fail('close'),
    openVoting: () => fail('voting'),
    startRound: async () => {
      await fail('start');
      return { round: { number: 1 }, players: [{ user_id: 7, role: 'spy' }, { user_id: 9, role: 'civilian' }] };
    },
    nextTurn: async (_e: number, actorId: number, opts: { force?: boolean }) => {
      await fail('next', { actorId, force: opts.force });
      return options.turn ?? { roundId: 1, previousUserId: 7, currentUserId: 8, cycle: 2, deadline: null };
    },
    castVote: async (_e: number, voterId: number, targetId: number) => {
      await fail('vote', { voterId, targetId });
      return options.voteResult ?? { state: 'pending', round: {}, ballot: 1, tally: {} };
    },
  };
  const services = {
    spyService,
    userService: {
      findOrCreateUser: async () => ({ id: 7 }),
      getUserByTelegramId: async () => ({ id: 7 }),
    },
    groupService: {
      isUserMember: async () => false,
      addMemberToGroup: async () => { calls.push('addMember'); },
      isUserAdmin: async () => options.isAdmin ?? false,
    },
    notificationService: {
      updateSpyCard: async () => { calls.push('refresh'); },
      notifySpyRoundStarted: async (_e: unknown, _r: unknown, players: unknown[]) => { calls.push(`started:${players.length}`); },
      notifySpyTurn: async (_e: unknown, user: { id: number }) => { calls.push(`turn:${user.id}`); },
      notifySpyVoteTie: async (_e: unknown, leaders: unknown[], ballot: number) => { calls.push(`tie:${leaders.length}:${ballot}`); },
      notifySpyRoundFinished: async () => { calls.push('finished'); },
    },
  };
  const ctx = {
    from: { id: 1, first_name: 'A' },
    answerCbQuery: async (text?: string, extra?: { show_alert?: boolean }) => {
      answers.push({ text, alert: !!extra?.show_alert });
    },
  };
  const handler = new SpyActionsHandler(services as never);
  return { handler, ctx: ctx as never, answers, calls };
}

describe('SpyActionsHandler.handleJoin', () => {
  test('registers the user in the group, joins and refreshes the card', async () => {
    const { handler, ctx, answers, calls } = makeHandler();
    await handler.handleJoin(ctx, 1);
    assert.deepEqual(calls, ['addMember', 'join:7', 'refresh']);
    assert.deepEqual(answers, [{ text: '✅ Вы записаны', alert: false }]);
  });

  test('maps rejections to alerts and does not refresh', async () => {
    const cases: Array<[Error, string]> = [
      [new ConflictError('Already joined'), 'Вы уже записаны'],
      [new ConflictError('Event is full'), 'Мест нет'],
      [new ConflictError('Registration closed'), 'Запись закрыта'],
      [new ConflictError('Round in progress'), 'Партия уже идёт'],
    ];
    for (const [error, text] of cases) {
      const { handler, ctx, answers, calls } = makeHandler({ failWith: error });
      await handler.handleJoin(ctx, 1);
      assert.deepEqual(answers, [{ text, alert: true }], error.message);
      assert.ok(!calls.includes('refresh'));
    }
  });

  test('an unknown event is answered, not joined', async () => {
    const { handler, ctx, answers, calls } = makeHandler({ event: null });
    await handler.handleJoin(ctx, 1);
    assert.equal(answers.length, 1);
    assert.ok(!calls.includes('join:7'));
  });

  test('an unexpected error is not swallowed', async () => {
    const { handler, ctx } = makeHandler({ failWith: new Error('db down') });
    await assert.rejects(() => handler.handleJoin(ctx, 1), /db down/);
  });
});

describe('SpyActionsHandler.handleLeave', () => {
  test('leaves and refreshes', async () => {
    const { handler, ctx, answers, calls } = makeHandler();
    await handler.handleLeave(ctx, 1);
    assert.deepEqual(calls, ['leave', 'refresh']);
    assert.deepEqual(answers, [{ text: 'Вы вышли', alert: false }]);
  });

  test('"Not joined" is an alert, no refresh', async () => {
    const { handler, ctx, answers, calls } = makeHandler({ failWith: new ConflictError('Not joined') });
    await handler.handleLeave(ctx, 1);
    assert.deepEqual(answers, [{ text: 'Вы не записаны', alert: true }]);
    assert.ok(!calls.includes('refresh'));
  });
});

describe('SpyActionsHandler manager actions', () => {
  const actions: Array<[string, (h: SpyActionsHandler, ctx: never) => Promise<void>, string]> = [
    ['close', (h, ctx) => h.handleClose(ctx, 1), 'close'],
    ['start', (h, ctx) => h.handleStart(ctx, 1), 'start'],
    ['voting', (h, ctx) => h.handleOpenVoting(ctx, 1), 'voting'],
  ];

  for (const [name, run, call] of actions) {
    test(`${name}: refused for an ordinary player`, async () => {
      const { handler, ctx, answers, calls } = makeHandler({ hostId: 100, isAdmin: false });
      await run(handler, ctx);
      assert.equal(answers.length, 1);
      assert.equal(answers[0].alert, true);
      assert.deepEqual(calls, []);
    });

    test(`${name}: allowed for the organizer and for a group admin`, async () => {
      for (const opts of [{ hostId: 7 }, { hostId: 100, isAdmin: true }]) {
        const { handler, ctx, answers, calls } = makeHandler(opts);
        await run(handler, ctx);
        assert.ok(calls.includes(call), name);
        assert.ok(calls.includes('refresh'), name);
        assert.equal(answers[0].alert, false);
      }
    });
  }

  test('close: "Not enough players" shows the minimum', async () => {
    const { handler, ctx, answers } = makeHandler({ hostId: 7, failWith: new ConflictError('Not enough players') });
    await handler.handleClose(ctx, 1);
    assert.deepEqual(answers, [{ text: 'Нужно минимум 3 игрока', alert: true }]);
  });

  test('start: DMs every dealt player who is a known participant, then refreshes', async () => {
    const { handler, ctx, calls } = makeHandler({ hostId: 7 });
    await handler.handleStart(ctx, 1);
    // user 9 is not in the participants list and is skipped
    assert.deepEqual(calls, ['start', 'started:1', 'refresh']);
  });

  test('start: an empty location list is explained, nothing is announced', async () => {
    const { handler, ctx, answers, calls } = makeHandler({ hostId: 7, failWith: new ConflictError('No locations to play') });
    await handler.handleStart(ctx, 1);
    assert.equal(answers[0].alert, true);
    assert.ok(answers[0].text!.includes('локаций'));
    assert.ok(!calls.includes('refresh'));
  });

  test('an unknown event is answered', async () => {
    const { handler, ctx, answers } = makeHandler({ event: null });
    await handler.handleClose(ctx, 1);
    assert.equal(answers.length, 1);
    assert.equal(answers[0].alert, false);
  });
});

describe('SpyActionsHandler.handleNext', () => {
  test('a plain player passes their own turn without force and the next speaker is pinged', async () => {
    const { handler, ctx, answers, calls } = makeHandler({ hostId: 100 });
    await handler.handleNext(ctx, 1);
    assert.deepEqual(calls, ['next:{"actorId":7,"force":false}', 'turn:8', 'refresh']);
    assert.equal(answers[0].alert, false);
  });

  test('the organizer and an admin pass with force', async () => {
    for (const opts of [{ hostId: 7 }, { hostId: 100, isAdmin: true }]) {
      const { handler, ctx, calls } = makeHandler(opts);
      await handler.handleNext(ctx, 1);
      assert.ok(calls.includes('next:{"actorId":7,"force":true}'));
    }
  });

  test('"Not your turn" is an alert and nothing is announced', async () => {
    const { handler, ctx, answers, calls } = makeHandler({ failWith: new ConflictError('Not your turn') });
    await handler.handleNext(ctx, 1);
    assert.deepEqual(answers, [{ text: 'Сейчас не ваш ход', alert: true }]);
    assert.ok(!calls.includes('refresh'));
  });
});

describe('SpyActionsHandler.handleVote', () => {
  test('pending: the vote is accepted and the card refreshed', async () => {
    const { handler, ctx, answers, calls } = makeHandler();
    await handler.handleVote(ctx, 1, 8);
    assert.deepEqual(calls, ['vote:{"voterId":7,"targetId":8}', 'refresh']);
    assert.deepEqual(answers, [{ text: '🗳 Голос принят', alert: false }]);
  });

  test('tie: the group hears about the next ballot', async () => {
    const voteResult = { state: 'tie', round: {}, ballot: 1, nextBallot: 2, tally: {}, leaders: [7, 8] };
    const { handler, ctx, answers, calls } = makeHandler({ voteResult });
    await handler.handleVote(ctx, 1, 8);
    assert.deepEqual(calls, ['vote:{"voterId":7,"targetId":8}', 'tie:2:2', 'refresh']);
    assert.ok(answers[0].text!.includes('второй тур'));
  });

  test('resolved: the reveal is announced', async () => {
    const voteResult = { state: 'resolved', round: { number: 1 }, ballot: 1, tally: {}, resolution: {}, players: [] };
    const { handler, ctx, calls } = makeHandler({ voteResult });
    await handler.handleVote(ctx, 1, 8);
    assert.deepEqual(calls, ['vote:{"voterId":7,"targetId":8}', 'finished', 'refresh']);
  });

  test('service rejections become alerts', async () => {
    const cases: Array<[Error, string]> = [
      [new ValidationError('Cannot vote for yourself'), 'За себя голосовать нельзя'],
      [new ConflictError('Voter is not in the game'), 'Вы не участвуете в этой партии'],
      [new ValidationError('Vote for one of the leaders'), 'Во втором туре голосуют только за лидеров'],
      [new ConflictError('Wrong round state'), 'Сейчас это действие недоступно'],
    ];
    for (const [error, text] of cases) {
      const { handler, ctx, answers, calls } = makeHandler({ failWith: error });
      await handler.handleVote(ctx, 1, 8);
      assert.deepEqual(answers, [{ text, alert: true }], error.message);
      assert.ok(!calls.includes('refresh'));
    }
  });
});

describe('SpyActionsHandler.register', () => {
  function registered(): Array<{ pattern: RegExp; run: (ctx: unknown) => Promise<void> }> {
    const actions: Array<{ pattern: RegExp; run: (ctx: unknown) => Promise<void> }> = [];
    const bot = { action: (pattern: RegExp, run: (ctx: unknown) => Promise<void>) => { actions.push({ pattern, run }); } };
    makeHandler().handler.register(bot as unknown as Telegraf);
    return actions;
  }

  test('"spy_voting_<id>" never reaches the vote handler and "spy_vote_<id>_<id>" never opens voting', () => {
    const patterns = registered().map((a) => a.pattern);
    const handling = (data: string): string[] => patterns.filter((p) => p.test(data)).map((p) => p.source);

    assert.deepEqual(handling('spy_voting_5'), ['^spy_voting_(\\d+)$']);
    assert.deepEqual(handling('spy_vote_5_7'), ['^spy_vote_(\\d+)_(\\d+)$']);
    assert.deepEqual(handling('spy_vote_5'), []);
    assert.deepEqual(handling('spy_voting_5_7'), []);
  });

  test('each of the seven callbacks has exactly one handler', () => {
    const patterns = registered().map((a) => a.pattern);
    const samples = ['spy_join_5', 'spy_leave_5', 'spy_close_5', 'spy_start_5', 'spy_next_5', 'spy_voting_5', 'spy_vote_5_7'];
    for (const data of samples) {
      assert.equal(patterns.filter((p) => p.test(data)).length, 1, data);
    }
  });

  test('the vote pattern passes the event id and the target id in that order', async () => {
    const { handler, ctx, calls } = makeHandler();
    const actions: Array<{ pattern: RegExp; run: (ctx: unknown) => Promise<void> }> = [];
    handler.register({ action: (pattern: RegExp, run: (ctx: unknown) => Promise<void>) => { actions.push({ pattern, run }); } } as never);

    const vote = actions.find((a) => a.pattern.test('spy_vote_5_8'))!;
    const match = vote.pattern.exec('spy_vote_5_8')!;
    await vote.run({ ...(ctx as object), match });
    assert.ok(calls.includes('vote:{"voterId":7,"targetId":8}'));
  });
});
