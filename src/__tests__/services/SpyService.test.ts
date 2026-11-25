import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { FindOperator } from 'typeorm';
import { SpyService, SpyEventInput } from '../../services/SpyService';
import { SpyEvent, SpyStatus } from '../../models/SpyEvent';
import { SpyParticipant } from '../../models/SpyParticipant';
import { SpyRound, SpyRoundStatus } from '../../models/SpyRound';
import { SpyRoundPlayer } from '../../models/SpyRoundPlayer';
import { SpyVote } from '../../models/SpyVote';
import { SpyRole } from '../../models/SpyRole';
import { SpyLocation } from '../../models/SpyLocation';
import { ConflictError, ValidationError } from '../../utils/errors';

type Row = Record<string, any>;

/** Equality plus the FindOperators the service uses (In, IsNull, Not). */
function matchesValue(actual: unknown, expected: unknown): boolean {
  if (expected instanceof FindOperator) {
    const op = expected as FindOperator<any>;
    if (op.type === 'in') return (op.value as unknown[]).includes(actual);
    if (op.type === 'isNull') return actual === null || actual === undefined;
    if (op.type === 'not') return !matchesValue(actual, op.value);
    throw new Error(`Unsupported operator ${op.type}`);
  }
  return actual === expected;
}

function sorted(rows: Row[], order?: Record<string, 'ASC' | 'DESC'>): Row[] {
  const [key, dir] = Object.entries(order ?? {})[0] ?? [];
  if (!key) return rows;
  return [...rows].sort((a, b) => (dir === 'DESC' ? -1 : 1) * (a[key] - b[key]));
}

/** Generic in-memory repository: ids are assigned on save, arrays are accepted. */
function memRepo(rows: Row[], firstId = 5000) {
  let nextId = firstId;
  const saveOne = (row: Row): Row => {
    if (row['id'] === undefined) { row['id'] = nextId++; rows.push(row); }
    else if (!rows.includes(row)) rows.push(row);
    return row;
  };
  return {
    find: async (opts: any) => sorted(rows.filter((r) => matches(r, opts?.where)), opts?.order),
    findOne: async (opts: any) => sorted(rows.filter((r) => matches(r, opts?.where)), opts?.order)[0] ?? null,
    count: async (opts: any) => rows.filter((r) => matches(r, opts?.where)).length,
    create: (data: Row) => ({ ...data }),
    save: async (data: Row | Row[]) => (Array.isArray(data) ? data.map(saveOne) : saveOne(data)),
    update: async (where: Row, patch: Row) => {
      for (const r of rows.filter((row) => matches(row, where))) Object.assign(r, patch);
    },
  };
}

function matches(row: Row, where: Row | Row[] | undefined): boolean {
  if (Array.isArray(where)) return where.some((w) => matches(row, w));
  return Object.entries(where ?? {}).every(([k, v]) => matchesValue(row[k], v));
}

/** In-memory fake of the repositories; the transaction manager hands out the same repos. */
function makeService(status: SpyStatus, participantRows: Row[] = [], eventOverrides: Row = {}, roundRows: Row[] = [], locationRows: Row[] = [], roundPlayerRows: Row[] = [], voteRows: Row[] = []) {
  const event: Row = {
    id: 1, group_id: 1, title: 'Evening', status, host_id: 100, max_players: 10, spy_count: null,
    double_agent: false, mr_white: false, packs: ['base'], turn_seconds: null, hint_after_cycles: null,
    round: 0, ...eventOverrides,
  };
  const participants = participantRows;
  const rounds = roundRows;
  const locations = locationRows;
  const locks: string[] = [];
  let nextLocationId = 1000;

  const eventRepo = {
    findOne: async (opts: any) => {
      if (opts?.lock) locks.push(opts.lock.mode);
      return opts?.where?.id === event.id ? event : null;
    },
    find: async (opts: any) => [event].filter((e) => matches(e, opts?.where)),
    create: (data: Row) => ({ id: 1, ...data }),
    save: async (e: Row) => Object.assign(event, e),
    update: async (_id: number, patch: Row) => { Object.assign(event, patch); },
    delete: async () => undefined,
  };
  const participantRepo = {
    find: async (opts: any) => participants.filter((p) => matches(p, opts?.where)),
    findOne: async (opts: any) => participants.find((p) => matches(p, opts?.where)) ?? null,
    count: async (opts: any) => participants.filter((p) => matches(p, opts?.where)).length,
    create: (data: Row) => ({ is_active: true, ...data }),
    save: async (row: Row) => { if (!participants.includes(row)) participants.push(row); return row; },
    delete: async (id: number) => {
      const i = participants.findIndex((p) => p.id === id);
      if (i >= 0) participants.splice(i, 1);
    },
  };
  const roundRepo = memRepo(rounds, 900);
  const roundPlayerRepo = memRepo(roundPlayerRows, 7000);
  const voteRepo = memRepo(voteRows, 8000);
  const locationRepo = {
    find: async (opts: any) => locations.filter((l) => matches(l, opts?.where)),
    findOne: async (opts: any) => locations.find((l) => matches(l, opts?.where)) ?? null,
    create: (data: Row) => ({ ...data }),
    save: async (row: Row) => {
      if (row['id'] === undefined) { row['id'] = nextLocationId++; locations.push(row); }
      return row;
    },
    delete: async (id: number) => {
      const i = locations.findIndex((l) => l.id === id);
      if (i >= 0) locations.splice(i, 1);
    },
  };

  const repos = new Map<unknown, unknown>([
    [SpyEvent, eventRepo], [SpyParticipant, participantRepo], [SpyRound, roundRepo], [SpyLocation, locationRepo],
    [SpyRoundPlayer, roundPlayerRepo], [SpyVote, voteRepo],
  ]);
  const db = {
    getRepository: (entity: unknown) => repos.get(entity),
    dataSource: {
      transaction: async (cb: (manager: unknown) => Promise<unknown>) =>
        cb({ getRepository: (entity: unknown) => repos.get(entity) }),
    },
  };
  return { service: new SpyService(db as never), event, participants, rounds, locations, locks, roundPlayers: roundPlayerRows, votes: voteRows };
}

function player(id: number, extra: Row = {}): Row {
  return { id: id * 10, event_id: 1, user_id: id, is_active: true, ...extra };
}
const players = (n: number): Row[] => Array.from({ length: n }, (_, i) => player(i + 1));
const round = (status: SpyRoundStatus): Row => ({ id: 1, event_id: 1, number: 1, status });

const baseInput: SpyEventInput = { title: 'Friday' };

