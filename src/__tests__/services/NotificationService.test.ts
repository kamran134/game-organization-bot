import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { NotificationService } from '../../services/NotificationService';
import { ParticipationStatus } from '../../models/GameParticipant';
import { Game } from '../../models/Game';
import { User } from '../../models/User';

interface SentMessage {
  chatId: number;
  text: string;
  extra: { parse_mode?: string } | undefined;
}

function makeFakes(options: { sendFails?: boolean; members?: unknown[]; group?: unknown } = {}) {
  const sent: SentMessage[] = [];
  const telegram = {
    sendMessage: async (chatId: number, text: string, extra?: { parse_mode?: string }): Promise<void> => {
      if (options.sendFails) throw new Error('403 Forbidden: bot was kicked');
      sent.push({ chatId, text, extra });
    },
  };
  const groupService = {
    getGroupById: async (): Promise<unknown> => options.group ?? { id: 1, telegram_chat_id: '-1001' },
    getGroupMembers: async (): Promise<unknown[]> => options.members ?? [],
  };
  const jokeService = { getDeclineJoke: async (): Promise<string> => 'a <b> joke & more' };
  const service = new NotificationService(telegram as never, groupService as never, jokeService as never);
  return { service, sent };
}

function makeGame(chatId: number | string | null): Game {
  return {
    id: 5,
    game_date: new Date('2026-03-01T18:00:00Z'),
    group: { id: 1, telegram_chat_id: chatId },
    sport: { emoji: '⚽', name: 'Футбол' },
    participants: [],
  } as unknown as Game;
}

const user = { fullName: 'Tom <&> Jerry' } as unknown as User;

// Silence the expected diagnostics of the skip / failure paths
function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const { error, warn } = console;
  console.error = (): void => undefined;
  console.warn = (): void => undefined;
  return fn().finally(() => {
    console.error = error;
    console.warn = warn;
  });
}

describe('NotificationService.notifyJoined', () => {
  test('escapes HTML in the user name and sends with parse_mode HTML', async () => {
    const { service, sent } = makeFakes();

    await service.notifyJoined(makeGame('-1001'), user, ParticipationStatus.CONFIRMED, false);

    assert.equal(sent.length, 1);
    assert.equal(sent[0].chatId, -1001);
    assert.equal(sent[0].extra?.parse_mode, 'HTML');
    assert.equal(sent[0].text, '✅ Новая запись: Tom &lt;&amp;&gt; Jerry — точно идёт');
  });

  test('uses the update label and maybe wording', async () => {
    const { service, sent } = makeFakes();

    await service.notifyJoined(makeGame(-1001), user, ParticipationStatus.MAYBE, true);

    assert.equal(sent[0].text, '❓ Обновление: Tom &lt;&amp;&gt; Jerry — возможно придёт');
  });

  test('web variant appends the escaped participants list', async () => {
    const { service, sent } = makeFakes();

    await service.notifyJoined(makeGame(-1001), user, ParticipationStatus.MAYBE, false, 'web');

    assert.match(sent[0].text, /^❓ Новая запись "не точно" \(веб\): Tom &lt;&amp;&gt; Jerry\n\n👥 Участники игры/);
  });

  test('does not throw when sendMessage rejects', async () => {
    const { service } = makeFakes({ sendFails: true });

    await quiet(() => service.notifyJoined(makeGame(-1001), user, ParticipationStatus.CONFIRMED, false));
  });

  test('skips when the group has no chat id', async () => {
    const { service, sent } = makeFakes();

    await quiet(() => service.notifyJoined(makeGame(null), user, ParticipationStatus.CONFIRMED, false));

    assert.equal(sent.length, 0);
  });
});

describe('NotificationService.notifyDeclined', () => {
  test('includes the escaped joke', async () => {
    const { service, sent } = makeFakes();

    await service.notifyDeclined(makeGame(-1001), user);

    assert.equal(
      sent[0].text,
      '❌ Tom &lt;&amp;&gt; Jerry отказался от участия\n\n🤖 <i>a &lt;b&gt; joke &amp; more</i>',
    );
    assert.equal(sent[0].extra?.parse_mode, 'HTML');
  });

  test('web variant names the web app and lists participants', async () => {
    const { service, sent } = makeFakes();

    await service.notifyDeclined(makeGame(-1001), user, 'web');

    assert.match(sent[0].text, /отказался от участия через веб-приложение\n\n🤖 <i>.*<\/i>\n\n👥 Участники игры/s);
  });

  test('does not throw when sendMessage rejects', async () => {
    const { service } = makeFakes({ sendFails: true });

    await quiet(() => service.notifyDeclined(makeGame(-1001), user));
  });

  test('skips when the group has no chat id', async () => {
    const { service, sent } = makeFakes();

    await quiet(() => service.notifyDeclined(makeGame(null), user));

    assert.equal(sent.length, 0);
  });
});

describe('NotificationService.mentionMembers', () => {
  test('sends the 👆 ping with member mentions', async () => {
    const members = [
      { user: { telegram_id: 1, username: 'alice' } },
      { user: { telegram_id: 2, first_name: 'Bob <x>' } },
    ];
    const { service, sent } = makeFakes({ members });

    await service.mentionMembers(1);

    assert.equal(sent[0].text, '👆 @alice <a href="tg://user?id=2">Bob &lt;x&gt;</a>');
    assert.equal(sent[0].extra?.parse_mode, 'HTML');
  });

  test('sends nothing when there is nobody to mention', async () => {
    const { service, sent } = makeFakes({ members: [] });

    await service.mentionMembers(1);

    assert.equal(sent.length, 0);
  });

  test('skips when the group has no chat id', async () => {
    const { service, sent } = makeFakes({ group: { id: 1, telegram_chat_id: null }, members: [{ user: { telegram_id: 1, username: 'a' } }] });

    await quiet(() => service.mentionMembers(1));

    assert.equal(sent.length, 0);
  });

  test('does not throw when sendMessage rejects', async () => {
    const { service } = makeFakes({ sendFails: true, members: [{ user: { telegram_id: 1, username: 'a' } }] });

    await quiet(() => service.mentionMembers(1));
  });
});

describe('NotificationService game cards', () => {
  test('notifyGameCreated sends the card with a keyboard without admin buttons', async () => {
    const { service, sent } = makeFakes();

    await service.notifyGameCreated(makeGame(-1001));

    assert.equal(sent.length, 1);
    assert.match(sent[0].text, /^✅ Игра создана!/);
    const buttons = JSON.stringify((sent[0].extra as { reply_markup?: unknown }).reply_markup);
    assert.ok(buttons.includes('join_confirmed_5'));
    assert.ok(!buttons.includes('delete_game_'));
  });

  test('notifyGameDeleted escapes the sport name', async () => {
    const { service, sent } = makeFakes();
    const game = makeGame(-1001);
    game.sport = { emoji: '⚽', name: 'A&B' } as Game['sport'];

    await service.notifyGameDeleted(game);

    assert.match(sent[0].text, /^🗑 Игра удалена администратором\n\n⚽ A&amp;B\n📅 /);
  });
});
