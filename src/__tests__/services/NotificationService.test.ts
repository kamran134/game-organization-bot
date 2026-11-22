import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { NotificationService } from '../../services/NotificationService';
import { ParticipationStatus } from '../../models/GameParticipant';
import { Game } from '../../models/Game';
import { GameType } from '../../models/GameType';
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

describe('NotificationService.notifyCancelled', () => {
  function cancelledGame(overrides: Record<string, unknown> = {}): Game {
    return {
      ...makeGame('-1001'),
      type: GameType.GAME,
      min_participants: 6,
      location: { name: 'Арена <1>' },
      participants: [
        { participation_status: 'confirmed', user: { telegram_id: 11, username: 'tom' } },
        { participation_status: 'maybe', user: { telegram_id: 12, first_name: 'Ann', last_name: '<&>' } },
        { participation_status: 'guest', guest_name: 'Bob <b>' },
        { participation_status: 'guest', guest_name: 'Eve' },
      ],
      ...overrides,
    } as unknown as Game;
  }

  test('manual cancel: short header, game line, mentions and escaped guests without links', async () => {
    const { service, sent } = makeFakes();

    await service.notifyCancelled(cancelledGame(), 'manual');

    assert.equal(sent.length, 1);
    assert.equal(sent[0].chatId, -1001);
    assert.equal(sent[0].extra?.parse_mode, 'HTML');
    const text = sent[0].text;
    assert.ok(text.startsWith('🚫 Игра отменена\n\n⚽ Футбол\n📅 '));
    assert.ok(!text.includes('минимальное'));
    assert.ok(text.includes('\n📍 Арена &lt;1&gt;'));
    assert.ok(text.includes('@tom'));
    assert.ok(text.includes('<a href="tg://user?id=12">Ann &lt;&amp;&gt;</a>'));
    assert.ok(text.includes('Bob &lt;b&gt;, Eve'));
    assert.ok(!text.includes('<a href="tg://user?id=undefined"'));
    assert.equal((text.match(/<a /g) ?? []).length, 1);
  });

  test('auto cancel states the reason with certain/min counts (confirmed + guests)', async () => {
    const { service, sent } = makeFakes();

    await service.notifyCancelled(cancelledGame(), 'min_not_reached');

    assert.ok(sent[0].text.startsWith(
      '🚫 Игра отменена: не набралось минимальное количество участников (3/6)\n\n'
    ));
  });

  test('trainings use the training wording', async () => {
    const { service, sent } = makeFakes();

    await service.notifyCancelled(cancelledGame({ type: GameType.TRAINING }), 'manual');

    assert.ok(sent[0].text.startsWith('🚫 Тренировка отменена\n\n'));
  });

  test('omits the location and mention lines when there is nothing to show', async () => {
    const { service, sent } = makeFakes();

    await service.notifyCancelled(cancelledGame({ location: undefined, participants: [] }), 'manual');

    assert.ok(!sent[0].text.includes('📍'));
    assert.ok(!sent[0].text.includes('👥'));
  });

  test('skips silently when the group has no chat and never throws when sending fails', async () => {
    const noChat = makeFakes();
    await quiet(() => noChat.service.notifyCancelled(cancelledGame({ group: { id: 1, telegram_chat_id: null } }), 'manual'));
    assert.equal(noChat.sent.length, 0);

    const failing = makeFakes({ sendFails: true });
    await quiet(() => failing.service.notifyCancelled(cancelledGame(), 'manual'));
  });
});

describe('NotificationService.notifySantaDrawn', () => {
  function makeDrawn() {
    const event = { id: 3, title: 'NY <2027>', budget: null, exchange_date: null, group: { id: 1, telegram_chat_id: '-1001' } };
    const mk = (id: number, name: string): User => ({
      id, telegram_id: 1000 + id, fullName: name, username: null,
    }) as unknown as User;
    const [a, b, c] = [mk(1, 'Alice'), mk(2, 'Bob'), mk(3, 'Carol')];
    const assignments = [
      { giver: a, receiver: b, receiverWishlist: 'socks' },
      { giver: b, receiver: c, receiverWishlist: null },
      { giver: c, receiver: a, receiverWishlist: 'tea' },
    ];
    return { event: event as never, assignments };
  }

  test('posts to the group without naming any receiver and DMs every giver', async () => {
    const { service, sent } = makeFakes();
    const { event, assignments } = makeDrawn();

    await quiet(() => service.notifySantaDrawn(event, assignments));

    const group = sent.filter((m) => m.chatId === -1001);
    assert.equal(group.length, 1);
    for (const name of ['Alice', 'Bob', 'Carol']) assert.ok(!group[0].text.includes(name));
    assert.ok(group[0].text.includes('NY &lt;2027&gt;'));

    const dms = sent.filter((m) => m.chatId !== -1001);
    assert.deepEqual(dms.map((m) => m.chatId).sort(), [1001, 1002, 1003]);
    assert.ok(dms.find((m) => m.chatId === 1001)!.text.includes('Вы дарите: Bob'));
  });

  test('keeps sending DMs after one fails and never throws', async () => {
    const sent: SentMessage[] = [];
    const telegram = {
      sendMessage: async (chatId: number, text: string, extra?: { parse_mode?: string }): Promise<void> => {
        if (chatId === 1002) throw new Error('403 Forbidden: bot cant initiate conversation');
        sent.push({ chatId, text, extra });
      },
    };
    const service = new NotificationService(telegram as never, {} as never, {} as never);
    const { event, assignments } = makeDrawn();

    await quiet(() => service.notifySantaDrawn(event, assignments));

    assert.deepEqual(sent.map((m) => m.chatId).sort((x, y) => x - y), [-1001, 1001, 1003]);
  });
});

