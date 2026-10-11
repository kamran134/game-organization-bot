import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { GameType } from '../../models/GameType';
import { isWizardInput } from '../../bot/utils/wizardInput';
import { StateManager } from '../../utils/StateManager';
import { CreationStateManager } from '../../utils/CreationState';
import { CreationFlow } from '../../bot/flows/CreationFlow';
import { CreationHandler } from '../../bot/handlers/CreationHandler';
import { NewGameCommand } from '../../bot/commands/NewGameCommand';
import { NewTrainingCommand } from '../../bot/commands/NewTrainingCommand';

// ═══════════════════════════════════════════════════════════════════════════
// Harness: the ONLY part that knows how the wizards are wired together.
// It mirrors Bot.ts: command -> callback handlers (registration order) -> text routing.
// ═══════════════════════════════════════════════════════════════════════════

const BOT_ID = 777;
const GROUP_ID = 5; // DB id of the group the wizard is started for
const DB_USER_ID = 42; // DB id of the wizard owner
const OWNER_TG_ID = 1001;
const FUTURE = '15.02.2099 19:00';

interface Sent { text: string; extra?: any }

interface FakeCtx {
  from: { id: number };
  chat: { id: number; type: string };
  botInfo: { id: number };
  message: any;
  match?: RegExpExecArray;
  replies: Sent[];
  edits: Sent[];
  answers: Array<string | undefined>;
  reply(text: string, extra?: any): Promise<void>;
  editMessageText(text: string, extra?: any): Promise<void>;
  answerCbQuery(text?: string): Promise<void>;
}

function makeCtx(tgId: number, chatType: string, text?: string, replyToBot?: boolean): FakeCtx {
  const ctx: FakeCtx = {
    from: { id: tgId },
    chat: { id: -100, type: chatType },
    botInfo: { id: BOT_ID },
    message: text === undefined ? undefined : {
      text,
      ...(replyToBot ? { reply_to_message: { from: { id: BOT_ID } } } : {}),
    },
    replies: [],
    edits: [],
    answers: [],
    async reply(t, extra) { ctx.replies.push({ text: t, extra }); },
    async editMessageText(t, extra) { ctx.edits.push({ text: t, extra }); },
    async answerCbQuery(t) { ctx.answers.push(t); },
  };
  return ctx;
}

/** Minimal Telegraf stand-in: first matching action runs, next() moves on to the next match. */
class FakeBot {
  private routes: Array<{ pattern: string | RegExp; handler: (ctx: any, next: () => Promise<void>) => Promise<void> }> = [];

  action(pattern: string | RegExp, handler: (ctx: any, next: () => Promise<void>) => Promise<void>): void {
    this.routes.push({ pattern, handler });
  }

  async dispatch(ctx: FakeCtx, data: string): Promise<void> {
    const matching = this.routes.filter((r) => (typeof r.pattern === 'string' ? r.pattern === data : r.pattern.test(data)));
    let i = 0;
    const next = async (): Promise<void> => {
      const route = matching[i++];
      if (!route) return;
      ctx.match = typeof route.pattern === 'string' ? undefined : (route.pattern.exec(data) as RegExpExecArray);
      await route.handler(ctx, next);
    };
    await next();
  }
}

interface Stubs {
  sports: Array<{ id: number; name: string; emoji: string }>;
  locations: Array<{ id: number; name: string }>;
  createCalls: any[];
  createDelayMs: number;
  failCreate: boolean;
  findOrCreateCalls: any[][];
  mentions: number[];
  isAdminCalls: Array<[number, number]>;
  isAdmin: boolean;
}

interface Harness {
  stubs: Stubs;
  startGame(tgId?: number, chatType?: string): Promise<FakeCtx>;
  startTraining(tgId?: number, chatType?: string): Promise<FakeCtx>;
  press(data: string, tgId?: number, chatType?: string): Promise<FakeCtx>;
  say(text: string, tgId?: number, chatType?: string): Promise<FakeCtx>;
  hasWizard(tgId?: number): boolean;
}