describe('SpyService input validation', () => {
  const bad: Array<[string, Partial<SpyEventInput>]> = [
    ['empty title', { title: '   ' }],
    ['long title', { title: 'x'.repeat(101) }],
    ['long place', { place: 'x'.repeat(201) }],
    ['max_players below the minimum', { max_players: 2 }],
    ['max_players above the maximum', { max_players: 21 }],
    ['fractional max_players', { max_players: 5.5 }],
    ['spy_count zero', { spy_count: 0 }],
    ['spy_count not a strict minority', { max_players: 6, spy_count: 3 }],
    ['empty packs', { packs: [] }],
    ['unknown pack', { packs: ['base', 'nope'] }],
    ['duplicate packs', { packs: ['base', 'base'] }],
    ['turn_seconds too small', { turn_seconds: 14 }],
    ['turn_seconds too large', { turn_seconds: 301 }],
    ['hint_after_cycles zero', { hint_after_cycles: 0 }],
    ['hint_after_cycles too large', { hint_after_cycles: 11 }],
  ];

  for (const [name, patch] of bad) {
    test(`createEvent rejects ${name}`, async () => {
      const { service } = makeService(SpyStatus.REGISTRATION);
      await assert.rejects(() => service.createEvent(1, 100, { ...baseInput, ...patch }), ValidationError);
    });
  }

  test('createEvent trims the title, applies defaults and returns a registration event', async () => {
    const { service } = makeService(SpyStatus.REGISTRATION);
    const created = await service.createEvent(1, 100, { title: '  Friday  ', place: '  ' });
    assert.equal(created.title, 'Friday');
    assert.equal(created.place, null);
    assert.equal(created.status, SpyStatus.REGISTRATION);
    assert.equal(created.host_id, 100);
    assert.equal(created.max_players, 10);
    assert.deepEqual(created.packs, ['base']);
    assert.equal(created.spy_count, null);
  });

  test('createEvent accepts null for the nullable settings', async () => {
    const { service } = makeService(SpyStatus.REGISTRATION);
    const created = await service.createEvent(1, 100, {
      ...baseInput, max_players: 7, spy_count: 3, turn_seconds: 15, hint_after_cycles: 10, packs: ['base', 'custom'],
    });
    assert.equal(created.spy_count, 3);
    assert.equal(created.turn_seconds, 15);
  });
});

describe('SpyService.updateSettings', () => {
  test('applies a partial patch in registration and in closed', async () => {
    for (const status of [SpyStatus.REGISTRATION, SpyStatus.CLOSED]) {
      const { service, event } = makeService(status);
      await service.updateSettings(1, { turn_seconds: 60, title: ' New ' });
      assert.equal(event['turn_seconds'], 60, status);
      assert.equal(event['title'], 'New', status);
      assert.equal(event['max_players'], 10, status);
    }
  });

  test('null clears a nullable setting', async () => {
    const { service, event } = makeService(SpyStatus.REGISTRATION, [], { turn_seconds: 60 });
    await service.updateSettings(1, { turn_seconds: null });
    assert.equal(event['turn_seconds'], null);
  });

  test('is refused once a round runs or the evening is finished', async () => {
    for (const status of [SpyStatus.IN_PROGRESS, SpyStatus.FINISHED]) {
      const { service } = makeService(status);
      await assert.rejects(() => service.updateSettings(1, { turn_seconds: 60 }), ConflictError, status);
    }
  });

  test('validates the patch', async () => {
    const { service } = makeService(SpyStatus.REGISTRATION);
    await assert.rejects(() => service.updateSettings(1, { max_players: 99 }), ValidationError);
    await assert.rejects(() => service.updateSettings(1, { packs: [] }), ValidationError);
  });

  test('checks the stored spy_count against a lowered player limit', async () => {
    const { service } = makeService(SpyStatus.REGISTRATION, [], { spy_count: 3, max_players: 10 });
    await assert.rejects(() => service.updateSettings(1, { max_players: 6 }), ValidationError);
  });

  test('refuses a limit below the number of joined players', async () => {
    const { service } = makeService(SpyStatus.REGISTRATION, players(6));
    await assert.rejects(() => service.updateSettings(1, { max_players: 5 }), ConflictError);
  });
});

describe('SpyService.join', () => {
  test('adds the participant under an exclusive lock', async () => {
    const { service, participants, locks } = makeService(SpyStatus.REGISTRATION);
    await service.join(1, 5);
    assert.equal(participants.length, 1);
    assert.deepEqual(locks, ['pessimistic_write']);
  });

  test('the host may play', async () => {
    const { service, participants } = makeService(SpyStatus.REGISTRATION);
    await service.join(1, 100);
    assert.deepEqual(participants.map((p) => p.user_id), [100]);
  });

  test('rejects joining outside registration', async () => {
    for (const status of [SpyStatus.CLOSED, SpyStatus.IN_PROGRESS, SpyStatus.FINISHED]) {
      const { service } = makeService(status);
      await assert.rejects(() => service.join(1, 5), ConflictError, status);
    }
  });

  test('rejects a double join', async () => {
    const { service } = makeService(SpyStatus.REGISTRATION, [player(5)]);
    await assert.rejects(() => service.join(1, 5), /Already joined/);
  });

  test('rejects joining a full event, and a freed spot can be taken again', async () => {
    const { service, participants } = makeService(SpyStatus.REGISTRATION, players(4), { max_players: 4 });
    await assert.rejects(() => service.join(1, 50), /Event is full/);

    await service.leave(1, 1);
    await service.join(1, 50);
    assert.equal(participants.length, 4);
  });

  test('an unknown event is a conflict', async () => {
    const { service } = makeService(SpyStatus.REGISTRATION);
    await assert.rejects(() => service.join(99, 5), /Event not found/);
  });
});

describe('SpyService.leave / removeParticipant', () => {
  test('leave works in registration only', async () => {
    const reg = makeService(SpyStatus.REGISTRATION, [player(5)]);
    await reg.service.leave(1, 5);
    assert.equal(reg.participants.length, 0);

    const closed = makeService(SpyStatus.CLOSED, [player(5)]);
    await assert.rejects(() => closed.service.leave(1, 5), ConflictError);
  });

  test('leave of a stranger is a conflict', async () => {
    const { service } = makeService(SpyStatus.REGISTRATION);
    await assert.rejects(() => service.leave(1, 5), /Not joined/);
  });

  test('removeParticipant also works after registration was closed, not once a round runs', async () => {
    const closed = makeService(SpyStatus.CLOSED, [player(5)]);
    await closed.service.removeParticipant(1, 5);
    assert.equal(closed.participants.length, 0);

    const running = makeService(SpyStatus.IN_PROGRESS, [player(5)]);
    await assert.rejects(() => running.service.removeParticipant(1, 5), ConflictError);
  });
});

describe('SpyService.closeRegistration', () => {
  test('needs at least the minimum of active players', async () => {
    const { service, event } = makeService(SpyStatus.REGISTRATION, players(2));
    await assert.rejects(() => service.closeRegistration(1), /Not enough players/);
    assert.equal(event['status'], SpyStatus.REGISTRATION);
  });

  test('inactive participants do not count', async () => {
    const rows = [player(1), player(2), player(3, { is_active: false })];
    const { service } = makeService(SpyStatus.REGISTRATION, rows);
    await assert.rejects(() => service.closeRegistration(1), /Not enough players/);
  });

  test('closes registration with enough players', async () => {
    const { service, event } = makeService(SpyStatus.REGISTRATION, players(3));
    await service.closeRegistration(1);
    assert.equal(event['status'], SpyStatus.CLOSED);
  });

  test('works from registration only', async () => {
    const { service } = makeService(SpyStatus.CLOSED, players(3));
    await assert.rejects(() => service.closeRegistration(1), ConflictError);
  });
});