describe('NotificationService.notifySantaParticipation', () => {
  const event = { id: 3, title: 'NY <2027>', group: { id: 1, telegram_chat_id: '-1001' } } as never;
  const people = [{ fullName: 'Alice' }, { fullName: 'Bob <b>' }] as unknown as User[];

  test('posts the joiner and the escaped participant list to the group', async () => {
    const { service, sent } = makeFakes();

    await service.notifySantaParticipation(event, people[1], 'joined', people);

    assert.equal(sent.length, 1);
    assert.equal(sent[0].chatId, -1001);
    assert.ok(sent[0].text.includes('Bob &lt;b&gt; участвует в Тайном Санте «NY &lt;2027&gt;»'));
    assert.ok(sent[0].text.includes('Участники (2): Alice, Bob &lt;b&gt;'));
  });

  test('posts a leave notice and swallows send errors', async () => {
    const { service, sent } = makeFakes();
    await service.notifySantaParticipation(event, people[0], 'left', [people[1]]);
    assert.ok(sent[0].text.includes('Alice больше не участвует'));
    assert.ok(sent[0].text.includes('Участники (1)'));

    const failing = makeFakes({ sendFails: true });
    await quiet(() => failing.service.notifySantaParticipation(event, people[0], 'joined', people));
  });
});

describe('NotificationService.notifyMafiaDealt', () => {
  const mk = (id: number, name: string): User => ({ id, telegram_id: 2000 + id, fullName: name }) as unknown as User;
  const makeEvent = (extra: Record<string, unknown> = {}) => ({
    id: 8, title: 'Night <1>', show_mafia_team: true, assign_seats: false,
    group: { id: 1, telegram_chat_id: '-1001' }, host: mk(99, 'Host'), ...extra,
  }) as never;
  const players = [
    { user: mk(1, 'Al <b>'), role: 'don', seat: 2, variant: 1 },
    { user: mk(2, 'Bo & Co'), role: 'mafia', seat: 1, variant: 1 },
    { user: mk(3, 'Cy'), role: 'civilian', seat: 3, variant: 2 },
    { user: mk(4, 'Di'), role: 'commissar', seat: 4, variant: 1 },
  ] as never;

  test('group post names no role; every player gets a spoilered role with the seat', async () => {
    const { service, sent } = makeFakes();

    await quiet(() => service.notifyMafiaDealt(makeEvent(), 3, players));

    const group = sent.filter((m) => m.chatId === -1001);
    assert.equal(group.length, 1);
    assert.ok(group[0].text.includes('партия №3'));
    for (const word of ['Мафия', 'Дон', 'Комиссар', 'Мирный']) assert.ok(!group[0].text.includes(word));

    const civilian = sent.find((m) => m.chatId === 2003)!;
    assert.ok(civilian.text.includes('Ваша роль: <tg-spoiler>Мирный житель</tg-spoiler>'));
    assert.ok(civilian.text.includes('Ваше место: №3'));
    assert.ok(!civilian.text.includes('Ваша команда'));
    assert.equal(civilian.extra?.parse_mode, 'HTML');
  });

  test('mafia players get teammates inside a spoiler, HTML-escaped; off when the setting is off', async () => {
    const { service, sent } = makeFakes();
    await quiet(() => service.notifyMafiaDealt(makeEvent(), 1, players));

    const mafia = sent.find((m) => m.chatId === 2002)!;
    assert.ok(mafia.text.includes('Ваша команда: <tg-spoiler>Al &lt;b&gt; (Дон)</tg-spoiler>'));

    const off = makeFakes();
    await quiet(() => off.service.notifyMafiaDealt(makeEvent({ show_mafia_team: false }), 1, players));
    assert.ok(!off.sent.find((m) => m.chatId === 2002)!.text.includes('Ваша команда'));
  });

  test('the host gets the full layout, unspoilered and escaped, sorted by seat when seats are on', async () => {
    const { service, sent } = makeFakes();
    await quiet(() => service.notifyMafiaDealt(makeEvent({ assign_seats: true }), 2, players));

    const host = sent.find((m) => m.chatId === 2099)!;
    assert.ok(!host.text.includes('tg-spoiler'));
    assert.ok(host.text.includes('Night &lt;1&gt;'));
    const lines = host.text.split('\n').filter((l) => /^\d\. /.test(l));
    assert.deepEqual(lines, ['1. Bo &amp; Co — Мафия', '2. Al &lt;b&gt; — Дон', '3. Cy — Мирный житель', '4. Di — Комиссар']);
  });

  test('without seats the layout follows the role order', async () => {
    const { service, sent } = makeFakes();
    const noSeats = (players as unknown as Array<Record<string, unknown>>).map((p) => ({ ...p, seat: null }));
    await quiet(() => service.notifyMafiaDealt(makeEvent(), 1, noSeats as never));

    const host = sent.find((m) => m.chatId === 2099)!;
    const lines = host.text.split('\n').filter((l) => l.startsWith('• '));
    assert.deepEqual(lines.map((l) => l.split(' — ')[1]), ['Мирный житель', 'Мафия', 'Дон', 'Комиссар']);
  });

  test('keeps going after a failed DM and never throws', async () => {
    const sent: SentMessage[] = [];
    const telegram = {
      sendMessage: async (chatId: number, text: string, extra?: { parse_mode?: string }): Promise<void> => {
        if (chatId === 2002) throw new Error('403 Forbidden');
        sent.push({ chatId, text, extra });
      },
    };
    const service = new NotificationService(telegram as never, {} as never, {} as never);

    await quiet(() => service.notifyMafiaDealt(makeEvent(), 1, players));

    assert.deepEqual(sent.map((m) => m.chatId).sort((x, y) => x - y), [-1001, 2001, 2003, 2004, 2099]);
  });
});

