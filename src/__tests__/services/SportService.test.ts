import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { SportService } from '../../services/SportService';
import { Sport } from '../../models/Sport';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function makeService(overrides: Partial<Record<string, any>> = {}) {
  const sportRepo = {
    find: async () => [],
    findOne: async () => null,
    create: (data: any) => ({ id: 1, ...data }),
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
  test('creates sports that do not exist yet', async () => {
    const created: string[] = [];
    const { service } = makeService({
      findOne: async () => null,          // nothing exists
      create: (data: any) => ({ id: 1, ...data }),
      save: async (x: any) => { created.push(x.name); return x; },
    });

    await service.initializeDefaultSports();

    // Should have created all 6 default sports
    assert.equal(created.length, 6);
    assert.ok(created.includes('Футбол'));
    assert.ok(created.includes('Волейбол'));
  });

  test('skips sports that already exist', async () => {
    const created: string[] = [];
    const { service } = makeService({
      // All sports already exist
      findOne: async () => ({ id: 1, name: 'any', emoji: '✅' } as Sport),
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
        return existingNames.has(name) ? { id: 1, name, emoji: '✅' } : null;
      },
      create: (data: any) => ({ id: 1, ...data }),
      save: async (x: any) => { created.push(x.name); return x; },
    });

    await service.initializeDefaultSports();

    assert.equal(created.length, 4); // 6 total - 2 existing
    assert.ok(!created.includes('Футбол'));
    assert.ok(!created.includes('Волейбол'));
  });
});