describe('SpyService.reopen / finish', () => {
  test('reopen returns to registration from closed and keeps the round counter', async () => {
    const { service, event } = makeService(SpyStatus.CLOSED, players(3), { round: 2 }, [round(SpyRoundStatus.FINISHED)]);
    await service.reopen(1);
    assert.equal(event['status'], SpyStatus.REGISTRATION);
    assert.equal(event['round'], 2);
  });

  test('reopen works from in_progress once every round is finished', async () => {
    const { service, event } = makeService(SpyStatus.IN_PROGRESS, players(3), { round: 1 }, [round(SpyRoundStatus.FINISHED)]);
    await service.reopen(1);
    assert.equal(event['status'], SpyStatus.REGISTRATION);
  });

  test('reopen is refused while a round is unfinished', async () => {
    for (const status of [SpyRoundStatus.IN_PROGRESS, SpyRoundStatus.VOTING]) {
      const { service, event } = makeService(SpyStatus.IN_PROGRESS, players(3), {}, [round(status)]);
      await assert.rejects(() => service.reopen(1), /Round is not finished/, status);
      assert.equal(event['status'], SpyStatus.IN_PROGRESS);
    }
  });

  test('reopen is refused from registration and finished', async () => {
    for (const status of [SpyStatus.REGISTRATION, SpyStatus.FINISHED]) {
      const { service } = makeService(status);
      await assert.rejects(() => service.reopen(1), ConflictError, status);
    }
  });

  test('finish ends the evening and aborts a round still running', async () => {
    const { service, event, rounds } = makeService(SpyStatus.IN_PROGRESS, players(3), {}, [round(SpyRoundStatus.VOTING)]);
    await service.finish(1);
    assert.equal(event['status'], SpyStatus.FINISHED);
    assert.equal(rounds[0]!['status'], SpyRoundStatus.FINISHED);
    assert.equal(rounds[0]!['outcome'], 'aborted');
    assert.equal(rounds[0]!['outcome_reason'], 'manual');
  });

  test('finish is refused for an already finished evening', async () => {
    const { service } = makeService(SpyStatus.FINISHED);
    await assert.rejects(() => service.finish(1), ConflictError);
  });
});

describe('SpyService locations', () => {
  const loc = (id: number, name: string, pack: string, group_id: number | null, is_active = true): Row =>
    ({ id, name, pack, group_id, is_active });
  const seed = (): Row[] => [
    loc(1, 'Hospital', 'base', null),
    loc(2, 'Old Town', 'city', null),
    loc(3, 'Cinema', 'movies', null),
    loc(4, 'Retired', 'base', null, false),
    loc(5, 'Our Cafe', 'custom', 1),
    loc(6, 'Other Cafe', 'custom', 2),
    loc(7, 'Disabled', 'custom', 1, false),
  ];
  const names = (rows: Row[]) => rows.map((l) => l.name).sort();

  test('selects global locations of the chosen packs only, and only active ones', async () => {
    const { service } = makeService(SpyStatus.REGISTRATION, [], {}, [], seed());
    assert.deepEqual(names(await service.listLocations(1, ['base'])), ['Hospital']);
    assert.deepEqual(names(await service.listLocations(1, ['base', 'city'])), ['Hospital', 'Old Town']);
  });

  test('group locations appear only with the custom pack, and only the own group', async () => {
    const { service } = makeService(SpyStatus.REGISTRATION, [], {}, [], seed());
    assert.deepEqual(names(await service.listLocations(1, ['custom'])), ['Our Cafe']);
    assert.deepEqual(names(await service.listLocations(1, ['base', 'custom'])), ['Hospital', 'Our Cafe']);
    assert.deepEqual(names(await service.listLocations(2, ['custom'])), ['Other Cafe']);
  });

  test('without packs every pack is included', async () => {
    const { service } = makeService(SpyStatus.REGISTRATION, [], {}, [], seed());
    assert.deepEqual(names(await service.listLocations(1)), ['Cinema', 'Hospital', 'Old Town', 'Our Cafe']);
  });

  test('an empty pack list selects nothing', async () => {
    const { service } = makeService(SpyStatus.REGISTRATION, [], {}, [], seed());
    assert.deepEqual(await service.listLocations(1, []), []);
  });

  test('addGroupLocation trims, stores into the custom pack and binds to the group', async () => {
    const { service, locations } = makeService(SpyStatus.REGISTRATION, [], {}, [], seed());
    const added = await service.addGroupLocation(1, '  Rooftop  ');
    assert.equal(added.name, 'Rooftop');
    assert.equal(added.pack, 'custom');
    assert.equal(added.group_id, 1);
    assert.ok(locations.includes(added as Row));
  });

  test('addGroupLocation rejects a case-insensitive duplicate within the group, but not in another group', async () => {
    const { service } = makeService(SpyStatus.REGISTRATION, [], {}, [], seed());
    await assert.rejects(() => service.addGroupLocation(1, ' our CAFE '), ConflictError);
    await assert.rejects(() => service.addGroupLocation(1, 'disabled'), ConflictError);
    await service.addGroupLocation(2, 'Our Cafe');
  });

  test('addGroupLocation rejects an empty or too long name', async () => {
    const { service } = makeService(SpyStatus.REGISTRATION, [], {}, [], seed());
    await assert.rejects(() => service.addGroupLocation(1, '   '), ValidationError);
    await assert.rejects(() => service.addGroupLocation(1, 'x'.repeat(101)), ValidationError);
  });

  test('rename and delete work on own locations', async () => {
    const { service, locations } = makeService(SpyStatus.REGISTRATION, [], {}, [], seed());
    const renamed = await service.renameGroupLocation(1, 5, ' Fancy Cafe ');
    assert.equal(renamed.name, 'Fancy Cafe');
    // renaming to its own name (different case) is not a duplicate
    await service.renameGroupLocation(1, 5, 'FANCY CAFE');

    await service.deleteGroupLocation(1, 5);
    assert.equal(locations.some((l) => l.id === 5), false);
  });

  test('rename rejects a duplicate of another own location', async () => {
    const rows = [...seed(), loc(8, 'Roof', 'custom', 1)];
    const { service } = makeService(SpyStatus.REGISTRATION, [], {}, [], rows);
    await assert.rejects(() => service.renameGroupLocation(1, 8, 'our cafe'), ConflictError);
  });

  test('global locations are immutable', async () => {
    const { service, locations } = makeService(SpyStatus.REGISTRATION, [], {}, [], seed());
    await assert.rejects(() => service.renameGroupLocation(1, 1, 'Clinic'), /Global locations cannot be changed/);
    await assert.rejects(() => service.deleteGroupLocation(1, 1), /Global locations cannot be changed/);
    assert.equal(locations.find((l) => l.id === 1)!['name'], 'Hospital');
  });

  test('another group\'s location and an unknown id cannot be touched', async () => {
    const { service, locations } = makeService(SpyStatus.REGISTRATION, [], {}, [], seed());
    await assert.rejects(() => service.renameGroupLocation(1, 6, 'Mine now'), /Location not found/);
    await assert.rejects(() => service.deleteGroupLocation(1, 6), /Location not found/);
    await assert.rejects(() => service.deleteGroupLocation(1, 999), /Location not found/);
    assert.equal(locations.some((l) => l.id === 6), true);
  });
});