function makeHarness(): Harness {
  const stubs: Stubs = {
    sports: [{ id: 1, name: 'Футбол', emoji: '⚽' }, { id: 2, name: 'Волейбол', emoji: '🏐' }],
    locations: [{ id: 7, name: 'Зал' }, { id: 8, name: 'Стадион' }],
    createCalls: [],
    createDelayMs: 0,
    failCreate: false,
    findOrCreateCalls: [],
    mentions: [],
    isAdminCalls: [],
    isAdmin: false,
  };

  const userService = { getUserByTelegramId: async () => ({ id: DB_USER_ID }) };
  const groupService = {
    getGroupByChatId: async () => ({ id: GROUP_ID }),
    isUserAdmin: async (userId: number, groupId: number) => { stubs.isAdminCalls.push([userId, groupId]); return stubs.isAdmin; },
  };
  const sportService = {
    getSportsForGroup: async () => stubs.sports,
    getSportById: async (id: number) => stubs.sports.find((s) => s.id === id) ?? null,
  };
  const locationService = {
    getByGroupAndSport: async () => stubs.locations,
    getById: async (id: number) => stubs.locations.find((l) => l.id === id) ?? null,
    findOrCreate: async (...args: any[]) => {
      stubs.findOrCreateCalls.push(args);
      return { id: 900 + stubs.findOrCreateCalls.length, name: args[0] };
    },
  };
  const gameService = {
    createGame: async (payload: any) => {
      if (stubs.createDelayMs) await new Promise((r) => setTimeout(r, stubs.createDelayMs));
      if (stubs.failCreate) throw new Error('db down');
      stubs.createCalls.push(payload);
      return {
        id: 100 + stubs.createCalls.length,
        ...payload,
        sport: stubs.sports.find((s) => s.id === payload.sport_id),
        location: { name: 'Зал' },
        participants: [],
      };
    },
    // The flow reloads the created game with relations; the stub returns null so the
    // flow falls back to the row createGame returned
    getGameById: async () => null,
  };
  const notificationService = { mentionMembers: async (groupId: number) => { stubs.mentions.push(groupId); } };

  const bot = new FakeBot();
  const states = new CreationStateManager();

  const creationFlow = new CreationFlow({
    gameService, groupService, userService, sportService, locationService, notificationService, creationStates: states,
  } as any);

  const commandServices: any = { userService, groupService, gameService, sportService, creationFlow };
  const newGame = new NewGameCommand(commandServices);
  const newTraining = new NewTrainingCommand(commandServices);

  new CreationHandler({ creationStates: states, creationFlow }).register(bot as any);

  return {
    stubs,
    async startGame(tgId = OWNER_TG_ID, chatType = 'group') {
      const ctx = makeCtx(tgId, chatType);
      await newGame.execute(ctx as any);
      return ctx;
    },
    async startTraining(tgId = OWNER_TG_ID, chatType = 'group') {
      const ctx = makeCtx(tgId, chatType);
      await newTraining.execute(ctx as any);
      return ctx;
    },
    async press(data, tgId = OWNER_TG_ID, chatType = 'group') {
      const ctx = makeCtx(tgId, chatType);
      await bot.dispatch(ctx, data);
      return ctx;
    },
    async say(text, tgId = OWNER_TG_ID, chatType = 'private') {
      // Same routing as Bot.setupTextHandlers
      const ctx = makeCtx(tgId, chatType, text, chatType !== 'private');
      if (!isWizardInput(ctx as any)) return ctx;
      if (states.has(tgId)) await creationFlow.handleTextInput(ctx as any, tgId, text);
      return ctx;
    },
    hasWizard(tgId = OWNER_TG_ID) {
      return states.has(tgId);
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers shared by the tests
// ═══════════════════════════════════════════════════════════════════════════

function buttons(sent: Sent | undefined): string[] {
  const rows: any[][] = sent?.extra?.reply_markup?.inline_keyboard ?? [];
  return rows.flat().map((b) => b.callback_data);
}

let h: Harness;

beforeEach(() => {
  h = makeHarness();
});

/** Walks a game wizard to the cost step with max=10, min=4. */
async function gameToCostStep(): Promise<void> {
  await h.startGame();
  await h.press('sport_1');
  await h.say(FUTURE);
  await h.say('10');
  await h.say('4');
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME wizard
// ═══════════════════════════════════════════════════════════════════════════

describe('game wizard: start and sport', () => {
  test('/newgame prompts for a sport with one button per sport', async () => {
    const ctx = await h.startGame();
    assert.equal(ctx.replies.length, 1);
    assert.equal(ctx.replies[0].text, '🎮 Создание новой игры\n\nВыберите вид спорта:');
    assert.deepEqual(buttons(ctx.replies[0]), ['sport_1', 'sport_2']);
    assert.equal(h.hasWizard(), true);
  });

  test('choosing a sport shows both input modes and answers the callback exactly once', async () => {
    await h.startGame();
    const ctx = await h.press('sport_1');
    assert.equal(ctx.edits.length, 1);
    assert.ok(ctx.edits[0].text.startsWith('✅ Выбран: ⚽ Футбол\n\n'));
    assert.ok(ctx.edits[0].text.includes('🚀 БЫСТРЫЙ СПОСОБ'));
    assert.ok(ctx.edits[0].text.includes('Введите дату и время игры'));
    assert.deepEqual(ctx.answers, [undefined]);
  });

  test('unknown sport is rejected with a toast and the wizard stays on the sport step', async () => {
    await h.startGame();
    const ctx = await h.press('sport_99');
    assert.deepEqual(ctx.answers, ['❌ Вид спорта не найден']);
    assert.equal(ctx.edits.length, 0);
    // still waiting for a sport: a valid one works afterwards
    const ok = await h.press('sport_1');
    assert.equal(ok.edits.length, 1);
  });

  test('sport callback without a wizard is ignored', async () => {
    const ctx = await h.press('sport_1');
    assert.equal(ctx.edits.length, 0);
    assert.equal(ctx.answers.length, 0);
  });

  test('starting a wizard drops the previous one of the same user', async () => {
    await h.startGame();
    await h.press('sport_1');
    await h.startTraining();
    // the old game wizard must not eat text any more: the date goes nowhere
    const ctx = await h.say(FUTURE);
    assert.equal(ctx.replies.length, 0);
    // and the new training wizard is the live one
    await h.press('sport_1');
    const next = await h.say(FUTURE);
    assert.ok(buttons(next.replies[0]).includes('location_7'));
  });
});

describe('game wizard: step-by-step happy path', () => {
  test('date -> max -> min -> cost -> notes -> location button -> confirm creates the game', async () => {
    await h.startGame();
    await h.press('sport_1');

    let ctx = await h.say(FUTURE);
    assert.equal(ctx.replies.length, 1);
    assert.ok(ctx.replies[0].text.startsWith('✅ Дата: '));
    assert.ok(ctx.replies[0].text.includes('👥 Введите максимальное количество участников:'));
    assert.ok(ctx.replies[0].text.endsWith('Например: 10'));

    ctx = await h.say('10');
    assert.ok(ctx.replies[0].text.startsWith('✅ Максимум участников: 10\n\n'));
    assert.ok(ctx.replies[0].text.includes('👤 Введите минимальное количество участников:'));
    assert.ok(ctx.replies[0].text.endsWith('(от 2 до 10)'));

    ctx = await h.say('4');
    assert.ok(ctx.replies[0].text.startsWith('✅ Минимум участников: 4\n\n'));
    assert.ok(ctx.replies[0].text.includes('💰 Введите стоимость участия (₼):'));
    assert.ok(ctx.replies[0].text.endsWith('Или отправьте 0, если игра бесплатная'));

    ctx = await h.say('500');
    assert.ok(ctx.replies[0].text.startsWith('✅ Стоимость: 500 ₼\n\n'));
    assert.ok(ctx.replies[0].text.includes('📝 Добавьте дополнительные заметки или отправьте "-" чтобы пропустить:'));

    ctx = await h.say('Своя форма');
    assert.equal(ctx.replies[0].text, '📍 Выберите место проведения:');
    assert.deepEqual(buttons(ctx.replies[0]), ['location_7', 'location_8', 'location_custom']);

    ctx = await h.press('location_7');
    assert.equal(ctx.edits.length, 1);
    assert.ok(ctx.edits[0].text.startsWith('🎮 Подтверждение создания игры\n\n'));
    assert.ok(ctx.edits[0].text.includes('Вид спорта: ⚽ Футбол'));
    assert.ok(ctx.edits[0].text.includes('📍 Место: Зал'));
    assert.ok(ctx.edits[0].text.includes('👥 Максимум участников: 10'));
    assert.ok(ctx.edits[0].text.includes('Минимум участников: 4'));
    assert.ok(ctx.edits[0].text.includes('💰 Стоимость: 500 ₼'));
    assert.ok(ctx.edits[0].text.endsWith('📝 Заметки: Своя форма'));
    assert.deepEqual(buttons(ctx.edits[0]), [`confirm_game_${OWNER_TG_ID}`, `cancel_game_${OWNER_TG_ID}`]);
    assert.deepEqual(ctx.answers, [undefined]);

    ctx = await h.press(`confirm_game_${OWNER_TG_ID}`);
    assert.equal(h.stubs.createCalls.length, 1);
    const payload = h.stubs.createCalls[0];
    assert.equal(payload.group_id, GROUP_ID);
    assert.equal(payload.creator_id, DB_USER_ID);
    assert.equal(payload.sport_id, 1);
    assert.ok(payload.game_date instanceof Date);
    assert.equal(payload.game_date.getFullYear(), 2099);
    assert.equal(payload.location_id, 7);
    assert.equal(payload.max_participants, 10);
    assert.equal(payload.min_participants, 4);
    assert.equal(payload.cost, 500);
    assert.equal(payload.notes, 'Своя форма');
    assert.equal(payload.type ?? GameType.GAME, GameType.GAME);

    assert.deepEqual(ctx.answers, ['✅ Игра создана!']);
    assert.equal(ctx.edits.length, 1);
    assert.ok(ctx.edits[0].text.startsWith('✅ Игра создана!\n\n'));
    assert.ok(ctx.edits[0].text.endsWith('\n\nУчастники могут записаться прямо здесь:'));
    assert.equal(ctx.edits[0].extra.parse_mode, 'Markdown');
    assert.ok(buttons(ctx.edits[0]).includes('join_confirmed_101'));
    assert.deepEqual(h.stubs.mentions, [GROUP_ID]);
    assert.equal(h.hasWizard(), false);
  });

  test('free game and "-" notes: cost stays unset and so do notes', async () => {
    await gameToCostStep();
    const ctx = await h.say('0');
    assert.ok(ctx.replies[0].text.startsWith('✅ Игра бесплатная\n\n'));
    await h.say('-');
    await h.press('location_8');
    await h.press(`confirm_game_${OWNER_TG_ID}`);
    const payload = h.stubs.createCalls[0];
    assert.equal(payload.cost, undefined);
    assert.equal(payload.notes, undefined);
    assert.equal(payload.location_id, 8);
  });

  test('fractional cost keeps the fraction', async () => {
    await gameToCostStep();
    await h.say('12.5');
    await h.say('-');
    await h.press('location_7');
    await h.press(`confirm_game_${OWNER_TG_ID}`);
    assert.equal(h.stubs.createCalls[0].cost, 12.5);
  });

  test('without known locations the user is asked to type the place, and it is created for the group', async () => {
    h.stubs.locations = [];
    await gameToCostStep();
    await h.say('0');
    let ctx = await h.say('-');
    assert.equal(ctx.replies.length, 1);
    assert.ok(ctx.replies[0].text.startsWith('⚠️ Локаций для этого вида спорта в группе пока нет.\n📍 Введите место проведения текстом:'));
    assert.ok(ctx.replies[0].text.includes('/addlocation'));
    assert.equal(ctx.replies[0].extra, undefined);

    ctx = await h.say('Стадион Олимп');
    assert.ok(ctx.replies[0].text.startsWith('🎮 Подтверждение создания игры'));
    assert.ok(ctx.replies[0].text.includes('📍 Место: Стадион Олимп'));
    assert.deepEqual(buttons(ctx.replies[0]), [`confirm_game_${OWNER_TG_ID}`, `cancel_game_${OWNER_TG_ID}`]);

    await h.press(`confirm_game_${OWNER_TG_ID}`);
    assert.equal(h.stubs.findOrCreateCalls.length, 1);
    assert.deepEqual(h.stubs.findOrCreateCalls[0].slice(0, 3), ['Стадион Олимп', 1, GROUP_ID]);
    assert.equal(h.stubs.findOrCreateCalls[0][3], undefined);
    assert.equal(h.stubs.createCalls[0].location_id, 901);
  });

  test('"another place" asks for a typed location only while on the location step', async () => {
    await gameToCostStep();
    await h.say('0');
    // still on notes: location_custom is ignored
    let ctx = await h.press('location_custom');
    assert.equal(ctx.edits.length, 0);
    assert.equal(ctx.answers.length, 0);

    await h.say('-');
    ctx = await h.press('location_custom');
    assert.equal(ctx.edits.length, 1);
    assert.ok(ctx.edits[0].text.startsWith('📍 Введите название места:'));
    assert.deepEqual(ctx.answers, [undefined]);
  });

  test('unknown location id is rejected with a toast', async () => {
    await gameToCostStep();
    await h.say('0');
    await h.say('-');
    const ctx = await h.press('location_55');
    assert.deepEqual(ctx.answers, ['❌ Локация не найдена']);
    assert.equal(ctx.edits.length, 0);
  });

  test('location button before the location step is ignored', async () => {
    await h.startGame();
    await h.press('sport_1');
    const ctx = await h.press('location_7');
    assert.equal(ctx.edits.length, 0);
    assert.equal(ctx.answers.length, 0);
  });
});

describe('game wizard: quick format', () => {
  test('full line with location and map url goes straight to confirmation', async () => {
    await h.startGame();
    await h.press('sport_1');
    const ctx = await h.say(`${FUTURE} / 5-10 / 500 / Приходите заранее / Спортзал Олимп / https://maps.example/x`);
    assert.equal(ctx.replies.length, 1);
    assert.ok(ctx.replies[0].text.startsWith('🎮 Подтверждение создания игры'));
    assert.ok(ctx.replies[0].text.includes('📍 Место: Спортзал Олимп'));
    assert.ok(ctx.replies[0].text.includes('👥 Максимум участников: 10'));
    assert.ok(ctx.replies[0].text.includes('Минимум участников: 5'));

    await h.press(`confirm_game_${OWNER_TG_ID}`);
    assert.deepEqual(h.stubs.findOrCreateCalls[0], ['Спортзал Олимп', 1, GROUP_ID, 'https://maps.example/x']);
    const p = h.stubs.createCalls[0];
    assert.equal(p.max_participants, 10);
    assert.equal(p.min_participants, 5);
    assert.equal(p.cost, 500);
    assert.equal(p.notes, 'Приходите заранее');
  });

  test('a single number means max, min defaults to half', async () => {
    await h.startGame();
    await h.press('sport_1');
    const ctx = await h.say(`${FUTURE} / 10 / 0 / - / Зал`);
    assert.ok(ctx.replies[0].text.startsWith('🎮 Подтверждение создания игры'));
    await h.press(`confirm_game_${OWNER_TG_ID}`);
    const p = h.stubs.createCalls[0];
    assert.equal(p.max_participants, 10);
    assert.equal(p.min_participants, 5);
    assert.equal(p.cost, undefined);
    assert.equal(p.notes, undefined);
  });

  test('min/max line without location offers known locations, then the button confirms', async () => {
    await h.startGame();
    await h.press('sport_1');
    let ctx = await h.say(`${FUTURE} / 6-12`);
    assert.equal(ctx.replies[0].text, '📍 Выберите место проведения:');
    assert.deepEqual(buttons(ctx.replies[0]), ['location_7', 'location_8', 'location_custom']);

    ctx = await h.press('location_8');
    assert.ok(ctx.edits[0].text.startsWith('🎮 Подтверждение создания игры'));
    await h.press(`confirm_game_${OWNER_TG_ID}`);
    const p = h.stubs.createCalls[0];
    assert.equal(p.location_id, 8);
    assert.equal(p.min_participants, 6);
    assert.equal(p.max_participants, 12);
  });

  test('line without location and without known locations asks to type it', async () => {
    h.stubs.locations = [];
    await h.startGame();
    await h.press('sport_1');
    let ctx = await h.say(`${FUTURE} / 6-12 / 100`);
    assert.ok(ctx.replies[0].text.startsWith('⚠️ Локаций для этого вида спорта в группе пока нет.'));
    ctx = await h.say('Школа №5');
    assert.ok(ctx.replies[0].text.startsWith('🎮 Подтверждение создания игры'));
    assert.ok(ctx.replies[0].text.includes('📍 Место: Школа №5'));
  });

  const quickErrors: Array<[string, string, string]> = [
    ['bad date', 'вчера / 10', '❌ Неверный формат даты.'],
    ['past date', '01.01.2000 10:00 / 10', '❌ Дата игры не может быть в прошлом. Попробуйте снова:'],
    ['garbage participants', `${FUTURE} / abc`, '❌ Неверное количество участников. Укажите число от 2 до 100 или формат 5-10'],
    ['participants over 100', `${FUTURE} / 101`, '❌ Неверное количество участников. Укажите число от 2 до 100 или формат 5-10'],
    ['min above max', `${FUTURE} / 8-5`, '❌ Минимум должен быть от 2 до 5'],
    ['min below 2', `${FUTURE} / 1-5`, '❌ Минимум должен быть от 2 до 5'],
    ['non-numeric range', `${FUTURE} / a-b`, '❌ Неверный формат участников. Используйте: 5-10 или просто 10'],
    ['bad cost', `${FUTURE} / 10 / abc`, '❌ Неверный формат стоимости (третья часть). Укажите число или "-".'],
    ['short location', `${FUTURE} / 10 / 0 / - / ab`, '❌ Слишком короткое название места (пятая часть).'],
  ];
  for (const [name, input, expected] of quickErrors) {
    test(`invalid quick input (${name}) replies with the error and keeps the wizard on the date step`, async () => {
      await h.startGame();
      await h.press('sport_1');
      const ctx = await h.say(input);
      assert.equal(ctx.replies.length, 1);
      assert.ok(ctx.replies[0].text.startsWith(expected), ctx.replies[0].text);
      // wizard is still on the date step: a valid date moves on
      const next = await h.say(FUTURE);
      assert.ok(next.replies[0].text.startsWith('✅ Дата: '));
    });
  }
});

describe('game wizard: invalid step-by-step input', () => {
  test('date errors keep the step', async () => {
    await h.startGame();
    await h.press('sport_1');
    let ctx = await h.say('когда-нибудь');
    assert.ok(ctx.replies[0].text.startsWith('❌ Неверный формат даты.'));
    ctx = await h.say('01.01.2000 10:00');
    assert.equal(ctx.replies[0].text, '❌ Дата игры не может быть в прошлом. Попробуйте снова:');
    ctx = await h.say(FUTURE);
    assert.ok(ctx.replies[0].text.startsWith('✅ Дата: '));
  });

  for (const bad of ['abc', '1', '101', '-3']) {
    test(`max participants "${bad}" is rejected`, async () => {
      await h.startGame();
      await h.press('sport_1');
      await h.say(FUTURE);
      const ctx = await h.say(bad);
      assert.deepEqual(ctx.replies.map((r) => r.text), ['❌ Укажите число от 2 до 100:']);
    });
  }

  for (const bad of ['abc', '1', '11']) {
    test(`min participants "${bad}" is rejected for max=10`, async () => {
      await h.startGame();
      await h.press('sport_1');
      await h.say(FUTURE);
      await h.say('10');
      const ctx = await h.say(bad);
      assert.deepEqual(ctx.replies.map((r) => r.text), ['❌ Укажите число от 2 до 10:']);
    });
  }

  for (const bad of ['abc', '-5', '-']) {
    test(`cost "${bad}" is rejected`, async () => {
      await gameToCostStep();
      const ctx = await h.say(bad);
      assert.deepEqual(ctx.replies.map((r) => r.text), ['❌ Укажите число (0 или больше):']);
    });
  }

  test('too short typed location is rejected', async () => {
    h.stubs.locations = [];
    await gameToCostStep();
    await h.say('0');
    await h.say('-');
    const ctx = await h.say('ab');
    assert.deepEqual(ctx.replies.map((r) => r.text), ['❌ Слишком короткое название. Введите адрес или название места:']);
    assert.equal(h.stubs.findOrCreateCalls.length, 0);
  });

  // FIX 3: the game wizard used to accept notes of any length
  test('overlong notes are rejected and the wizard stays on the notes step', async () => {
    await gameToCostStep();
    await h.say('0');
    let ctx = await h.say('x'.repeat(1500));
    assert.deepEqual(ctx.replies.map((r) => r.text), ['❌ Заметки слишком длинные. Максимум 1000 символов.']);
    ctx = await h.say('короткая');
    assert.equal(ctx.replies[0].text, '📍 Выберите место проведения:');
  });

  test('overlong notes in the quick format are rejected too', async () => {
    await h.startGame();
    await h.press('sport_1');
    const ctx = await h.say(`${FUTURE} / 10 / 0 / ${'x'.repeat(1500)} / Зал`);
    assert.deepEqual(ctx.replies.map((r) => r.text), ['❌ Заметки слишком длинные. Максимум 1000 символов.']);
  });
});

describe('game wizard: confirm and cancel', () => {
  async function toConfirm(): Promise<void> {
    await h.startGame();
    await h.press('sport_1');
    await h.say(`${FUTURE} / 5-10 / 500 / - / Зал`);
  }

  test('cancel drops the wizard', async () => {
    await toConfirm();
    const ctx = await h.press(`cancel_game_${OWNER_TG_ID}`);
    assert.deepEqual(ctx.answers, ['Отменено']);
    assert.deepEqual(ctx.edits.map((e) => e.text), ['❌ Создание игры отменено.']);
    assert.equal(h.hasWizard(), false);
    assert.equal(h.stubs.createCalls.length, 0);
  });

  test('another user cannot confirm or cancel', async () => {
    await toConfirm();
    let ctx = await h.press(`confirm_game_${OWNER_TG_ID}`, 2002);
    assert.deepEqual(ctx.answers, ['❌ Это не ваша игра']);
    assert.equal(h.stubs.createCalls.length, 0);
    ctx = await h.press(`cancel_game_${OWNER_TG_ID}`, 2002);
    assert.deepEqual(ctx.answers, ['❌ Это не ваша игра']);
    assert.equal(h.hasWizard(), true);
  });

  test('confirm without a live wizard answers "session expired"', async () => {
    const ctx = await h.press(`confirm_game_${OWNER_TG_ID}`);
    assert.deepEqual(ctx.answers, ['❌ Сессия создания истекла']);
    assert.equal(ctx.edits.length, 0);
    assert.equal(h.stubs.createCalls.length, 0);
  });

  test('cancel without a live wizard answers "session expired"', async () => {
    const ctx = await h.press(`cancel_game_${OWNER_TG_ID}`);
    assert.deepEqual(ctx.answers, ['❌ Сессия создания истекла']);
    assert.equal(ctx.edits.length, 0);
  });

  test('double tap on confirm creates exactly one game', async () => {
    await toConfirm();
    h.stubs.createDelayMs = 20;
    const [a, b] = await Promise.all([
      h.press(`confirm_game_${OWNER_TG_ID}`),
      h.press(`confirm_game_${OWNER_TG_ID}`),
    ]);
    assert.equal(h.stubs.createCalls.length, 1);
    assert.deepEqual(h.stubs.mentions, [GROUP_ID]);
    const answers = [...a.answers, ...b.answers].sort();
    assert.deepEqual(answers, ['✅ Игра создана!', '❌ Сессия создания истекла']);
    assert.equal(a.answers.length, 1);
    assert.equal(b.answers.length, 1);
  });

  test('a failed createGame restores the wizard so the user can retry', async () => {
    await toConfirm();
    h.stubs.failCreate = true;
    const origError = console.error;
    console.error = () => undefined;
    let ctx: FakeCtx;
    try {
      ctx = await h.press(`confirm_game_${OWNER_TG_ID}`);
    } finally {
      console.error = origError;
    }
    assert.deepEqual(ctx.answers, ['❌ Ошибка создания игры']);
    assert.deepEqual(ctx.replies.map((r) => r.text), ['❌ Не удалось создать игру. Попробуйте ещё раз.']);
    assert.equal(ctx.edits.length, 0);
    assert.deepEqual(h.stubs.mentions, []);
    assert.equal(h.hasWizard(), true);

    h.stubs.failCreate = false;
    ctx = await h.press(`confirm_game_${OWNER_TG_ID}`);
    assert.deepEqual(ctx.answers, ['✅ Игра создана!']);
    assert.equal(h.stubs.createCalls.length, 1);
  });
});

describe('game wizard: created message keyboard', () => {
  async function createIn(chatType: string): Promise<FakeCtx> {
    await h.startGame();
    await h.press('sport_1');
    await h.say(`${FUTURE} / 5-10 / 500 / - / Зал`);
    return h.press(`confirm_game_${OWNER_TG_ID}`, OWNER_TG_ID, chatType);
  }

  test('in a group: DM button, no admin buttons, no admin lookup', async () => {
    const ctx = await createIn('group');
    const data = buttons(ctx.edits[0]);
    assert.ok(data.includes('send_to_dm_101'));
    assert.ok(!data.includes('set_lock_101'));
    assert.ok(!data.includes('delete_game_101'));
    assert.deepEqual(h.stubs.isAdminCalls, []);
  });

  test('in a private chat an admin gets lock and delete buttons', async () => {
    h.stubs.isAdmin = true;
    const ctx = await createIn('private');
    const data = buttons(ctx.edits[0]);
    assert.ok(!data.includes('send_to_dm_101'));
    assert.ok(data.includes('set_lock_101'));
    assert.ok(data.includes('delete_game_101'));
    assert.deepEqual(h.stubs.isAdminCalls, [[DB_USER_ID, GROUP_ID]]);
  });

  test('in a private chat a non-admin gets no admin buttons', async () => {
    h.stubs.isAdmin = false;
    const ctx = await createIn('private');
    const data = buttons(ctx.edits[0]);
    assert.ok(!data.includes('set_lock_101'));
    assert.ok(!data.includes('delete_game_101'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TRAINING wizard
// ═══════════════════════════════════════════════════════════════════════════

/** Walks a training wizard to the min-participants step via the location button. */
async function trainingToMinStep(): Promise<void> {
  await h.startTraining();
  await h.press('sport_1');
  await h.say(FUTURE);
  await h.press('location_7');
}

describe('training wizard: start and sport', () => {
  test('/newtraining prompts for a sport', async () => {
    const ctx = await h.startTraining();
    assert.equal(ctx.replies.length, 1);
    assert.equal(ctx.replies[0].text, '🏋️ Создание тренировки\n\nВыберите вид спорта:');
    assert.deepEqual(buttons(ctx.replies[0]), ['sport_1', 'sport_2']);
    assert.equal(h.hasWizard(), true);
  });

  test('no sports in the system stops the command', async () => {
    h.stubs.sports = [];
    const ctx = await h.startTraining();
    assert.deepEqual(ctx.replies.map((r) => r.text), ['❌ В системе нет доступных видов спорта.']);
    assert.equal(h.hasWizard(), false);
  });

  test('choosing a sport shows both input modes and answers once', async () => {
    await h.startTraining();
    const ctx = await h.press('sport_2');
    assert.equal(ctx.edits.length, 1);
    assert.ok(ctx.edits[0].text.startsWith('✅ Вид спорта: 🏐 Волейбол\n\n'));
    assert.ok(ctx.edits[0].text.includes('🚀 БЫСТРЫЙ СПОСОБ'));
    assert.ok(ctx.edits[0].text.includes('Введите дату и время тренировки'));
    assert.deepEqual(ctx.answers, [undefined]);
  });

  test('unknown sport is rejected with a toast', async () => {
    await h.startTraining();
    const ctx = await h.press('sport_99');
    assert.deepEqual(ctx.answers, ['❌ Вид спорта не найден']);
    assert.equal(ctx.edits.length, 0);
  });

  test('sport callback after the sport step is ignored', async () => {
    await h.startTraining();
    await h.press('sport_1');
    const ctx = await h.press('sport_2');
    assert.equal(ctx.edits.length, 0);
    assert.equal(ctx.answers.length, 0);
  });
});

describe('training wizard: step-by-step happy path', () => {
  test('date -> location button -> min -> max -> cost -> notes -> confirm', async () => {
    await h.startTraining();
    await h.press('sport_1');

    let ctx = await h.say(FUTURE);
    assert.equal(ctx.replies[0].text, '📍 Выберите место проведения:');
    assert.deepEqual(buttons(ctx.replies[0]), ['location_7', 'location_8', 'location_custom']);

    ctx = await h.press('location_7');
    assert.equal(ctx.edits.length, 1);
    assert.ok(ctx.edits[0].text.startsWith('✅ Место: Зал\n\n👥 Введите минимальное количество участников:'));
    // The button path used to omit the trailing "(если наберётся меньше ...)" hint that the typed path had
    assert.ok(ctx.edits[0].text.endsWith('Например: 5\n(если наберётся меньше, тренировка может быть отменена)'));
    assert.deepEqual(ctx.answers, [undefined]);

    ctx = await h.say('5');
    assert.ok(ctx.replies[0].text.startsWith('👥 Введите максимальное количество участников или "-" для безлимита:'));

    ctx = await h.say('-');
    assert.ok(ctx.replies[0].text.startsWith('💰 Введите стоимость участия или "-" для бесплатной тренировки:'));

    ctx = await h.say('300');
    assert.ok(ctx.replies[0].text.startsWith('📝 Добавьте заметки к тренировке или "-" для пропуска:'));

    ctx = await h.say('Принести воду');
    assert.equal(ctx.replies.length, 1);
    const confirmation = ctx.replies[0].text;
    assert.ok(confirmation.startsWith('🏋️ ТРЕНИРОВКА\n\n'));
    assert.ok(confirmation.includes('🏃 Вид спорта: Футбол'));
    assert.ok(confirmation.includes('📍 Место: Зал'));
    assert.ok(confirmation.includes('👥 Минимум: 5, Максимум: Безлимит'));
    assert.ok(confirmation.includes('💰 Стоимость: 300 ₼'));
    assert.ok(confirmation.endsWith('📝 Заметки: Принести воду'));
    assert.deepEqual(buttons(ctx.replies[0]), [`confirm_training_${OWNER_TG_ID}`, `cancel_training_${OWNER_TG_ID}`]);

    ctx = await h.press(`confirm_training_${OWNER_TG_ID}`);
    assert.equal(h.stubs.createCalls.length, 1);
    const p = h.stubs.createCalls[0];
    assert.equal(p.group_id, GROUP_ID);
    assert.equal(p.creator_id, DB_USER_ID);
    assert.equal(p.sport_id, 1);
    assert.equal(p.game_date.getFullYear(), 2099);
    assert.equal(p.location_id, 7);
    assert.equal(p.min_participants, 5);
    assert.equal(p.max_participants, 999);
    assert.equal(p.cost, 300);
    assert.equal(p.notes, 'Принести воду');
    assert.equal(p.type, GameType.TRAINING);
    assert.equal(h.stubs.findOrCreateCalls.length, 0);

    assert.deepEqual(ctx.answers, ['✅ Тренировка создана!']);
    // The confirmation message itself becomes the card (used to be a short edit plus a separate reply)
    assert.equal(ctx.replies.length, 0);
    assert.equal(ctx.edits.length, 1);
    assert.ok(ctx.edits[0].text.startsWith('✅ Тренировка создана!\n\n🏋️ Футбол'));
    assert.ok(ctx.edits[0].text.includes('👥 Участники: 0/Безлимит'));
    assert.ok(ctx.edits[0].text.endsWith('\n\nУчастники могут записаться прямо здесь:'));
    assert.equal(ctx.edits[0].extra.parse_mode, 'Markdown');
    assert.ok(buttons(ctx.edits[0]).includes('join_confirmed_101'));
    assert.deepEqual(h.stubs.mentions, [GROUP_ID]);
    assert.equal(h.hasWizard(), false);
  });

  test('finite max, free training ("-") and skipped notes', async () => {
    await trainingToMinStep();
    await h.say('3');
    await h.say('12');
    await h.say('-');
    await h.say('-');
    await h.press(`confirm_training_${OWNER_TG_ID}`);
    const p = h.stubs.createCalls[0];
    assert.equal(p.min_participants, 3);
    assert.equal(p.max_participants, 12);
    assert.equal(p.cost, 0);
    assert.equal(p.notes, undefined);
  });

  test('cost "0" is stored as unset, fractional cost keeps the fraction', async () => {
    await trainingToMinStep();
    await h.say('3');
    await h.say('12');
    await h.say('0');
    await h.say('-');
    await h.press(`confirm_training_${OWNER_TG_ID}`);
    assert.equal(h.stubs.createCalls[0].cost, undefined);

    h.stubs.createCalls.length = 0;
    await trainingToMinStep();
    await h.say('3');
    await h.say('12');
    await h.say('7.5');
    await h.say('-');
    await h.press(`confirm_training_${OWNER_TG_ID}`);
    assert.equal(h.stubs.createCalls[0].cost, 7.5);
  });

  test('without known locations the user types the place, the location is created on confirm', async () => {
    h.stubs.locations = [];
    await h.startTraining();
    await h.press('sport_1');
    let ctx = await h.say(FUTURE);
    // Same "no locations yet" prompt as the game wizard (the training one used to be worded differently)
    assert.ok(ctx.replies[0].text.startsWith('⚠️ Локаций для этого вида спорта в группе пока нет.\n📍 Введите место проведения текстом:'));
    assert.ok(ctx.replies[0].text.includes('/addlocation'));

    ctx = await h.say('Школа №5');
    assert.ok(ctx.replies[0].text.startsWith('👥 Введите минимальное количество участников:'));
    assert.equal(h.stubs.findOrCreateCalls.length, 0);

    await h.say('2');
    await h.say('8');
    await h.say('-');
    await h.say('-');
    await h.press(`confirm_training_${OWNER_TG_ID}`);
    assert.equal(h.stubs.findOrCreateCalls.length, 1);
    assert.deepEqual(h.stubs.findOrCreateCalls[0].slice(0, 3), ['Школа №5', 1, GROUP_ID]);
    assert.equal(h.stubs.findOrCreateCalls[0][3], undefined);
    assert.equal(h.stubs.createCalls[0].location_id, 901);
  });

  test('"another place" asks for a typed location only on the location step', async () => {
    await h.startTraining();
    await h.press('sport_1');
    let ctx = await h.press('location_custom');
    assert.equal(ctx.edits.length, 0);
    await h.say(FUTURE);
    ctx = await h.press('location_custom');
    assert.ok(ctx.edits[0].text.startsWith('📍 Введите место проведения тренировки:'));
    assert.deepEqual(ctx.answers, [undefined]);
  });

  test('unknown location id is rejected with a toast', async () => {
    await h.startTraining();
    await h.press('sport_1');
    await h.say(FUTURE);
    const ctx = await h.press('location_55');
    assert.deepEqual(ctx.answers, ['❌ Локация не найдена']);
    assert.equal(ctx.edits.length, 0);
  });
});

describe('training wizard: quick format', () => {
  test('full line with location goes to confirmation and creates the location on confirm', async () => {
    await h.startTraining();
    await h.press('sport_1');
    const ctx = await h.say(`${FUTURE} / 5 / 15 / 500 / Заметка / Зал CrossFit`);
    assert.equal(ctx.replies.length, 1);
    assert.ok(ctx.replies[0].text.startsWith('🏋️ ТРЕНИРОВКА'));
    assert.ok(ctx.replies[0].text.includes('📍 Место: Зал CrossFit'));
    assert.ok(ctx.replies[0].text.includes('👥 Минимум: 5, Максимум: 15'));
    assert.deepEqual(buttons(ctx.replies[0]), [`confirm_training_${OWNER_TG_ID}`, `cancel_training_${OWNER_TG_ID}`]);

    await h.press(`confirm_training_${OWNER_TG_ID}`);
    assert.equal(h.stubs.findOrCreateCalls.length, 1);
    assert.deepEqual(h.stubs.findOrCreateCalls[0].slice(0, 3), ['Зал CrossFit', 1, GROUP_ID]);
    assert.equal(h.stubs.findOrCreateCalls[0][3], undefined);
    const p = h.stubs.createCalls[0];
    assert.equal(p.min_participants, 5);
    assert.equal(p.max_participants, 15);
    assert.equal(p.cost, 500);
    assert.equal(p.notes, 'Заметка');
    assert.equal(p.type, GameType.TRAINING);
  });

  test('"-" for max/cost/notes means unlimited/free/none', async () => {
    await h.startTraining();
    await h.press('sport_1');
    await h.say(`${FUTURE} / 3 / - / - / - / Зал`);
    await h.press(`confirm_training_${OWNER_TG_ID}`);
    const p = h.stubs.createCalls[0];
    assert.equal(p.min_participants, 3);
    assert.equal(p.max_participants, 999);
    assert.equal(p.cost, 0);
    assert.equal(p.notes, undefined);
  });

  test('only date and min: defaults apply and a location is requested', async () => {
    await h.startTraining();
    await h.press('sport_1');
    const ctx = await h.say(`${FUTURE} / 4`);
    assert.equal(ctx.replies[0].text, '📍 Выберите место проведения:');
    await h.press('location_8');
    await h.press(`confirm_training_${OWNER_TG_ID}`);
    const p = h.stubs.createCalls[0];
    assert.equal(p.min_participants, 4);
    assert.equal(p.max_participants, 999);
    assert.equal(p.cost, 0);
    assert.equal(p.location_id, 8);
  });

  test('location button after the quick format goes straight to confirmation', async () => {
    await h.startTraining();
    await h.press('sport_1');
    await h.say(`${FUTURE} / 6 / 10 / 0 / - `);
    const ctx = await h.press('location_7');
    assert.equal(ctx.edits.length, 1);
    assert.ok(ctx.edits[0].text.startsWith('🏋️ ТРЕНИРОВКА'));
    assert.deepEqual(buttons(ctx.edits[0]), [`confirm_training_${OWNER_TG_ID}`, `cancel_training_${OWNER_TG_ID}`]);
    assert.deepEqual(ctx.answers, [undefined]);
  });

  // FIX 1: the typed-location path after a quick line used to ask for min participants again
  test('typed location after the quick format goes straight to confirmation', async () => {
    h.stubs.locations = [];
    await h.startTraining();
    await h.press('sport_1');
    let ctx = await h.say(`${FUTURE} / 6 / 10 / 0 / -`);
    assert.ok(ctx.replies[0].text.startsWith('⚠️ Локаций для этого вида спорта в группе пока нет.'));
    ctx = await h.say('Школа №5');
    assert.equal(ctx.replies.length, 1);
    assert.ok(ctx.replies[0].text.startsWith('🏋️ ТРЕНИРОВКА'));
    assert.ok(ctx.replies[0].text.includes('📍 Место: Школа №5'));
    assert.deepEqual(buttons(ctx.replies[0]), [`confirm_training_${OWNER_TG_ID}`, `cancel_training_${OWNER_TG_ID}`]);

    await h.press(`confirm_training_${OWNER_TG_ID}`);
    const p = h.stubs.createCalls[0];
    assert.equal(p.min_participants, 6);
    assert.equal(p.max_participants, 10);
  });

  // FIX 2: parseInt used to truncate the cost
  test('fractional quick cost keeps the fraction', async () => {
    await h.startTraining();
    await h.press('sport_1');
    await h.say(`${FUTURE} / 3 / 10 / 12.5 / - / Зал`);
    await h.press(`confirm_training_${OWNER_TG_ID}`);
    assert.equal(h.stubs.createCalls[0].cost, 12.5);
  });

  // FIX 4: training quick mode used to demand min >= 2
  test('min of 1 is accepted in quick mode like step by step', async () => {
    await h.startTraining();
    await h.press('sport_1');
    const ctx = await h.say(`${FUTURE} / 1 / 10 / - / - / Зал`);
    assert.ok(ctx.replies[0].text.startsWith('🏋️ ТРЕНИРОВКА'));
    assert.ok(ctx.replies[0].text.includes('👥 Минимум: 1, Максимум: 10'));
  });

  test('min of 0 is rejected in quick mode with the 1-based range', async () => {
    await h.startTraining();
    await h.press('sport_1');
    const ctx = await h.say(`${FUTURE} / 0 / 10`);
    assert.equal(ctx.replies[0].text, '❌ Ошибка в мин. участниках: ❌ Укажите число от 1 до 10:');
  });

  test('min of 1 is accepted step by step', async () => {
    await trainingToMinStep();
    const ctx = await h.say('1');
    assert.ok(ctx.replies[0].text.startsWith('👥 Введите максимальное'));
  });

  test('overlong notes in the quick format are rejected', async () => {
    await h.startTraining();
    await h.press('sport_1');
    const ctx = await h.say(`${FUTURE} / 3 / 10 / 0 / ${'x'.repeat(1500)} / Зал`);
    assert.deepEqual(ctx.replies.map((r) => r.text), ['❌ Заметки слишком длинные. Максимум 1000 символов.']);
  });

  const quickErrors: Array<[string, string, string]> = [
    ['bad date', 'завтра / 5', '❌ Неверный формат даты.'],
    ['past date', '01.01.2000 10:00 / 5', '❌ Дата игры не может быть в прошлом. Попробуйте снова:'],
    ['max not a number', `${FUTURE} / 5 / abc`, '❌ Макс. участников должно быть числом >= 1'],
    ['max zero', `${FUTURE} / 5 / 0`, '❌ Макс. участников должно быть числом >= 1'],
    ['min above max', `${FUTURE} / 10 / 5`, '❌ Ошибка в мин. участниках: ❌ Укажите число от'],
    ['min garbage', `${FUTURE} / abc / 5`, '❌ Ошибка в мин. участниках: ❌ Укажите число от'],
    ['bad cost', `${FUTURE} / 5 / 10 / abc`, '❌ Стоимость должна быть числом >= 0'],
    ['negative cost', `${FUTURE} / 5 / 10 / -5`, '❌ Стоимость должна быть числом >= 0'],
  ];
  for (const [name, input, expected] of quickErrors) {
    test(`invalid quick input (${name}) replies with the error and keeps the date step`, async () => {
      await h.startTraining();
      await h.press('sport_1');
      const ctx = await h.say(input);
      assert.equal(ctx.replies.length, 1);
      assert.ok(ctx.replies[0].text.startsWith(expected), ctx.replies[0].text);
      const next = await h.say(FUTURE);
      assert.equal(next.replies[0].text, '📍 Выберите место проведения:');
    });
  }
});

describe('training wizard: invalid step-by-step input', () => {
  test('date errors keep the step', async () => {
    await h.startTraining();
    await h.press('sport_1');
    let ctx = await h.say('как-нибудь');
    assert.ok(ctx.replies[0].text.startsWith('❌ Неверный формат даты.'));
    ctx = await h.say('01.01.2000 10:00');
    assert.equal(ctx.replies[0].text, '❌ Дата игры не может быть в прошлом. Попробуйте снова:');
  });

  test('too short typed location is rejected', async () => {
    h.stubs.locations = [];
    await h.startTraining();
    await h.press('sport_1');
    await h.say(FUTURE);
    const ctx = await h.say('ab');
    assert.deepEqual(ctx.replies.map((r) => r.text), ['❌ Слишком короткое название. Введите адрес или название места:']);
  });

  for (const bad of ['abc', '0', '1001', '-2']) {
    test(`min participants "${bad}" is rejected`, async () => {
      await trainingToMinStep();
      const ctx = await h.say(bad);
      assert.deepEqual(ctx.replies.map((r) => r.text), ['❌ Укажите число от 1 до 1000']);
    });
  }

  for (const bad of ['abc', '0', '1001']) {
    test(`max participants "${bad}" is rejected`, async () => {
      await trainingToMinStep();
      await h.say('5');
      const ctx = await h.say(bad);
      assert.deepEqual(ctx.replies.map((r) => r.text), ['❌ Укажите число от 1 до 1000 или "-" для безлимита']);
    });
  }

  test('max below min is rejected', async () => {
    await trainingToMinStep();
    await h.say('5');
    const ctx = await h.say('3');
    assert.deepEqual(ctx.replies.map((r) => r.text), ['❌ Максимум (3) не может быть меньше минимума (5)']);
  });

  for (const bad of ['abc', '-5']) {
    test(`cost "${bad}" is rejected`, async () => {
      await trainingToMinStep();
      await h.say('5');
      await h.say('10');
      const ctx = await h.say(bad);
      assert.deepEqual(ctx.replies.map((r) => r.text), ['❌ Укажите число (стоимость) или "-" для бесплатной тренировки']);
    });
  }

  test('overlong notes are rejected', async () => {
    await trainingToMinStep();
    await h.say('5');
    await h.say('10');
    await h.say('0');
    const ctx = await h.say('x'.repeat(1500));
    assert.deepEqual(ctx.replies.map((r) => r.text), ['❌ Заметки слишком длинные. Максимум 1000 символов.']);
    // the wizard stays on the notes step
    const ok = await h.say('короткая');
    assert.ok(ok.replies[0].text.startsWith('🏋️ ТРЕНИРОВКА'));
  });
});

describe('training wizard: confirm and cancel', () => {
  async function toConfirm(): Promise<void> {
    await h.startTraining();
    await h.press('sport_1');
    await h.say(`${FUTURE} / 5 / 15 / 500 / - / Зал`);
  }

  test('cancel drops the wizard', async () => {
    await toConfirm();
    const ctx = await h.press(`cancel_training_${OWNER_TG_ID}`);
    assert.deepEqual(ctx.answers, ['Отменено']);
    assert.deepEqual(ctx.edits.map((e) => e.text), ['❌ Создание тренировки отменено']);
    assert.equal(h.hasWizard(), false);
    assert.equal(h.stubs.createCalls.length, 0);
  });

  test('another user cannot confirm or cancel', async () => {
    await toConfirm();
    let ctx = await h.press(`confirm_training_${OWNER_TG_ID}`, 2002);
    assert.deepEqual(ctx.answers, ['❌ Это не ваша тренировка']);
    assert.equal(h.stubs.createCalls.length, 0);
    ctx = await h.press(`cancel_training_${OWNER_TG_ID}`, 2002);
    assert.deepEqual(ctx.answers, ['❌ Это не ваша тренировка']);
    assert.equal(h.hasWizard(), true);
  });

  test('confirm without a live wizard answers "session expired"', async () => {
    const ctx = await h.press(`confirm_training_${OWNER_TG_ID}`);
    assert.deepEqual(ctx.answers, ['❌ Сессия создания истекла']);
    assert.equal(ctx.edits.length, 0);
    assert.equal(h.stubs.createCalls.length, 0);
  });

  test('cancel without a live wizard answers "session expired"', async () => {
    const ctx = await h.press(`cancel_training_${OWNER_TG_ID}`);
    assert.deepEqual(ctx.answers, ['❌ Сессия создания истекла']);
    assert.equal(ctx.edits.length, 0);
  });

  test('a confirm button of the other wizard type does not act on the live wizard', async () => {
    await h.startTraining();
    await h.press('sport_1');
    await h.say(`${FUTURE} / 5 / 15 / 500 / - / Зал`);
    const ctx = await h.press(`confirm_game_${OWNER_TG_ID}`);
    assert.deepEqual(ctx.answers, ['❌ Сессия создания истекла']);
    assert.equal(h.stubs.createCalls.length, 0);
    assert.equal(h.hasWizard(), true);
  });

  test('a stale confirm button while the wizard is mid-way does not create anything', async () => {
    await trainingToMinStep();
    const ctx = await h.press(`confirm_training_${OWNER_TG_ID}`);
    assert.deepEqual(ctx.answers, ['❌ Сессия создания истекла']);
    assert.equal(h.stubs.createCalls.length, 0);
    assert.equal(h.hasWizard(), true);
  });

  test('double tap on confirm creates exactly one training', async () => {
    await toConfirm();
    h.stubs.createDelayMs = 20;
    const [a, b] = await Promise.all([
      h.press(`confirm_training_${OWNER_TG_ID}`),
      h.press(`confirm_training_${OWNER_TG_ID}`),
    ]);
    assert.equal(h.stubs.createCalls.length, 1);
    assert.deepEqual(h.stubs.mentions, [GROUP_ID]);
    const answers = [...a.answers, ...b.answers].sort();
    assert.deepEqual(answers, ['✅ Тренировка создана!', '❌ Сессия создания истекла']);
    assert.equal(a.answers.length, 1);
    assert.equal(b.answers.length, 1);
  });

  test('a failed createGame restores the wizard so the user can retry', async () => {
    await toConfirm();
    h.stubs.failCreate = true;
    const origError = console.error;
    console.error = () => undefined;
    let ctx: FakeCtx;
    try {
      ctx = await h.press(`confirm_training_${OWNER_TG_ID}`);
    } finally {
      console.error = origError;
    }
    assert.deepEqual(ctx.answers, ['❌ Ошибка создания тренировки']);
    assert.deepEqual(ctx.replies.map((r) => r.text), ['❌ Не удалось создать тренировку. Попробуйте ещё раз.']);
    assert.deepEqual(h.stubs.mentions, []);
    assert.equal(h.hasWizard(), true);

    h.stubs.failCreate = false;
    ctx = await h.press(`confirm_training_${OWNER_TG_ID}`);
    assert.deepEqual(ctx.answers, ['✅ Тренировка создана!']);
    assert.equal(h.stubs.createCalls.length, 1);
  });

  test('the typed-location create path failing in findOrCreate also restores the wizard', async () => {
    h.stubs.locations = [];
    await h.startTraining();
    await h.press('sport_1');
    await h.say(`${FUTURE} / 5 / 15 / 500 / - / Зал`);
    h.stubs.failCreate = true;
    const origError = console.error;
    console.error = () => undefined;
    try {
      await h.press(`confirm_training_${OWNER_TG_ID}`);
    } finally {
      console.error = origError;
    }
    assert.equal(h.hasWizard(), true);
  });
});

describe('training wizard: created message keyboard', () => {
  async function createIn(chatType: string): Promise<FakeCtx> {
    await h.startTraining();
    await h.press('sport_1');
    await h.say(`${FUTURE} / 5 / 15 / 500 / - / Зал`);
    return h.press(`confirm_training_${OWNER_TG_ID}`, OWNER_TG_ID, chatType);
  }

  test('in a group: DM button and no admin buttons', async () => {
    const ctx = await createIn('group');
    const data = buttons(ctx.edits[0]);
    assert.ok(data.includes('send_to_dm_101'));
    assert.ok(!data.includes('set_lock_101'));
    assert.ok(!data.includes('delete_game_101'));
  });

  test('in a private chat an admin gets lock and delete buttons', async () => {
    h.stubs.isAdmin = true;
    const ctx = await createIn('private');
    const data = buttons(ctx.edits[0]);
    assert.ok(!data.includes('send_to_dm_101'));
    assert.ok(data.includes('set_lock_101'));
    assert.ok(data.includes('delete_game_101'));
  });

  // Used to pass isAdmin = true unconditionally
  test('in a private chat a non-admin gets no admin buttons', async () => {
    h.stubs.isAdmin = false;
    const ctx = await createIn('private');
    const data = buttons(ctx.edits[0]);
    assert.ok(!data.includes('set_lock_101'));
    assert.ok(!data.includes('delete_game_101'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Cross-cutting: text routing
// ═══════════════════════════════════════════════════════════════════════════

describe('wizard text routing', () => {
  test('in a group only replies to the bot are taken as wizard input', async () => {
    await h.startGame();
    await h.press('sport_1');
    const ignored = makeCtx(OWNER_TG_ID, 'group', FUTURE, false);
    assert.equal(isWizardInput(ignored as any), false);

    const ctx = await h.say(FUTURE, OWNER_TG_ID, 'group');
    assert.ok(ctx.replies[0].text.startsWith('✅ Дата: '));
  });

  test('text from a user without a wizard is ignored', async () => {
    await h.startGame();
    await h.press('sport_1');
    const ctx = await h.say(FUTURE, 3003);
    assert.equal(ctx.replies.length, 0);
  });

  test('two users run independent wizards', async () => {
    await h.startGame(1001);
    await h.startTraining(2002);
    await h.press('sport_1', 1001);
    await h.press('sport_2', 2002);
    const game = await h.say(FUTURE, 1001);
    const training = await h.say(FUTURE, 2002);
    assert.ok(game.replies[0].text.startsWith('✅ Дата: '));
    assert.equal(training.replies[0].text, '📍 Выберите место проведения:');
  });

  test('StateManager.clearUser is what ends a user\'s wizard', async () => {
    await h.startGame();
    StateManager.clearUser(OWNER_TG_ID);
    assert.equal(h.hasWizard(), false);
  });
});
