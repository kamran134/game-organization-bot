import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { UserService } from '../../services/UserService';
import { GameStatus } from '../../models/Game';
import { GameParticipant, ParticipationStatus } from '../../models/GameParticipant';

// ---------------------------------------------------------------------------
// Helper: builds a UserService with injectable userRepo mock
// ---------------------------------------------------------------------------
function makeService(userRepoOverrides: Partial<Record<string, any>> = {}) {
  const userRepo = {
    findOne: async () => null,
    create: (data: any) => ({ id: 1, mention: 'user', ...data }),
    save: async (x: any) => x,
    update: async () => {},
    ...userRepoOverrides,
  };

  const mockDb = { getRepository: () => userRepo } as any;
  return { service: new UserService(mockDb), userRepo };
}

// ---------------------------------------------------------------------------
// findOrCreateUser
// ---------------------------------------------------------------------------
describe('UserService.findOrCreateUser', () => {
  test('returns existing user without calling save', async () => {
    const existing = { id: 5, telegram_id: 100, username: 'alice' };
    let saveCalled = false;
    const { service } = makeService({
      findOne: async () => existing,
      save: async (x: any) => { saveCalled = true; return x; },
    });

    const result = await service.findOrCreateUser({ id: 100 });

    assert.equal(result, existing);
    assert.equal(saveCalled, false);
  });

  test('creates new user when not found', async () => {
    let saved: any = null;
    const { service } = makeService({
      findOne: async () => null,
      create: (data: any) => ({ id: 99, mention: 'new', ...data }),
      save: async (x: any) => { saved = x; return x; },
    });

    const result = await service.findOrCreateUser({ id: 42, username: 'bob', first_name: 'Bob' });

    assert.ok(saved !== null);
    assert.equal(saved.telegram_id, 42);
    assert.equal(saved.username, 'bob');
    assert.equal(result.telegram_id, 42);
  });

  test('created user has correct telegram_id', async () => {
    const { service } = makeService({
      findOne: async () => null,
      create: (data: any) => ({ id: 1, ...data }),
      save: async (x: any) => x,
    });

    const result = await service.findOrCreateUser({ id: 777, first_name: 'Test' });
    assert.equal(result.telegram_id, 777);
  });
});

// ---------------------------------------------------------------------------
// getUserStats
// ---------------------------------------------------------------------------
describe('UserService.getUserStats', () => {
  test('returns zeros when user not found', async () => {
    const { service } = makeService({ findOne: async () => null });
    const stats = await service.getUserStats(999);
    assert.deepEqual(stats, { totalGames: 0, upcomingGames: 0 });
  });

  test('counts total participations correctly', async () => {
    const future = new Date(Date.now() + 86400_000);
    const past = new Date(Date.now() - 86400_000);

    const makeParticipation = (date: Date, status: GameStatus) => {
      const p = new GameParticipant();
      p.participation_status = ParticipationStatus.CONFIRMED;
      (p as any).game = { game_date: date, status };
      return p;
    };

    const user = {
      id: 1,
      gameParticipations: [
        makeParticipation(future, GameStatus.PLANNED),
        makeParticipation(future, GameStatus.PLANNED),
        makeParticipation(past, GameStatus.COMPLETED),
      ],
    };

    const { service } = makeService({ findOne: async () => user });
    const stats = await service.getUserStats(1);

    assert.equal(stats.totalGames, 3);
    assert.equal(stats.upcomingGames, 2);
  });

  test('does not count cancelled games as upcoming', async () => {
    const future = new Date(Date.now() + 86400_000);
    const p = new GameParticipant();
    p.participation_status = ParticipationStatus.CONFIRMED;
    (p as any).game = { game_date: future, status: GameStatus.CANCELLED };

    const user = { id: 1, gameParticipations: [p] };
    const { service } = makeService({ findOne: async () => user });
    const stats = await service.getUserStats(1);

    assert.equal(stats.totalGames, 1);
    assert.equal(stats.upcomingGames, 0);
  });
});