// ---- Rounds ----

const GLOBAL_LOCATION: Row = { id: 1, name: 'Школа', pack: 'base', group_id: null, is_active: true };

function spyRound(extra: Row = {}): Row {
  return {
    id: 1, event_id: 1, number: 1, status: SpyRoundStatus.IN_PROGRESS, location_name: 'Школа', location_pack: 'base',
    turn_order: [1, 2, 3, 4, 5], turn_index: 0, cycle: 1, turn_started_at: new Date('2026-01-01T10:00:00Z'), ...extra,
  };
}

function roundPlayers(roles: Record<number, SpyRole>, roundId = 1, eliminated: number[] = []): Row[] {
  return Object.entries(roles).map(([id, role]) => ({
    id: roundId * 100 + Number(id), round_id: roundId, user_id: Number(id), role, is_eliminated: eliminated.includes(Number(id)),
  }));
}

const FIVE: Record<number, SpyRole> = {
  1: SpyRole.SPY, 2: SpyRole.CIVILIAN, 3: SpyRole.CIVILIAN, 4: SpyRole.CIVILIAN, 5: SpyRole.CIVILIAN,
};
const FOUR: Record<number, SpyRole> = { 1: SpyRole.SPY, 2: SpyRole.CIVILIAN, 3: SpyRole.CIVILIAN, 4: SpyRole.CIVILIAN };

/** An evening with one running round and the given roles dealt. */
function playing(roles: Record<number, SpyRole> = FIVE, roundExtra: Row = {}, eventExtra: Row = {}, eliminated: number[] = []) {
  const ids = Object.keys(roles).map(Number);
  return makeService(
    SpyStatus.IN_PROGRESS,
    ids.map((id) => player(id)),
    { round: 1, ...eventExtra },
    [spyRound({ turn_order: ids, ...roundExtra })],
    [GLOBAL_LOCATION],
    roundPlayers(roles, 1, eliminated),
  );
}

describe('SpyService.startRound', () => {
  test('deals roles to the active players and opens the round', async () => {
    const rows = [...players(5), player(6, { is_active: false })];
    const { service, event, rounds, roundPlayers: dealt } = makeService(SpyStatus.CLOSED, rows, {}, [], [GLOBAL_LOCATION]);

    const result = await service.startRound(1);

    assert.equal(result.round.number, 1);
    assert.equal(rounds.length, 1);
    assert.equal(rounds[0]!['location_name'], 'Школа');
    assert.equal(rounds[0]!['location_pack'], 'base');
    assert.equal(rounds[0]!['turn_index'], 0);
    assert.equal(rounds[0]!['cycle'], 1);
    assert.ok(rounds[0]!['turn_started_at'] instanceof Date);
    assert.deepEqual([...rounds[0]!['turn_order']].sort(), [1, 2, 3, 4, 5]);
    assert.equal(dealt.length, 5);
    assert.equal(dealt.filter((p) => p['role'] === SpyRole.SPY).length, 1);
    assert.equal(event['round'], 1);
    assert.equal(event['status'], SpyStatus.IN_PROGRESS);
    assert.equal(result.players.length, 5);
  });

  test('numbers the next round after the previous one finished', async () => {
    const { service, rounds } = makeService(
      SpyStatus.IN_PROGRESS, players(4), { round: 1 }, [spyRound({ status: SpyRoundStatus.FINISHED })], [GLOBAL_LOCATION],
    );
    const { round: next } = await service.startRound(1);
    assert.equal(next.number, 2);
    assert.equal(rounds.length, 2);
  });

  test('refuses when there are fewer than the minimum of active players', async () => {
    const { service, rounds } = makeService(SpyStatus.CLOSED, [...players(2), player(3, { is_active: false })], {}, [], [GLOBAL_LOCATION]);
    await assert.rejects(() => service.startRound(1), /Not enough players/);
    assert.equal(rounds.length, 0);
  });

  test('refuses when no location matches the packs', async () => {
    const { service } = makeService(SpyStatus.CLOSED, players(4), { packs: ['city'] }, [], [GLOBAL_LOCATION]);
    await assert.rejects(() => service.startRound(1), /No locations/);
  });

  test('the custom pack plays the group own locations', async () => {
    const own: Row = { id: 2, name: 'Наш офис', pack: 'custom', group_id: 1, is_active: true };
    const foreign: Row = { id: 3, name: 'Чужой офис', pack: 'custom', group_id: 2, is_active: true };
    const { service, rounds } = makeService(SpyStatus.CLOSED, players(4), { packs: ['custom'] }, [], [GLOBAL_LOCATION, own, foreign]);
    await service.startRound(1);
    assert.equal(rounds[0]!['location_name'], 'Наш офис');
  });

  test('a second round cannot start while the first is unfinished', async () => {
    for (const status of [SpyRoundStatus.IN_PROGRESS, SpyRoundStatus.VOTING]) {
      const { service, rounds } = makeService(SpyStatus.IN_PROGRESS, players(4), { round: 1 }, [spyRound({ status })], [GLOBAL_LOCATION]);
      await assert.rejects(() => service.startRound(1), /Round is not finished/, status);
      assert.equal(rounds.length, 1);
    }
  });

  test('refuses a finished evening', async () => {
    const { service } = makeService(SpyStatus.FINISHED, players(4), {}, [], [GLOBAL_LOCATION]);
    await assert.rejects(() => service.startRound(1), ConflictError);
  });

  test('a configured spy count larger than the table allows is clamped', async () => {
    const { service, roundPlayers: dealt } = makeService(SpyStatus.CLOSED, players(3), { spy_count: 5 }, [], [GLOBAL_LOCATION]);
    await service.startRound(1);
    assert.equal(dealt.filter((p) => p['role'] === SpyRole.SPY).length, 1);
  });
});

