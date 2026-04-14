import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { LocationService } from '../../services/LocationService';
import { Location } from '../../models/Location';
import { SportLocation } from '../../models/SportLocation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLocationRepo(overrides: Partial<Record<string, any>> = {}) {
  return {
    findOne: async () => null,
    find: async () => [],
    create: (data: any) => ({ id: 1, is_active: true, ...data }),
    save: async (x: any) => x,
    delete: async () => ({ affected: 1 }),
    update: async () => {},
    createQueryBuilder: () => { throw new Error('not mocked'); },
    ...overrides,
  };
}

function makeSportLocationRepo(overrides: Partial<Record<string, any>> = {}) {
  return {
    findOne: async () => null,
    create: (data: any) => ({ ...data }),
    save: async (x: any) => x,
    delete: async () => ({ affected: 1 }),
    ...overrides,
  };
}

function makeService(
  locationRepoOverrides: Partial<Record<string, any>> = {},
  sportLocationRepoOverrides: Partial<Record<string, any>> = {}
) {
  const mockDb = { dataSource: { getRepository: () => ({}) } } as any;
  const service = new LocationService(mockDb);
  (service as any).locationRepository = makeLocationRepo(locationRepoOverrides);
  (service as any).sportLocationRepository = makeSportLocationRepo(sportLocationRepoOverrides);
  return service;
}

// ---------------------------------------------------------------------------
// activate / deactivate
// ---------------------------------------------------------------------------
describe('LocationService.deactivate', () => {
  test('returns true when location exists', async () => {
    const service = makeService();
    (service as any).update = async () => ({ id: 1 } as Location);
    assert.equal(await service.deactivate(1), true);
  });

  test('returns false when location not found', async () => {
    const service = makeService();
    (service as any).update = async () => null;
    assert.equal(await service.deactivate(999), false);
  });
});

describe('LocationService.activate', () => {
  test('returns true when location exists', async () => {
    const service = makeService();
    (service as any).update = async () => ({ id: 1 } as Location);
    assert.equal(await service.activate(1), true);
  });

  test('returns false when location not found', async () => {
    const service = makeService();
    (service as any).update = async () => null;
    assert.equal(await service.activate(999), false);
  });
});

// ---------------------------------------------------------------------------
// addSportToLocation / removeSportFromLocation
// ---------------------------------------------------------------------------
describe('LocationService.addSportToLocation', () => {
  test('returns true without saving when sport already linked', async () => {
    let saveCalled = false;
    const service = makeService(
      {},
      {
        findOne: async () => ({ location_id: 1, sport_id: 5 }),
        save: async (x: any) => { saveCalled = true; return x; },
      }
    );
    const result = await service.addSportToLocation(1, 5);
    assert.equal(result, true);
    assert.equal(saveCalled, false);
  });

  test('saves and returns true when sport not yet linked', async () => {
    let saveCalled = false;
    const service = makeService(
      {},
      {
        findOne: async () => null,
        create: (data: any) => ({ ...data }),
        save: async (x: any) => { saveCalled = true; return x; },
      }
    );
    const result = await service.addSportToLocation(1, 5);
    assert.equal(result, true);
    assert.equal(saveCalled, true);
  });
});

describe('LocationService.removeSportFromLocation', () => {
  test('returns true when row deleted', async () => {
    const service = makeService({}, { delete: async () => ({ affected: 1 }) });
    assert.equal(await service.removeSportFromLocation(1, 5), true);
  });

  test('returns false when nothing deleted', async () => {
    const service = makeService({}, { delete: async () => ({ affected: 0 }) });
    assert.equal(await service.removeSportFromLocation(1, 5), false);
  });
});

// ---------------------------------------------------------------------------
// findOrCreate
// ---------------------------------------------------------------------------
describe('LocationService.findOrCreate', () => {
  test('returns existing location when found', async () => {
    const existing = { id: 7, name: 'Arena', group_id: 1, sportLocations: [{ sport_id: 3 }] };
    // findOne returns existing, getById also returns it
    const locationRepo = makeLocationRepo({ findOne: async () => existing });
    const service = makeService();
    (service as any).locationRepository = locationRepo;
    // stub getById so findOrCreate can return without full DB
    (service as any).getById = async () => existing;

    const result = await service.findOrCreate('Arena', 3, 1);
    assert.equal(result.id, 7);
  });

  test('adds sport to existing location when sport not linked yet', async () => {
    const existing = { id: 7, name: 'Arena', group_id: 1, sportLocations: [] };
    let sportLinkSaved: any = null;

    const service = makeService(
      { findOne: async () => existing },
      {
        findOne: async () => null,
        create: (data: any) => ({ ...data }),
        save: async (x: any) => { sportLinkSaved = x; return x; },
      }
    );
    (service as any).getById = async () => ({ ...existing, sportLocations: [{ sport_id: 5 }] });

    await service.findOrCreate('Arena', 5, 1);
    assert.ok(sportLinkSaved !== null, 'should have saved sport link');
    assert.equal(sportLinkSaved.sport_id, 5);
  });

  test('creates new location when not found', async () => {
    const service = makeService({ findOne: async () => null });
    let createCalled = false;
    (service as any).create = async (data: any) => {
      createCalled = true;
      return { id: 10, name: data.name, group_id: data.group_id };
    };

    await service.findOrCreate('NewArena', 3, 1);
    assert.equal(createCalled, true);
  });
});
