import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { SportService } from '../../services/SportService';
import { Sport } from '../../models/Sport';
import { ValidationError } from '../../utils/errors';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function makeService(overrides: Partial<Record<string, any>> = {}) {
  const sportRepo = {
    find: async () => [],
    findOne: async () => null,
    create: (data: any) => ({ id: 1, is_active: true, ...data }),
    save: async (x: any) => x,
    ...overrides,
  };
  const mockDb = { getRepository: () => sportRepo } as any;
  return { service: new SportService(mockDb), sportRepo };
}

// ---------------------------------------------------------------------------
// initializeDefaultSports
// ---------------------------------------------------------------------------
describe('SportService.initializeDefaultSports', () => {
  test('creates sports that do not exist yet, scoped to base sports only', async () => {
    const created: any[] = [];
    const lookedUpWhere: any[] = [];
    const { service } = makeService({
      findOne: async (opts: any) => { lookedUpWhere.push(opts?.where); return null; }, // nothing exists
      create: (data: any) => ({ id: 1, is_active: true, ...data }),
      save: async (x: any) => { created.push(x); return x; },
    });

    await service.initializeDefaultSports();

    // Should have created all 7 default sports
    assert.equal(created.length, 7);
    assert.ok(created.some(s => s.name === 'Футбол'));
    assert.ok(created.some(s => s.name === 'Волейбол'));
    assert.ok(created.some(s => s.name === 'Настольные игры'));
    // The seed only ever creates base sports.
    assert.ok(created.every(s => s.group_id === null));
    // The lookup is scoped to base sports (group_id IS NULL), not the whole table.
    assert.ok(lookedUpWhere.every(w => w?.name && 'group_id' in w));
  });

  test('skips sports that already exist', async () => {
    const created: string[] = [];
    const { service } = makeService({
      // All sports already exist
      findOne: async () => ({ id: 1, name: 'any', emoji: '✅', group_id: null } as Sport),
      save: async (x: any) => { created.push(x.name); return x; },
    });

    await service.initializeDefaultSports();

    assert.equal(created.length, 0);
  });

  test('creates only missing sports when some exist', async () => {
    const existingNames = new Set(['Футбол', 'Волейбол']);
    const created: string[] = [];

    const { service } = makeService({
      findOne: async (opts: any) => {
        const name = opts?.where?.name;
        return existingNames.has(name) ? { id: 1, name, emoji: '✅', group_id: null } : null;
      },
      create: (data: any) => ({ id: 1, is_active: true, ...data }),
      save: async (x: any) => { created.push(x.name); return x; },
    });

    await service.initializeDefaultSports();

    assert.equal(created.length, 5); // 7 total - 2 existing
    assert.ok(!created.includes('Футбол'));
    assert.ok(!created.includes('Волейбол'));
  });
});

// ---------------------------------------------------------------------------
// getSportsForGroup
// ---------------------------------------------------------------------------
describe('SportService.getSportsForGroup', () => {
  test('queries base sports plus the group\'s own active sports, ordered by name', async () => {
    let capturedWhere: any;
    const allSports = [
      { id: 1, name: 'Футбол', emoji: '⚽', group_id: null, is_active: true },
      { id: 2, name: 'Дартс', emoji: '🎯', group_id: 42, is_active: true },
    ];
    const { service } = makeService({
      find: async (opts: any) => { capturedWhere = opts?.where; return allSports; },
    });

    const result = await service.getSportsForGroup(42);

    assert.deepEqual(result, allSports);
    assert.ok(Array.isArray(capturedWhere));
    assert.equal(capturedWhere.length, 2);
    assert.equal(capturedWhere[0].is_active, true);
    assert.equal(capturedWhere[1].group_id, 42);
    assert.equal(capturedWhere[1].is_active, true);
  });
});