describe('SpyService.getMyCard', () => {
  test('a civilian sees the location', async () => {
    const { service } = playing();
    const card = await service.getMyCard(1, 2);
    assert.equal(card!.role, SpyRole.CIVILIAN);
    assert.equal(card!.location, 'Школа');
    assert.equal(card!.round, 1);
  });

  test('a double agent sees the location', async () => {
    const { service } = playing({ ...FIVE, 5: SpyRole.DOUBLE_AGENT });
    assert.equal((await service.getMyCard(1, 5))!.location, 'Школа');
  });

  test('the location is never given to a spy or to Mr. White', async () => {
    const { service } = playing({ ...FIVE, 5: SpyRole.MR_WHITE }, {}, { hint_after_cycles: 1 });
    for (const userId of [1, 5]) {
      const card = await service.getMyCard(1, userId);
      assert.equal(card!.location, null);
      assert.ok(!JSON.stringify(card).includes('Школа'), `user ${userId}`);
    }
    assert.equal((await service.getMyCard(1, 5))!.role, SpyRole.MR_WHITE);
  });

  test('a player outside the round, and an evening without one, get null', async () => {
    const { service } = playing();
    assert.equal(await service.getMyCard(1, 99), null);
    const empty = makeService(SpyStatus.CLOSED, players(3));
    assert.equal(await empty.service.getMyCard(1, 1), null);
  });

  test('the spy gets the pack as a hint once enough cycles have passed', async () => {
    const early = playing(FIVE, { cycle: 2 }, { hint_after_cycles: 2 });
    assert.equal((await early.service.getMyCard(1, 1))!.hint, null);

    const late = playing(FIVE, { cycle: 3 }, { hint_after_cycles: 2 });
    assert.equal((await late.service.getMyCard(1, 1))!.hint, 'Классика');
    assert.equal((await late.service.getMyCard(1, 2))!.hint, null);

    const never = playing(FIVE, { cycle: 9 }, { hint_after_cycles: null });
    assert.equal((await never.service.getMyCard(1, 1))!.hint, null);
  });

  test('reports whose turn it is and the deadline', async () => {
    const { service } = playing(FIVE, { turn_index: 1 }, { turn_seconds: 60 });
    const mine = await service.getMyCard(1, 2);
    assert.equal(mine!.currentUserId, 2);
    assert.equal(mine!.isMyTurn, true);
    assert.equal(mine!.deadline!.toISOString(), '2026-01-01T10:01:00.000Z');
    assert.equal((await service.getMyCard(1, 3))!.isMyTurn, false);
  });

  test('no turn and no deadline while voting', async () => {
    const { service } = playing(FIVE, { status: SpyRoundStatus.VOTING }, { turn_seconds: 60 });
    const card = await service.getMyCard(1, 1);
    assert.equal(card!.currentUserId, null);
    assert.equal(card!.deadline, null);
  });
});

describe('SpyService.nextTurn', () => {
  test('the current player passes the turn', async () => {
    const { service, rounds } = playing();
    const state = await service.nextTurn(1, 1);
    assert.equal(state.previousUserId, 1);
    assert.equal(state.currentUserId, 2);
    assert.equal(rounds[0]!['turn_index'], 1);
    assert.ok((rounds[0]!['turn_started_at'] as Date).getTime() > new Date('2026-01-02').getTime());
  });

  test('someone else cannot, unless forced', async () => {
    const { service, rounds } = playing();
    await assert.rejects(() => service.nextTurn(1, 3), /Not your turn/);
    assert.equal(rounds[0]!['turn_index'], 0);

    const state = await service.nextTurn(1, 3, { force: true });
    assert.equal(state.currentUserId, 2);
  });

  test('wraps to the next cycle and skips eliminated players', async () => {
    const { service, rounds } = playing(FIVE, { turn_index: 4 }, {}, [1]);
    const state = await service.nextTurn(1, 5);
    assert.equal(state.currentUserId, 2);
    assert.equal(state.cycle, 2);
    assert.equal(rounds[0]!['cycle'], 2);
  });

  test('is refused while voting or after the round ended', async () => {
    for (const status of [SpyRoundStatus.VOTING, SpyRoundStatus.FINISHED]) {
      const { service } = playing(FIVE, { status });
      await assert.rejects(() => service.nextTurn(1, 1, { force: true }), ConflictError, status);
    }
  });
});

describe('SpyService voting', () => {
  test('openVoting moves the round to voting, once', async () => {
    const { service, rounds } = playing();
    await service.openVoting(1);
    assert.equal(rounds[0]!['status'], SpyRoundStatus.VOTING);
    await assert.rejects(() => service.openVoting(1), ConflictError);
  });

  test('votes are accepted only while voting', async () => {
    const { service } = playing();
    await assert.rejects(() => service.castVote(1, 2, 1), ConflictError);
  });

  test('rejects a vote for oneself, by or for someone who is out', async () => {
    const { service } = playing(FIVE, { status: SpyRoundStatus.VOTING }, {}, [5]);
    await assert.rejects(() => service.castVote(1, 2, 2), ValidationError);
    await assert.rejects(() => service.castVote(1, 2, 5), ValidationError);
    await assert.rejects(() => service.castVote(1, 5, 1), ConflictError);
    await assert.rejects(() => service.castVote(1, 99, 1), ConflictError);
  });

  test('waits for everyone, and a re-vote replaces the earlier ballot', async () => {
    const { service, votes } = playing(FOUR, { status: SpyRoundStatus.VOTING });
    const first = await service.castVote(1, 1, 2);
    assert.equal(first.state, 'pending');
    await service.castVote(1, 1, 3);
    assert.equal(votes.length, 1);
    assert.equal(votes[0]!['target_id'], 3);
  });

  test('exposing the spy wins the round for the town and reveals the roles', async () => {
    const { service, rounds, votes } = playing(FOUR, { status: SpyRoundStatus.VOTING });
    await service.castVote(1, 2, 1);
    await service.castVote(1, 3, 1);
    await service.castVote(1, 1, 2);
    const done = await service.castVote(1, 4, 1);

    assert.equal(done.state, 'resolved');
    if (done.state !== 'resolved') return;
    assert.deepEqual(done.resolution, { outcome: 'town', reason: 'vote_hit', accusedId: 1 });
    assert.equal(done.players.length, 4);
    assert.equal(rounds[0]!['status'], SpyRoundStatus.FINISHED);
    assert.equal(rounds[0]!['outcome'], 'town');
    assert.equal(rounds[0]!['outcome_reason'], 'vote_hit');
    assert.ok(rounds[0]!['finished_at'] instanceof Date);
    assert.equal(votes.length, 4);
  });

  test('accusing a civilian wins the round for the spies', async () => {
    const { service, rounds } = playing(FOUR, { status: SpyRoundStatus.VOTING });
    await service.castVote(1, 1, 2);
    await service.castVote(1, 3, 2);
    await service.castVote(1, 4, 2);
    const done = await service.castVote(1, 2, 3);
    assert.equal(done.state, 'resolved');
    assert.equal(rounds[0]!['outcome'], 'spies');
    assert.equal(rounds[0]!['outcome_reason'], 'vote_miss');
  });

  test('a tie opens a second ballot restricted to the leaders', async () => {
    const { service, rounds, votes } = playing(FOUR, { status: SpyRoundStatus.VOTING });
    await service.castVote(1, 1, 2);
    await service.castVote(1, 2, 1);
    await service.castVote(1, 3, 2);
    const tie = await service.castVote(1, 4, 1);

    assert.equal(tie.state, 'tie');
    if (tie.state !== 'tie') return;
    assert.deepEqual(tie.leaders, [1, 2]);
    assert.equal(tie.nextBallot, 2);
    assert.equal(rounds[0]!['status'], SpyRoundStatus.VOTING);

    // Only the leaders are valid targets now
    await assert.rejects(() => service.castVote(1, 3, 4), ValidationError);
    assert.equal(votes.filter((v) => v['ballot'] === 2).length, 0);

    const pending = await service.castVote(1, 4, 1);
    assert.equal(pending.state, 'pending');
    assert.equal(pending.ballot, 2);
    assert.equal(votes.filter((v) => v['ballot'] === 1).length, 4);
    assert.equal(votes.filter((v) => v['ballot'] === 2).length, 1);
  });

  test('the second ballot decides when one leader gets ahead', async () => {
    const { service, rounds } = playing(FOUR, { status: SpyRoundStatus.VOTING });
    await service.castVote(1, 1, 2);
    await service.castVote(1, 2, 1);
    await service.castVote(1, 3, 2);
    await service.castVote(1, 4, 1);

    await service.castVote(1, 3, 1);
    await service.castVote(1, 4, 1);
    await service.castVote(1, 2, 1);
    const done = await service.castVote(1, 1, 2);

    assert.equal(done.state, 'resolved');
    assert.equal(done.ballot, 2);
    assert.equal(rounds[0]!['outcome'], 'town');
    assert.equal(rounds[0]!['outcome_reason'], 'vote_hit');
  });

  test('a second tie opens a third ballot between the new leaders', async () => {
    const { service } = playing(FOUR, { status: SpyRoundStatus.VOTING });
    await service.castVote(1, 1, 2);
    await service.castVote(1, 2, 1);
    await service.castVote(1, 3, 2);
    await service.castVote(1, 4, 1);

    await service.castVote(1, 1, 2);
    await service.castVote(1, 2, 1);
    await service.castVote(1, 3, 2);
    const tie = await service.castVote(1, 4, 1);
    assert.equal(tie.state, 'tie');
    assert.equal(tie.ballot, 2);
    assert.equal((tie as { nextBallot: number }).nextBallot, 3);
  });
});

