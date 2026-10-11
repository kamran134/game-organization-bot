import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GameLifecycleService, shouldAutoCancel, AUTO_COMPLETE_AFTER_MS } from '../../services/GameLifecycleService';
import { Game, GameStatus } from '../../models/Game';
import { GameType } from '../../models/GameType';
import { GameParticipant, ParticipationStatus } from '../../models/GameParticipant';

const HOUR = 3600 * 1000;
const NOW = new Date('2026-06-10T12:00:00Z');

function participants(confirmed: number, maybe: number, guests: number): GameParticipant[] {
  const make = (status: ParticipationStatus, count: number): GameParticipant[] =>
    Array.from({ length: count }, () => ({ participation_status: status }) as GameParticipant);
  return [
    ...make(ParticipationStatus.CONFIRMED, confirmed),
    ...make(ParticipationStatus.MAYBE, maybe),
    ...make(ParticipationStatus.GUEST, guests),
  ];
}

/** Game starting in 2h with a 3h lock (lock moment: 1h ago), created a day ago, min 6, 4 confirmed. */
function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 1,
    status: GameStatus.PLANNED,
    type: GameType.GAME,
    game_date: new Date(NOW.getTime() + 2 * HOUR),
    registration_lock_hours: 3,
    created_at: new Date(NOW.getTime() - 24 * HOUR),
    min_participants: 6,
    participants: participants(4, 0, 0),
    ...overrides,
  } as Game;
}

describe('shouldAutoCancel', () => {
  const cases: Array<[string, Partial<Game>, boolean]> = [
    ['lock not set', { registration_lock_hours: undefined }, false],
    ['lock hours is zero', { registration_lock_hours: 0 }, false],
    ['lock moment in the future', { game_date: new Date(NOW.getTime() + 5 * HOUR) }, false],
    ['lock passed, too few players', {}, true],
    ['lock passed, enough confirmed', { participants: participants(6, 0, 0) }, false],
    ['lock passed, confirmed + guests reach the minimum', { participants: participants(4, 0, 2) }, false],
    ['maybe does not count', { participants: participants(4, 5, 0) }, true],
    ['game already started', { game_date: new Date(NOW.getTime() - HOUR) }, false],
    ['game starts exactly now', { game_date: NOW }, false],
    ['training is ignored', { type: GameType.TRAINING }, false],
    ['created after the lock moment', { created_at: new Date(NOW.getTime() - 30 * 60 * 1000) }, false],
    ['created exactly at the lock moment', { created_at: new Date(NOW.getTime() - HOUR) }, false],
    ['already cancelled', { status: GameStatus.CANCELLED }, false],
    ['already completed', { status: GameStatus.COMPLETED }, false],
    ['no participants at all', { participants: [] }, true],
    ['participants not loaded', { participants: undefined }, true],
  ];

  for (const [name, overrides, expected] of cases) {
    test(name, () => {
      assert.equal(shouldAutoCancel(makeGame(overrides), NOW), expected);
    });
  }

  test('lock moment itself counts as passed', () => {
    const game = makeGame({ game_date: new Date(NOW.getTime() + 3 * HOUR) });
    assert.equal(shouldAutoCancel(game, NOW), true);
  });
});

interface RepoStub {
  updates: Array<{ criteria: unknown; set: unknown }>;
  update: (criteria: unknown, set: unknown) => Promise<{ affected: number }>;
  findOne: () => Promise<Game | null>;
  find: () => Promise<Game[]>;
  createQueryBuilder: () => unknown;
}

function makeService(options: {
  affected?: number | ((gameId: number) => number);
  loaded?: Game | null;
  candidates?: Game[];
  completedRaw?: Array<{ id: number }>;
  findOneFails?: boolean;
} = {}) {
  const notified: Array<{ gameId: number; reason: string }> = [];
  const builderCalls: { set?: unknown; where?: unknown; params?: unknown; returning?: string } = {};
  const repo: RepoStub = {
    updates: [],
    update: async (criteria: unknown, set: unknown) => {
      repo.updates.push({ criteria, set });
      const id = (criteria as { id: number }).id;
      const affected = typeof options.affected === 'function' ? options.affected(id) : (options.affected ?? 1);
      return { affected };
    },
    findOne: async () => {
      if (options.findOneFails) throw new Error('db down');
      return options.loaded === undefined ? makeGame() : options.loaded;
    },
    find: async () => options.candidates ?? [],
    createQueryBuilder: () => {
      const builder = {
        update: () => builder,
        set: (value: unknown) => { builderCalls.set = value; return builder; },
        where: (clause: string, params: unknown) => { builderCalls.where = clause; builderCalls.params = params; return builder; },
        returning: (columns: string) => { builderCalls.returning = columns; return builder; },
        execute: async () => ({ raw: options.completedRaw ?? [] }),
      };
      return builder;
    },
  };
  const db = { getRepository: () => repo };
  const notifications = {
    notifyCancelled: async (game: Game, reason: string): Promise<void> => {
      notified.push({ gameId: game.id, reason });
    },
  };
  const service = new GameLifecycleService(db as never, notifications as never);
  return { service, repo, notified, builderCalls };
}

