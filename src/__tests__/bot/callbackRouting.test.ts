import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Telegraf } from 'telegraf';
import { GameActionsHandler } from '../../bot/handlers/GameActionsHandler';
import { GroupActionsHandler } from '../../bot/handlers/GroupActionsHandler';
import { CreationHandler } from '../../bot/handlers/CreationHandler';
import { GamesFilterHandler } from '../../bot/handlers/GamesFilterHandler';
import { LocationCreationHandler } from '../../bot/handlers/LocationCreationHandler';
import { LocationEditHandler } from '../../bot/handlers/LocationEditHandler';

type ActionPattern = string | RegExp;

// Regex source of "\d+", spelled out to keep the expected patterns below readable: "(#)" stands for a numeric id
const DIGITS = String.fromCharCode(92) + 'd+';

const DB_ENV_KEYS = ['DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE'] as const;
const savedEnv: Record<string, string | undefined> = {};

// Telegraf dispatches a callback to the first matching handler, so registration order matters:
// this mirrors Bot.registerHandlers().
let patterns: ActionPattern[] = [];

function collectPatterns(): ActionPattern[] {
  const collected: ActionPattern[] = [];
  const fakeBot = {
    action: (pattern: ActionPattern) => { collected.push(pattern); },
    on: () => {},
    command: () => {},
  } as unknown as Telegraf;
  const stub = {} as never;

  // GameActionsHandler builds a (non-connecting) Database singleton, which needs credentials in env
  new GameActionsHandler(stub).register(fakeBot);
  new GroupActionsHandler(stub).register(fakeBot);
  new CreationHandler({} as never).register(fakeBot);
  new LocationCreationHandler({} as never).register(fakeBot);
  new LocationEditHandler({} as never).register(fakeBot);
  new GamesFilterHandler({} as never).register(fakeBot);
  return collected;
}

function firstMatch(callbackData: string): string | undefined {
  for (const pattern of patterns) {
    if (typeof pattern === 'string') {
      if (pattern === callbackData) return pattern;
    } else if (pattern.test(callbackData)) {
      return pattern.source.split(DIGITS).join('#');
    }
  }
  return undefined;
}

describe('callback routing', () => {
  before(() => {
    for (const key of DB_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      process.env[key] ??= 'test';
    }
    patterns = collectPatterns();
  });

  after(() => {
    for (const key of DB_ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  test('registers a non-trivial number of actions', () => {
    assert.ok(patterns.length > 30);
  });

  test('every RegExp action pattern is anchored with ^ and $', () => {
    const unanchored = patterns
      .filter((p): p is RegExp => p instanceof RegExp)
      .map((p) => p.source)
      .filter((source) => !source.startsWith('^') || !source.endsWith('$'));
    assert.deepEqual(unanchored, []);
  });

  const routes: Array<[string, string]> = [
    ['leave_group_5', '^leave_group_(#)$'],
    ['group_5', '^group_(#)$'],
    ['manage_members_5', '^manage_members_(#)$'],
    ['members_5', '^members_(#)$'],
    ['manage_5', '^manage_(#)$'],
    ['remove_member_5_7', '^remove_member_(#)_(#)$'],
    ['confirm_remove_member_5_7', '^confirm_remove_member_(#)_(#)$'],
    ['cancel_remove_member_5', '^cancel_remove_member_(#)$'],
    ['delete_game_3', '^delete_game_(#)$'],
    ['confirm_delete_game_3', '^confirm_delete_game_(#)$'],
    ['call_off_5', '^call_off_(#)$'],
    ['confirm_call_off_5', '^confirm_call_off_(#)$'],
    ['keep_game_5', '^keep_game_(#)$'],
    ['complete_game_5', '^complete_game_(#)$'],
    ['sport_5', '^sport_(#)$'],
    ['location_5', '^location_(#)$'],
    ['location_custom', 'location_custom'],
    ['confirm_game_5', '^confirm_(game|training)_(#)$'],
    ['confirm_training_5', '^confirm_(game|training)_(#)$'],
    ['cancel_game_5', '^cancel_(game|training)_(#)$'],
    ['cancel_training_5', '^cancel_(game|training)_(#)$'],
  ];

  for (const [callbackData, expectedSource] of routes) {
    test(`"${callbackData}" is handled first by ${expectedSource}`, () => {
      assert.equal(firstMatch(callbackData), expectedSource);
    });
  }

  test('lifecycle callbacks do not collide with the creation wizard or the delete flow', () => {
    for (const data of ['call_off_5', 'confirm_call_off_5', 'keep_game_5', 'complete_game_5']) {
      const handler = firstMatch(data);
      assert.ok(handler, data);
      assert.ok(!handler.includes('(game|training)'), data);
      assert.ok(!handler.includes('delete_game'), data);
    }
    for (const data of ['cancel_game_5', 'confirm_game_5', 'delete_game_5', 'confirm_delete_game_5']) {
      const handler = firstMatch(data);
      assert.ok(handler, data);
      assert.ok(!/call_off|keep_game|complete_game/.test(handler), data);
    }
  });

  test('only one handler removes a member: no immediate-removal pattern remains', () => {
    const removeHandlers = patterns.filter(
      (p) => p instanceof RegExp && p.source.includes('remove_member') && !p.source.includes('confirm') && !p.source.includes('cancel')
    );
    assert.equal(removeHandlers.length, 1);
  });
});