// ---------------------------------------------------------------------------
// createGroupSport
// ---------------------------------------------------------------------------
describe('SportService.createGroupSport', () => {
  test('trims name and emoji', async () => {
    let savedSport: any;
    const { service } = makeService({
      findOne: async () => null,
      create: (data: any) => ({ id: 1, is_active: true, ...data }),
      save: async (x: any) => { savedSport = x; return x; },
    });

    await service.createGroupSport(1, '  Дартс  ', '  🎯  ');

    assert.equal(savedSport.name, 'Дартс');
    assert.equal(savedSport.emoji, '🎯');
  });

  test('rejects input with a ValidationError, not a plain Error', async () => {
    const { service } = makeService();
    // Routes map ValidationError to 400 and everything else to a logged 500,
    // so the error class is part of this method's contract.
    await assert.rejects(
      () => service.createGroupSport(1, '   ', '?'),
      (err: unknown) => err instanceof ValidationError,
    );
  });

  test('rejects an empty name', async () => {
    const { service } = makeService();
    await assert.rejects(() => service.createGroupSport(1, '   ', '🎯'));
  });

  test('rejects an empty emoji', async () => {
    const { service } = makeService();
    await assert.rejects(() => service.createGroupSport(1, 'Дартс', '   '));
  });

  test('rejects a name matching a base sport', async () => {
    const { service } = makeService({
      // The base-sport lookup (group_id IS NULL) finds a match — request is rejected
      // before the group-scoped duplicate check even runs.
      findOne: async (opts: any) =>
        opts?.where?.name === 'Футбол' ? { id: 1, name: 'Футбол', emoji: '⚽', group_id: null } : null,
    });

    await assert.rejects(() => service.createGroupSport(1, 'Футбол', '⚽'));
  });

  test('rejects a duplicate inside the same group', async () => {
    const { service } = makeService({
      findOne: async (opts: any) => {
        // First call checks base sports — no match. Second call checks the group — active duplicate.
        if (opts?.where?.group_id === 1) {
          return { id: 5, name: 'Дартс', emoji: '🎯', group_id: 1, is_active: true };
        }
        return null;
      },
    });

    await assert.rejects(() => service.createGroupSport(1, 'Дартс', '🎯'));
  });

  test('reactivates a previously deactivated sport instead of creating a duplicate', async () => {
    let savedSport: any;
    const existing = { id: 5, name: 'Дартс', emoji: '🎯old', group_id: 1, is_active: false };
    const { service, sportRepo } = makeService({
      findOne: async (opts: any) => (opts?.where?.group_id === 1 ? existing : null),
      save: async (x: any) => { savedSport = x; return x; },
    });
    let createCalled = false;
    sportRepo.create = () => { createCalled = true; return {} as any; };

    const result = await service.createGroupSport(1, 'Дартс', '🎯');

    assert.equal(createCalled, false);
    assert.equal(result.id, 5);
    assert.equal(savedSport.is_active, true);
    assert.equal(savedSport.emoji, '🎯');
  });
});

// ---------------------------------------------------------------------------
// deactivateGroupSport
// ---------------------------------------------------------------------------
describe('SportService.deactivateGroupSport', () => {
  test('refuses to deactivate a base sport', async () => {
    const { service } = makeService({
      findOne: async () => ({ id: 1, name: 'Футбол', emoji: '⚽', group_id: null, is_active: true }),
    });

    await assert.rejects(() => service.deactivateGroupSport(1, 42));
  });

  test('refuses to deactivate another group\'s sport', async () => {
    const { service } = makeService({
      findOne: async () => ({ id: 5, name: 'Дартс', emoji: '🎯', group_id: 1, is_active: true }),
    });

    await assert.rejects(() => service.deactivateGroupSport(5, 2));
  });

  test('deactivates the group\'s own sport', async () => {
    let savedSport: any;
    const { service } = makeService({
      findOne: async () => ({ id: 5, name: 'Дартс', emoji: '🎯', group_id: 1, is_active: true }),
      save: async (x: any) => { savedSport = x; return x; },
    });

    await service.deactivateGroupSport(5, 1);

    assert.equal(savedSport.is_active, false);
  });
});