describe('SpyService.guess', () => {
  test('a correct guess wins for the spies and is recorded', async () => {
    const { service, rounds } = playing();
    const out = await service.guess(1, 1, ' школа ');
    assert.equal(out.result, 'correct');
    assert.equal(rounds[0]!['status'], SpyRoundStatus.FINISHED);
    assert.equal(rounds[0]!['outcome'], 'spies');
    assert.equal(rounds[0]!['outcome_reason'], 'guess_correct');
    assert.equal(rounds[0]!['guess'], 'школа');
    assert.equal(rounds[0]!['guessed_by'], 1);
    assert.equal('players' in out ? out.players.length : 0, 5);
  });

  test('a close guess changes nothing', async () => {
    const { service, rounds } = playing();
    const out = await service.guess(1, 1, 'Школы');
    assert.deepEqual(out, { result: 'close' });
    assert.equal(rounds[0]!['status'], SpyRoundStatus.IN_PROGRESS);
    assert.equal(rounds[0]!['guess'], undefined);
    assert.equal(rounds[0]!['guessed_by'], undefined);
  });

  test('a wrong guess wins for the town and is recorded, also while voting', async () => {
    const { service, rounds } = playing(FIVE, { status: SpyRoundStatus.VOTING });
    const out = await service.guess(1, 1, 'Космос');
    assert.equal(out.result, 'wrong');
    assert.equal(rounds[0]!['outcome'], 'town');
    assert.equal(rounds[0]!['outcome_reason'], 'guess_wrong');
    assert.equal(rounds[0]!['guess'], 'Космос');
    assert.equal(rounds[0]!['guessed_by'], 1);
  });

  test('only a living spy may guess, with a non-empty text, in a running round', async () => {
    const { service } = playing();
    await assert.rejects(() => service.guess(1, 2, 'Школа'), ConflictError);
    await assert.rejects(() => service.guess(1, 99, 'Школа'), ConflictError);
    await assert.rejects(() => service.guess(1, 1, '   '), ValidationError);

    const out = playing(FIVE, {}, {}, [1]);
    await assert.rejects(() => out.service.guess(1, 1, 'Школа'), ConflictError);

    const done = playing(FIVE, { status: SpyRoundStatus.FINISHED });
    await assert.rejects(() => done.service.guess(1, 1, 'Школа'), ConflictError);
  });
});

describe('SpyService.finishRound / abortRound', () => {
  test('abortRound closes the round with no result', async () => {
    const { service, rounds, event } = playing();
    const out = await service.abortRound(1);
    assert.equal(rounds[0]!['outcome'], 'aborted');
    assert.equal(rounds[0]!['outcome_reason'], 'manual');
    assert.equal(out.players.length, 5);
    assert.equal(event['status'], SpyStatus.IN_PROGRESS);
    await assert.rejects(() => service.abortRound(1), ConflictError);
  });

  test('a finished round lets the next one start', async () => {
    const { service } = playing();
    await service.finishRound(1, 'town', 'manual');
    const next = await service.startRound(1);
    assert.equal(next.round.number, 2);
  });
});

describe('SpyService.eliminate', () => {
  test('marks the player and keeps playing while the table is valid', async () => {
    const { service, roundPlayers: rp } = playing();
    const out = await service.eliminate(1, 3, true);
    assert.equal(out.finished, false);
    assert.equal(rp.find((p) => p['user_id'] === 3)!['is_eliminated'], true);

    await service.eliminate(1, 3, false);
    assert.equal(rp.find((p) => p['user_id'] === 3)!['is_eliminated'], false);
  });

  test('the town wins when no spy is left', async () => {
    const { service, rounds } = playing();
    const out = await service.eliminate(1, 1, true);
    assert.equal(out.finished, true);
    assert.equal(rounds[0]!['outcome'], 'town');
    assert.equal(rounds[0]!['outcome_reason'], 'manual');
  });

  test('Mr. White and the double agent keep the spy team alive', async () => {
    const { service, rounds } = playing({ ...FIVE, 4: SpyRole.MR_WHITE });
    const out = await service.eliminate(1, 1, true);
    assert.equal(out.finished, false);
    assert.equal(rounds[0]!['status'], SpyRoundStatus.IN_PROGRESS);
  });

  test('the round is aborted when fewer than three players are left', async () => {
    const { service, rounds } = playing(FOUR);
    assert.equal((await service.eliminate(1, 2, true)).finished, false);
    const out = await service.eliminate(1, 3, true);
    assert.equal(out.finished, true);
    assert.equal(rounds[0]!['outcome'], 'aborted');
    assert.equal(rounds[0]!['outcome_reason'], 'manual');
  });

  test('passes the turn on when the current player leaves', async () => {
    const { service, rounds } = playing(FIVE, { turn_index: 1 });
    await service.eliminate(1, 2, true);
    assert.equal(rounds[0]!['turn_index'], 2);
  });

  test('the vote is settled when the last missing voter leaves', async () => {
    const { service, rounds } = playing(FIVE, { status: SpyRoundStatus.VOTING });
    for (const voter of [2, 3, 4]) await service.castVote(1, voter, 1);
    await service.castVote(1, 1, 2);
    assert.equal(rounds[0]!['status'], SpyRoundStatus.VOTING);

    const out = await service.eliminate(1, 5, true);
    assert.equal(out.finished, true);
    assert.equal(rounds[0]!['outcome_reason'], 'vote_hit');
  });

  test('an unknown player or a finished round is refused', async () => {
    const { service } = playing();
    await assert.rejects(() => service.eliminate(1, 99, true), ConflictError);
    const done = playing(FIVE, { status: SpyRoundStatus.FINISHED });
    await assert.rejects(() => done.service.eliminate(1, 2, true), ConflictError);
  });
});