describe('NotificationService mafia live card', () => {
  const event = {
    id: 8, title: 'Night', status: 'registration', max_players: 10, round: 0,
    card_chat_id: '-1001', card_message_id: 55, group: { id: 1, telegram_chat_id: '-1001' },
  } as never;
  const people = [{ fullName: 'Al' }] as unknown as User[];

  test('postMafiaCard sends the card and reports where it landed', async () => {
    const telegram = { sendMessage: async (): Promise<{ message_id: number }> => ({ message_id: 77 }) };
    const service = new NotificationService(telegram as never, {} as never, {} as never);
    assert.deepEqual(await service.postMafiaCard(event, people), { chatId: -1001, messageId: 77 });
  });

  test('updateMafiaCard edits the stored message and swallows "not modified" / "not found"', async () => {
    const edits: Array<[number, number]> = [];
    const errors = ['Bad Request: message is not modified', 'Bad Request: message to edit not found'];
    const telegram = {
      editMessageText: async (chatId: number, messageId: number): Promise<void> => {
        edits.push([chatId, messageId]);
        const next = errors.shift();
        if (next) throw new Error(next);
      },
    };
    const service = new NotificationService(telegram as never, {} as never, {} as never);

    await service.updateMafiaCard(event, people);
    await service.updateMafiaCard(event, people);
    await service.updateMafiaCard(event, people);

    assert.deepEqual(edits, [[-1001, 55], [-1001, 55], [-1001, 55]]);
  });

  test('updateMafiaCard does nothing without a stored card', async () => {
    let calls = 0;
    const telegram = { editMessageText: async (): Promise<void> => { calls++; } };
    const service = new NotificationService(telegram as never, {} as never, {} as never);
    await service.updateMafiaCard({ ...(event as object), card_message_id: null } as never, people);
    assert.equal(calls, 0);
  });

  test('removeMafiaCard deletes the card message', async () => {
    const deleted: Array<[number, number]> = [];
    let edits = 0;
    const telegram = {
      deleteMessage: async (chatId: number, messageId: number): Promise<void> => { deleted.push([chatId, messageId]); },
      editMessageText: async (): Promise<void> => { edits++; },
    };
    const service = new NotificationService(telegram as never, {} as never, {} as never);
    await service.removeMafiaCard(event);
    assert.deepEqual(deleted, [[-1001, 55]]);
    assert.equal(edits, 0);
  });

  test('removeMafiaCard falls back to a stub without buttons when deleting is refused', async () => {
    const edits: Array<{ text: string; markup: unknown }> = [];
    const telegram = {
      deleteMessage: async (): Promise<void> => { throw new Error("Bad Request: message can't be deleted"); },
      editMessageText: async (_c: number, _m: number, _i: undefined, text: string, extra: { reply_markup: unknown }): Promise<void> => {
        edits.push({ text, markup: extra.reply_markup });
      },
    };
    const service = new NotificationService(telegram as never, {} as never, {} as never);
    await service.removeMafiaCard(event);
    assert.equal(edits.length, 1);
    assert.ok(edits[0].text.includes('отменён'));
    assert.deepEqual(edits[0].markup, { inline_keyboard: [] });
  });
});
