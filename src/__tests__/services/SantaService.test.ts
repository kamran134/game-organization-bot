import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { SantaService } from '../../services/SantaService';
import { SantaEvent, SantaStatus } from '../../models/SantaEvent';
import { SantaParticipant } from '../../models/SantaParticipant';
import { ConflictError } from '../../utils/errors';

type Row = Record<string, any>;

/** In-memory fake of the two repositories; the transaction manager hands out the same repos. */
function makeService(status: SantaStatus, participantRows: Row[]) {
  const event: Row = { id: 1, group_id: 1, title: 'NY', status, drawn_at: null };
  const participants = participantRows;
  const locks: string[] = [];

  const eventRepo = {
    findOne: async (opts: any) => {
      if (opts?.lock) locks.push(opts.lock.mode);
      return opts?.where?.id === event.id ? event : null;
    },
    save: async (e: Row) => Object.assign(event, e),
  };

  const matches = (p: Row, where: Row): boolean => Object.entries(where).every(([k, v]) => p[k] === v);
  const participantRepo = {
    find: async (opts: any) => participants.filter((p) => matches(p, opts?.where ?? {})),
    findOne: async (opts: any) => {
      const row = participants.find((p) => matches(p, opts?.where ?? {}));
      if (!row) return null;
      if (opts?.relations?.includes('receiver')) {
        const receiver = participants.find((p) => p.user_id === row.receiver_id);
        return { ...row, receiver: receiver?.user ?? null };
      }
      return row;
    },
    create: (data: Row) => ({ ...data }),
    save: async (x: Row | Row[]) => {
      for (const row of Array.isArray(x) ? x : [x]) {
        if (!participants.includes(row)) participants.push(row);
      }
      return x;
    },
    delete: async (id: number) => {
      const i = participants.findIndex((p) => p.id === id);
      if (i >= 0) participants.splice(i, 1);
    },
    update: async () => undefined,
  };

  const repos = new Map<unknown, unknown>([[SantaEvent, eventRepo], [SantaParticipant, participantRepo]]);
  const db = {
    getRepository: (entity: unknown) => repos.get(entity),
    dataSource: {
      transaction: async (cb: (manager: unknown) => Promise<unknown>) =>
        cb({ getRepository: (entity: unknown) => repos.get(entity) }),
    },
  };
  return { service: new SantaService(db as never), event, participants, locks };
}

function person(id: number, extra: Row = {}): Row {
  return {
    id: id * 10,
    event_id: 1,
    user_id: id,
    user: { id, telegram_id: 1000 + id, first_name: `U${id}` },
    wishlist: `wish${id}`,
    receiver_id: null,
    ...extra,
  };
}

describe('SantaService.join', () => {
  test('rejects joining after the draw', async () => {
    const { service } = makeService(SantaStatus.DRAWN, []);
    await assert.rejects(() => service.join(1, 5), ConflictError);
  });

  test('rejects a double join', async () => {
    const { service } = makeService(SantaStatus.REGISTRATION, [person(5)]);
    await assert.rejects(() => service.join(1, 5), ConflictError);
  });

  test('adds the participant under a shared lock', async () => {
    const { service, participants, locks } = makeService(SantaStatus.REGISTRATION, []);
    await service.join(1, 5, 'socks');
    assert.equal(participants.length, 1);
    assert.equal(participants[0].wishlist, 'socks');
    assert.deepEqual(locks, ['pessimistic_read']);
  });
});

describe('SantaService.leave', () => {
  test('rejects leaving when not joined', async () => {
    const { service } = makeService(SantaStatus.REGISTRATION, []);
    await assert.rejects(() => service.leave(1, 5), ConflictError);
  });
});

describe('SantaService.draw', () => {
  test('rejects fewer than 3 participants', async () => {
    const { service, event } = makeService(SantaStatus.REGISTRATION, [person(1), person(2)]);
    await assert.rejects(() => service.draw(1), ConflictError);
    assert.equal(event.status, SantaStatus.REGISTRATION);
  });

  test('rejects a second draw', async () => {
    const { service } = makeService(SantaStatus.DRAWN, [person(1), person(2), person(3)]);
    await assert.rejects(() => service.draw(1), ConflictError);
  });

  test('assigns every participant a recipient, sets the status and locks for update', async () => {
    const { service, event, participants, locks } = makeService(
      SantaStatus.REGISTRATION,
      [person(1), person(2), person(3), person(4)],
    );

    const result = await service.draw(1);

    assert.equal(event.status, SantaStatus.DRAWN);
    assert.ok(event.drawn_at instanceof Date);
    assert.deepEqual(locks, ['pessimistic_write']);
    assert.equal(result.length, 4);

    const receivers = participants.map((p) => p.receiver_id);
    assert.ok(receivers.every((r) => r !== null));
    assert.equal(new Set(receivers).size, 4);
    for (const p of participants) assert.notEqual(p.receiver_id, p.user_id);

    for (const { giver, receiver, receiverWishlist } of result) {
      assert.notEqual(giver.id, receiver.id);
      assert.equal(receiverWishlist, `wish${receiver.id}`);
    }
  });
});

describe('SantaService.getMyAssignment', () => {
  test('returns null before the draw', async () => {
    const { service } = makeService(SantaStatus.REGISTRATION, [person(1, { receiver_id: 2 }), person(2)]);
    assert.equal(await service.getMyAssignment(1, 1), null);
  });

  test('returns only the callers own recipient after the draw', async () => {
    const { service } = makeService(SantaStatus.DRAWN, [
      person(1, { receiver_id: 2 }), person(2, { receiver_id: 3 }), person(3, { receiver_id: 1 }),
    ]);

    const mine = await service.getMyAssignment(1, 1);
    assert.equal(mine?.receiver.id, 2);
    assert.equal(mine?.wishlist, 'wish2');
    assert.deepEqual(Object.keys(mine!).sort(), ['receiver', 'wishlist']);
  });

  test('returns null for a non-participant', async () => {
    const { service } = makeService(SantaStatus.DRAWN, [person(1, { receiver_id: 2 }), person(2, { receiver_id: 1 })]);
    assert.equal(await service.getMyAssignment(1, 99), null);
  });
});

describe('SantaService.updateWishlist', () => {
  const drawnRows = (): Row[] => [
    person(1, { receiver_id: 2 }), person(2, { receiver_id: 3 }), person(3, { receiver_id: 1 }),
  ];

  test('returns the santa after the draw', async () => {
    const { service, participants } = makeService(SantaStatus.DRAWN, drawnRows());
    const { santa } = await service.updateWishlist(1, 2, 'new');
    assert.equal(santa?.id, 1);
    assert.equal(participants[1].wishlist, 'new');
  });

  test('returns no santa during registration', async () => {
    const { service } = makeService(SantaStatus.REGISTRATION, [person(1), person(2)]);
    const { santa } = await service.updateWishlist(1, 2, 'new');
    assert.equal(santa, null);
  });

  test('rejects when finished or not joined', async () => {
    await assert.rejects(() => makeService(SantaStatus.FINISHED, drawnRows()).service.updateWishlist(1, 2, 'x'), ConflictError);
    await assert.rejects(() => makeService(SantaStatus.REGISTRATION, [person(1)]).service.updateWishlist(1, 9, 'x'), ConflictError);
  });
});