describe('SpyService.setParticipantActive', () => {
  test('switches the flag in any playable status', async () => {
    for (const status of [SpyStatus.REGISTRATION, SpyStatus.CLOSED, SpyStatus.IN_PROGRESS]) {
      const { service, participants } = makeService(status, players(4));
      await service.setParticipantActive(1, 2, false);
      assert.equal(participants.find((p) => p['user_id'] === 2)!['is_active'], false, status);
      await service.setParticipantActive(1, 2, true);
      assert.equal(participants.find((p) => p['user_id'] === 2)!['is_active'], true, status);
    }
  });

  test('coming back needs a free place among the active players', async () => {
    const rows = [...players(3), player(4, { is_active: false })];
    const { service, participants } = makeService(SpyStatus.REGISTRATION, rows, { max_players: 3 });
    await assert.rejects(() => service.setParticipantActive(1, 4, true), /full/);
    assert.equal(participants.find((p) => p['user_id'] === 4)!['is_active'], false);
  });

  test('refuses a stranger and a finished evening', async () => {
    const { service } = makeService(SpyStatus.REGISTRATION, players(3));
    await assert.rejects(() => service.setParticipantActive(1, 99, false), /Not joined/);
    const done = makeService(SpyStatus.FINISHED, players(3));
    await assert.rejects(() => done.service.setParticipantActive(1, 1, false), ConflictError);
  });

  test('a player who skips is left out of the next deal', async () => {
    const { service, roundPlayers: dealt } = makeService(SpyStatus.CLOSED, players(4), {}, [], [GLOBAL_LOCATION]);
    await service.setParticipantActive(1, 4, false);
    await service.startRound(1);
    assert.deepEqual(dealt.map((p) => p['user_id']).sort(), [1, 2, 3]);
  });
});

describe('SpyService.getLayout', () => {
  test('is closed to the players of a running round', async () => {
    const { service } = playing();
    await assert.rejects(() => service.getLayout(1, 2), ConflictError);
  });

  test('is open to a non-player during the round and to everyone after it', async () => {
    const { service } = playing();
    assert.equal((await service.getLayout(1, 99)).length, 5);

    const done = playing(FIVE, { status: SpyRoundStatus.FINISHED });
    assert.equal((await done.service.getLayout(1, 2)).length, 5);
  });

  test('needs a round', async () => {
    const { service } = makeService(SpyStatus.CLOSED, players(3));
    await assert.rejects(() => service.getLayout(1, 1), ConflictError);
  });
});

describe('SpyService.runTurnTimeouts', () => {
  const started = new Date('2026-01-01T10:00:00Z');
  const at = (seconds: number) => new Date(started.getTime() + seconds * 1000);

  test('passes the turn once the deadline is reached', async () => {
    const { service, rounds } = playing(FIVE, { turn_started_at: started }, { turn_seconds: 30 });

    assert.deepEqual(await service.runTurnTimeouts(at(29)), []);
    assert.equal(rounds[0]!['turn_index'], 0);

    const moved = await service.runTurnTimeouts(at(30));
    assert.deepEqual(moved, [{ eventId: 1, roundId: 1, previousUserId: 1, currentUserId: 2 }]);
    assert.equal(rounds[0]!['turn_index'], 1);
    assert.equal((rounds[0]!['turn_started_at'] as Date).getTime(), at(30).getTime());

    // The timer restarted, so the same moment finds nothing more to do
    assert.deepEqual(await service.runTurnTimeouts(at(30)), []);
  });

  test('ignores events without a timer and rounds that are voting', async () => {
    const noTimer = playing(FIVE, { turn_started_at: started }, { turn_seconds: null });
    assert.deepEqual(await noTimer.service.runTurnTimeouts(at(9999)), []);

    const voting = playing(FIVE, { turn_started_at: started, status: SpyRoundStatus.VOTING }, { turn_seconds: 30 });
    assert.deepEqual(await voting.service.runTurnTimeouts(at(9999)), []);
  });

  test('skips eliminated players', async () => {
    const { service } = playing(FIVE, { turn_started_at: started }, { turn_seconds: 30 }, [2]);
    const moved = await service.runTurnTimeouts(at(60));
    assert.equal(moved[0]!.currentUserId, 3);
  });

  test('one failing round does not stop the others', async (t) => {
    const log = t.mock.method(console, 'error', () => undefined);
    const { service, rounds, roundPlayers: rp } = playing(FIVE, { turn_started_at: started }, { turn_seconds: 30 });
    // Round 1 has nobody left to take a turn; round 2 is healthy
    for (const p of rp) p['is_eliminated'] = true;
    rounds.push(spyRound({ id: 2, number: 2, turn_started_at: started }));
    rp.push(...roundPlayers(FIVE, 2));

    const moved = await service.runTurnTimeouts(at(60));
    assert.deepEqual(moved.map((m) => m.roundId), [2]);
    assert.equal(log.mock.callCount(), 1);
  });
});