function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const { error } = console;
  console.error = (): void => undefined;
  return fn().finally(() => { console.error = error; });
}

describe('GameLifecycleService.cancel', () => {
  test('returns false and sends nothing when the game was not planned', async () => {
    const { service, notified } = makeService({ affected: 0 });

    assert.equal(await service.cancel(1, 'manual'), false);
    assert.deepEqual(notified, []);
  });

  test('sends exactly one notification when the transition happened', async () => {
    const { service, repo, notified } = makeService({ affected: 1 });

    assert.equal(await service.cancel(1, 'min_not_reached'), true);
    assert.deepEqual(notified, [{ gameId: 1, reason: 'min_not_reached' }]);
    assert.deepEqual(repo.updates, [{ criteria: { id: 1, status: GameStatus.PLANNED }, set: { status: GameStatus.CANCELLED } }]);
  });

  test('still reports the transition when loading the game for the notification fails', async () => {
    const { service, notified } = makeService({ findOneFails: true });

    assert.equal(await quiet(() => service.cancel(1, 'manual')), true);
    assert.deepEqual(notified, []);
  });

  test('skips the notification when the game vanished right after the update', async () => {
    const { service, notified } = makeService({ loaded: null });

    assert.equal(await service.cancel(1, 'manual'), true);
    assert.deepEqual(notified, []);
  });
});

describe('GameLifecycleService.complete', () => {
  test('transitions planned games only and never notifies', async () => {
    const hit = makeService({ affected: 1 });
    assert.equal(await hit.service.complete(1), true);
    assert.deepEqual(hit.repo.updates, [{ criteria: { id: 1, status: GameStatus.PLANNED }, set: { status: GameStatus.COMPLETED } }]);
    assert.deepEqual(hit.notified, []);

    const miss = makeService({ affected: 0 });
    assert.equal(await miss.service.complete(1), false);
  });
});

describe('GameLifecycleService.runAutoTransitions', () => {
  test('bulk-completes games that started more than 3h ago', async () => {
    const { service, builderCalls } = makeService({ completedRaw: [{ id: 7 }, { id: 9 }] });

    const result = await service.runAutoTransitions(NOW);

    assert.deepEqual(result.completed, [7, 9]);
    assert.deepEqual(builderCalls.set, { status: GameStatus.COMPLETED });
    assert.equal(builderCalls.returning, 'id');
    const params = builderCalls.params as { planned: string; completeBefore: Date };
    assert.equal(params.planned, GameStatus.PLANNED);
    assert.equal(params.completeBefore.getTime(), NOW.getTime() - AUTO_COMPLETE_AFTER_MS);
  });

  test('cancels only the games that shouldAutoCancel selects', async () => {
    const short = makeGame({ id: 1 });
    const enough = makeGame({ id: 2, participants: participants(6, 0, 0) });
    const { service, notified } = makeService({ candidates: [short, enough] });

    const result = await service.runAutoTransitions(NOW);

    assert.deepEqual(result.cancelled, [1]);
    assert.deepEqual(notified.map((n) => n.gameId), [1]);
    assert.equal(notified[0].reason, 'min_not_reached');
  });

  test('does not report a game that another run already cancelled', async () => {
    const { service, notified } = makeService({ candidates: [makeGame({ id: 1 })], affected: 0 });

    const result = await service.runAutoTransitions(NOW);

    assert.deepEqual(result.cancelled, []);
    assert.deepEqual(notified, []);
  });

  test('continues with the remaining games after one throws', async () => {
    const candidates = [makeGame({ id: 1 }), makeGame({ id: 2 }), makeGame({ id: 3 })];
    const { service } = makeService({
      candidates,
      affected: (id) => {
        if (id === 2) throw new Error('deadlock detected');
        return 1;
      },
    });

    const result = await quiet(() => service.runAutoTransitions(NOW));

    assert.deepEqual(result.cancelled, [1, 3]);
  });
});
