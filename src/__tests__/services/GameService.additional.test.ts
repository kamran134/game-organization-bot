import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GameService } from '../../services/GameService';
import { ParticipationStatus } from '../../models/GameParticipant';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeParticipantRepo(overrides: Partial<Record<string, any>> = {}) {
  return {
    findOne: async () => null,
    create: (data: any) => ({ id: 1, joined_at: new Date(), updated_at: new Date(), ...data }),
    save: async (x: any) => x,
    delete: async () => {},
    remove: async () => {},
    find: async () => [],
    ...overrides,
  };
}

function makeService(participantRepoOverrides: Partial<Record<string, any>> = {}) {
  const mockDb = { getRepository: () => makeParticipantRepo(participantRepoOverrides) } as any;
  const service = new GameService(mockDb);
  return service;
}

// ---------------------------------------------------------------------------
// addParticipant
// ---------------------------------------------------------------------------
describe('GameService.addParticipant', () => {
  test('creates new participant when not existing', async () => {
    let created: any = null;
    const service = makeService({
      findOne: async () => null,
      create: (data: any) => { created = data; return { ...data, id: 1 }; },
      save: async (x: any) => x,
    });

    await service.addParticipant(10, 1, ParticipationStatus.CONFIRMED);

    assert.ok(created !== null);
    assert.equal(created.game_id, 10);
    assert.equal(created.user_id, 1);
    assert.equal(created.participation_status, ParticipationStatus.CONFIRMED);
  });

  test('updates status when participant already exists', async () => {
    const existing = {
      id: 5,
      game_id: 10,
      user_id: 1,
      participation_status: ParticipationStatus.CONFIRMED,
      updated_at: new Date(),
    };
    let saved: any = null;
    const service = makeService({
      findOne: async () => existing,
      save: async (x: any) => { saved = x; return x; },
    });

    await service.addParticipant(10, 1, ParticipationStatus.MAYBE);

    assert.ok(saved !== null);
    assert.equal(saved.participation_status, ParticipationStatus.MAYBE);
    assert.equal(saved.id, 5); // same record, not new
  });

  test('handles duplicate DB error (23505) by retrying with update', async () => {
    let callCount = 0;
    const existing = {
      id: 5,
      game_id: 10,
      user_id: 1,
      participation_status: ParticipationStatus.CONFIRMED,
      updated_at: new Date(),
    };

    const participantRepo = {
      findOne: async () => {
        // First call: not found (triggers insert) → second call: found (retry)
        callCount++;
        return callCount === 1 ? null : existing;
      },
      create: (data: any) => ({ ...data, id: 1 }),
      save: async (x: any) => {
        if (callCount === 1) {
          const err: any = new Error('duplicate key value');
          err.code = '23505';
          throw err;
        }
        return x;
      },
    };

    const mockDb = { getRepository: () => participantRepo } as any;
    const service = new GameService(mockDb);

    // Should not throw
    await assert.doesNotReject(() => service.addParticipant(10, 1, ParticipationStatus.MAYBE));
  });

  test('re-throws non-duplicate DB errors', async () => {
    const service = makeService({
      findOne: async () => null,
      create: (data: any) => ({ ...data }),
      save: async () => { throw new Error('Connection lost'); },
    });

    await assert.rejects(
      () => service.addParticipant(10, 1, ParticipationStatus.CONFIRMED),
      /Connection lost/
    );
  });
});

// ---------------------------------------------------------------------------
// addGuest
// ---------------------------------------------------------------------------
describe('GameService.addGuest', () => {
  test('creates guest with combined first and last name', async () => {
    let created: any = null;
    const service = makeService({
      create: (data: any) => { created = data; return { ...data, id: 1 }; },
      save: async (x: any) => x,
    });

    await service.addGuest(10, 'John', 'Doe');

    assert.ok(created !== null);
    assert.equal(created.guest_name, 'John Doe');
    assert.equal(created.participation_status, ParticipationStatus.GUEST);
  });

  test('creates guest with only first name when last name omitted', async () => {
    let created: any = null;
    const service = makeService({
      create: (data: any) => { created = data; return { ...data, id: 1 }; },
      save: async (x: any) => x,
    });

    await service.addGuest(10, 'John');

    assert.equal(created.guest_name, 'John');
  });
});

// ---------------------------------------------------------------------------
// updateGuest — guard logic
// ---------------------------------------------------------------------------
describe('GameService.updateGuest', () => {
  test('throws when participant not found', async () => {
    const service = makeService({ findOne: async () => null });

    await assert.rejects(
      () => service.updateGuest(99, 10, 'John'),
      /Guest participant not found/
    );
  });

  test('throws when participant is not a GUEST', async () => {
    const nonGuest = {
      id: 1,
      game_id: 10,
      participation_status: ParticipationStatus.CONFIRMED,
    };
    const service = makeService({ findOne: async () => nonGuest });

    await assert.rejects(
      () => service.updateGuest(1, 10, 'John'),
      /Guest participant not found/
    );
  });
});

// ---------------------------------------------------------------------------
// removeGuest — guard logic
// ---------------------------------------------------------------------------
describe('GameService.removeGuest', () => {
  test('throws when participant not found', async () => {
    const service = makeService({ findOne: async () => null });

    await assert.rejects(
      () => service.removeGuest(99, 10),
      /Guest participant not found/
    );
  });

  test('throws when participant is not a GUEST', async () => {
    const nonGuest = {
      id: 1,
      game_id: 10,
      participation_status: ParticipationStatus.CONFIRMED,
    };
    const service = makeService({ findOne: async () => nonGuest });

    await assert.rejects(
      () => service.removeGuest(1, 10),
      /Guest participant not found/
    );
  });
});

// ---------------------------------------------------------------------------
// getGameGroupId
// ---------------------------------------------------------------------------
describe('GameService.getGameGroupId', () => {
  test('selects only id and group_id and returns the group id', async () => {
    let options: any;
    const service = makeService({
      findOne: async (o: any) => { options = o; return { id: 4, group_id: 9 }; },
    });

    assert.equal(await service.getGameGroupId(4), 9);
    assert.deepEqual(options.where, { id: 4 });
    assert.deepEqual(options.select, { id: true, group_id: true });
    assert.equal(options.relations, undefined);
  });

  test('returns null for an unknown game', async () => {
    const service = makeService({ findOne: async () => null });

    assert.equal(await service.getGameGroupId(404), null);
  });
});