describe('SpyService.getGroupStats', () => {
  function statsFixture() {
    const rounds = [
      spyRound({ id: 1, number: 1, status: SpyRoundStatus.FINISHED, outcome: 'town', outcome_reason: 'vote_hit' }),
      spyRound({ id: 2, number: 2, status: SpyRoundStatus.FINISHED, outcome: 'spies', outcome_reason: 'guess_correct', guessed_by: 1 }),
      spyRound({ id: 3, number: 3, status: SpyRoundStatus.FINISHED, outcome: 'aborted', outcome_reason: 'manual' }),
      spyRound({ id: 4, number: 4, status: SpyRoundStatus.FINISHED, outcome: 'spies', outcome_reason: 'vote_miss' }),
      spyRound({ id: 5, number: 5, status: SpyRoundStatus.IN_PROGRESS }),
    ];
    const rp = [
      ...roundPlayers(FOUR, 1),
      ...roundPlayers(FOUR, 2),
      ...roundPlayers(FOUR, 3),
      ...roundPlayers({ ...FOUR, 1: SpyRole.CIVILIAN, 2: SpyRole.SPY }, 4),
      ...roundPlayers(FOUR, 5),
    ];
    const votes = [
      { id: 1, round_id: 1, voter_id: 2, target_id: 1, ballot: 1 },
      { id: 2, round_id: 1, voter_id: 3, target_id: 1, ballot: 1 },
      { id: 3, round_id: 1, voter_id: 4, target_id: 1, ballot: 1 },
      { id: 4, round_id: 1, voter_id: 1, target_id: 2, ballot: 1 },
    ];
    return makeService(SpyStatus.IN_PROGRESS, players(4), {}, rounds, [], rp, votes);
  }

  test('counts finished, non-aborted rounds per player', async () => {
    const { service } = statsFixture();
    const stats = await service.getGroupStats(1);
    const byId = new Map(stats.map((s) => [s.user_id, s]));

    const p1 = byId.get(1)!;
    assert.deepEqual(
      { rounds: p1.rounds, wins: p1.wins, spy_rounds: p1.spy_rounds, spy_wins: p1.spy_wins, exposed: p1.exposed, guessed: p1.guessed },
      { rounds: 3, wins: 1, spy_rounds: 2, spy_wins: 1, exposed: 1, guessed: 1 },
    );
    assert.ok(Math.abs(p1.win_rate - 1 / 3) < 1e-9);

    const p2 = byId.get(2)!;
    assert.deepEqual(
      { rounds: p2.rounds, wins: p2.wins, spy_rounds: p2.spy_rounds, spy_wins: p2.spy_wins, exposed: p2.exposed, guessed: p2.guessed },
      { rounds: 3, wins: 2, spy_rounds: 1, spy_wins: 1, exposed: 0, guessed: 0 },
    );
    assert.equal(byId.get(3)!.wins, 1);
  });

  test('sorts by rounds, then by win rate', async () => {
    const { service } = statsFixture();
    const stats = await service.getGroupStats(1);
    assert.deepEqual(stats.map((s) => s.user_id), [2, 1, 3, 4]);
  });

  test('is empty without finished rounds or for another group', async () => {
    const { service } = makeService(SpyStatus.IN_PROGRESS, players(3), {}, [spyRound()], [], roundPlayers(FOUR));
    assert.deepEqual(await service.getGroupStats(1), []);
    const other = statsFixture();
    assert.deepEqual(await other.service.getGroupStats(2), []);
  });
});

describe('SpyService.getVotingState', () => {
  const voting = (extra: Row = {}, roles = FIVE, eliminated: number[] = []) =>
    playing(roles, { status: SpyRoundStatus.VOTING, ...extra }, {}, eliminated);

  test('null without a round and while the round is not in the voting status', async () => {
    const none = makeService(SpyStatus.CLOSED, players(3));
    assert.equal(await none.service.getVotingState(1), null);
    assert.equal(await playing().service.getVotingState(1), null);
    assert.equal(await playing(FIVE, { status: SpyRoundStatus.FINISHED }).service.getVotingState(1), null);
  });

  test('first ballot: voters and the score, no candidate restriction', async () => {
    const { service } = voting();
    assert.deepEqual(await service.getVotingState(1), {
      roundId: 1, ballot: 1, voterIds: [], counts: [], leaders: [], candidateIds: undefined,
    });

    await service.castVote(1, 2, 1);
    await service.castVote(1, 3, 1);
    await service.castVote(1, 4, 2);
    const state = await service.getVotingState(1);
    assert.equal(state?.ballot, 1);
    assert.deepEqual(state?.voterIds.slice().sort(), [2, 3, 4]);
    assert.deepEqual(state?.counts, [{ userId: 1, votes: 2 }, { userId: 2, votes: 1 }]);
    assert.deepEqual(state?.leaders, [1]);
    assert.equal(state?.candidateIds, undefined);
  });

  test('second ballot after a tie: only the votes of the new ballot count, candidates are the old leaders', async () => {
    const { service } = voting({}, FOUR);
    await service.castVote(1, 1, 2);
    await service.castVote(1, 2, 1);
    await service.castVote(1, 3, 1);
    const tie = await service.castVote(1, 4, 2);
    assert.equal(tie.state, 'tie');

    assert.deepEqual(await service.getVotingState(1), {
      roundId: 1, ballot: 2, voterIds: [], counts: [], leaders: [], candidateIds: [1, 2],
    });

    await service.castVote(1, 3, 2);
    const state = await service.getVotingState(1);
    assert.equal(state?.ballot, 2);
    assert.deepEqual(state?.voterIds, [3]);
    assert.deepEqual(state?.counts, [{ userId: 2, votes: 1 }]);
    assert.deepEqual(state?.candidateIds, [1, 2]);
  });

  test('ignores votes of players who left', async () => {
    const { service } = voting({}, FIVE, [5]);
    await service.castVote(1, 2, 1);
    assert.deepEqual((await service.getVotingState(1))?.voterIds, [2]);
  });

  test('never exposes who voted for whom', async () => {
    const { service } = voting();
    await service.castVote(1, 2, 1);
    await service.castVote(1, 3, 4);
    const state = (await service.getVotingState(1))!;

    assert.deepEqual(Object.keys(state).sort(), ['ballot', 'candidateIds', 'counts', 'leaders', 'roundId', 'voterIds']);
    assert.ok(state.voterIds.every((id) => typeof id === 'number'));
    assert.ok(!JSON.stringify(state).includes('target'));
    assert.ok(!JSON.stringify(state).includes('voter_id'));
  });
});

describe('SpyService.getRoundView', () => {
  const withUsers = (roles: Record<number, SpyRole>, eliminated: number[] = []): Row[] =>
    roundPlayers(roles, 1, eliminated).map((r) => ({ ...r, user: { id: r['user_id'], fullName: `P${r['user_id']}` } }));

  const viewOf = (status: SpyRoundStatus, eliminated: number[] = []) => makeService(
    SpyStatus.IN_PROGRESS, [], { round: 1 }, [spyRound({ status })], [GLOBAL_LOCATION], withUsers(FIVE, eliminated),
  ).service;

  test('null without a round', async () => {
    const { service } = makeService(SpyStatus.CLOSED, players(3));
    assert.equal(await service.getRoundView(1), null);
  });

  test('roles stay null until the round is finished', async () => {
    for (const status of [SpyRoundStatus.IN_PROGRESS, SpyRoundStatus.VOTING]) {
      const view = (await viewOf(status).getRoundView(1))!;
      assert.equal(view.players.length, 5);
      assert.ok(view.players.every((p) => p.role === null));
      assert.ok(!JSON.stringify(view.players).includes(SpyRole.SPY));
    }
  });

  test('roles are filled after the finish; user and elimination are visible', async () => {
    const view = (await viewOf(SpyRoundStatus.FINISHED, [3]).getRoundView(1))!;
    assert.equal(view.round.status, SpyRoundStatus.FINISHED);
    assert.deepEqual(view.players.map((p) => p.role), [SpyRole.SPY, SpyRole.CIVILIAN, SpyRole.CIVILIAN, SpyRole.CIVILIAN, SpyRole.CIVILIAN]);
    assert.equal(view.players[0].user.fullName, 'P1');
    assert.deepEqual(view.players.map((p) => p.is_eliminated), [false, false, true, false, false]);
  });
});
