import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GameService } from '../../services/GameService';
import { GameParticipant, ParticipationStatus } from '../../models/GameParticipant';

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
// updateParticipantPositions
// ---------------------------------------------------------------------------
describe('GameService.updateParticipantPositions', () => {
  test('assigns ascending positions sorted by priority then join time', async () => {
    const t0 = new Date('2024-01-01T10:00:00');
    const t1 = new Date('2024-01-01T11:00:00');
    const t2 = new Date('2024-01-01T12:00:00');

    const p1 = Object.assign(new GameParticipant(), {
      id: 1, game_id: 1, participation_status: ParticipationStatus.MAYBE, joined_at: t0,
      getPriority() { return 2; },
    });
    const p2 = Object.assign(new GameParticipant(), {
      id: 2, game_id: 1, participation_status: ParticipationStatus.CONFIRMED, joined_at: t1,
      getPriority() { return 1; },
    });
    const p3 = Object.assign(new GameParticipant(), {
      id: 3, game_id: 1, participation_status: ParticipationStatus.GUEST, joined_at: t2,
      getPriority() { return 3; },
    });

    let savedParticipants: any[] = [];
    const service = makeService({
      find: async () => [p1, p2, p3],
      save: async (arr: any) => { savedParticipants = arr; return arr; },
    });

    await service.updateParticipantPositions(1);

    // p2 (CONFIRMED) → 1, p1 (MAYBE) → 2, p3 (GUEST) → 3
    const byId = Object.fromEntries(savedParticipants.map((p: any) => [p.id, p.position]));
    assert.equal(byId[2], 1); // CONFIRMED first
    assert.equal(byId[1], 2); // MAYBE second
    assert.equal(byId[3], 3); // GUEST third
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
