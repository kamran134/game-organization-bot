import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CreateGroupCommand } from '../../bot/commands/CreateGroupCommand';
import type { CommandServices } from '../../bot/commands/base/CommandHandler';

// ── Mock services ─────────────────────────────────────────────────────────────

function makeServices(overrides: Partial<{
  userResult: { id: number } | null;
}> = {}): CommandServices {
  const { userResult = { id: 42 } } = overrides;

  return {
    userService: {
      getUserByTelegramId: async () => userResult,
    } as any,
    groupService: {
      createGroup: async (name: string, userId: number) =>
        ({ id: 1, name, creator_id: userId }),
    } as any,
    gameService: {} as any,
    sportService: {} as any,
    gameCreationStates: {} as any,
  };
}

/** Minimal Telegraf Context mock for testing. */
function makeCtx(telegramId: number = 1): { ctx: any; replies: string[] } {
  const replies: string[] = [];
  const ctx = {
    from: { id: telegramId },
    reply: async (text: string) => { replies.push(text); },
  };
  return { ctx, replies };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CreateGroupCommand — command metadata', () => {
  test('command name is "creategroup"', () => {
    const cmd = new CreateGroupCommand(makeServices());
    assert.equal(cmd.command, 'creategroup');
  });
});

describe('CreateGroupCommand — pending state', () => {
  test('hasPendingState returns false initially', () => {
    const cmd = new CreateGroupCommand(makeServices());
    assert.equal(cmd.hasPendingState(123), false);
  });

  test('hasPendingState returns true after execute', async () => {
    const cmd = new CreateGroupCommand(makeServices());
    const { ctx } = makeCtx(123);
    await cmd.execute(ctx as any);
    assert.equal(cmd.hasPendingState(123), true);
  });

  test('hasPendingState is false for different user', async () => {
    const cmd = new CreateGroupCommand(makeServices());
    const { ctx } = makeCtx(123);
    await cmd.execute(ctx as any);
    assert.equal(cmd.hasPendingState(456), false);
  });

  test('pending state is cleared after handleTextInput', async () => {
    const cmd = new CreateGroupCommand(makeServices());
    const { ctx } = makeCtx(1);
    await cmd.execute(ctx as any);
    await cmd.handleTextInput(ctx as any, 1, 'Valid Group Name');
    assert.equal(cmd.hasPendingState(1), false);
  });
});

describe('CreateGroupCommand — execute', () => {
  test('prompts for group name', async () => {
    const cmd = new CreateGroupCommand(makeServices());
    const { ctx, replies } = makeCtx(1);
    await cmd.execute(ctx as any);
    assert.equal(replies.length, 1);
    assert.match(replies[0], /название/i);
  });

  test('shows error when user not registered', async () => {
    const cmd = new CreateGroupCommand(makeServices({ userResult: null }));
    const { ctx, replies } = makeCtx(1);
    await cmd.execute(ctx as any);
    assert.match(replies[0], /зарегистрируйтесь/i);
    assert.equal(cmd.hasPendingState(1), false);
  });
});

describe('CreateGroupCommand — handleTextInput validation', () => {
  test('rejects name shorter than 3 chars', async () => {
    const cmd = new CreateGroupCommand(makeServices());
    const { ctx, replies } = makeCtx(1);
    await cmd.execute(ctx as any);
    await cmd.handleTextInput(ctx as any, 1, 'AB');
    assert.match(replies[replies.length - 1], /3 символ/i);
  });

  test('rejects empty string', async () => {
    const cmd = new CreateGroupCommand(makeServices());
    const { ctx, replies } = makeCtx(1);
    await cmd.execute(ctx as any);
    await cmd.handleTextInput(ctx as any, 1, '  ');
    assert.match(replies[replies.length - 1], /3 символ/i);
  });

  test('rejects name longer than 100 chars', async () => {
    const cmd = new CreateGroupCommand(makeServices());
    const { ctx, replies } = makeCtx(1);
    await cmd.execute(ctx as any);
    await cmd.handleTextInput(ctx as any, 1, 'x'.repeat(101));
    assert.match(replies[replies.length - 1], /100 символ/i);
  });

  test('accepts valid name and creates group', async () => {
    const cmd = new CreateGroupCommand(makeServices());
    const { ctx, replies } = makeCtx(1);
    await cmd.execute(ctx as any);
    await cmd.handleTextInput(ctx as any, 1, 'Футбол по пятницам');
    assert.match(replies[replies.length - 1], /создана/i);
  });

  test('includes group name in success reply', async () => {
    const cmd = new CreateGroupCommand(makeServices());
    const { ctx, replies } = makeCtx(1);
    await cmd.execute(ctx as any);
    await cmd.handleTextInput(ctx as any, 1, 'Мой Клуб');
    assert.match(replies[replies.length - 1], /Мой Клуб/);
  });
});
