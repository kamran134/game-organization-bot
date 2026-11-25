import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MafiaService } from '../../services/MafiaService';
import { MafiaEvent, MafiaStatus } from '../../models/MafiaEvent';
import { MafiaParticipant } from '../../models/MafiaParticipant';
import { MafiaLogEntry, MafiaLogPhase, MafiaLogType } from '../../models/MafiaLogEntry';
import { MafiaRole } from '../../models/MafiaRole';
import { ConflictError, ValidationError } from '../../utils/errors';

type Row = Record<string, any>;

/** In-memory fake of the two repositories; the transaction manager hands out the same repos. */
function makeService(status: MafiaStatus, participantRows: Row[], eventOverrides: Row = {}) {
  const event: Row = {
    id: 1, group_id: 1, title: 'Evening', status, host_id: 100, show_mafia_team: true, assign_seats: false,
    max_players: 10, round: 0, roles_config: null, dealt_at: null, ...eventOverrides,
  };
  const participants = participantRows;
  const locks: string[] = [];
  const reads: string[] = [];

  const eventRepo = {
    findOne: async (opts: any) => {
      if (opts?.lock) locks.push(opts.lock.mode);
      return opts?.where?.id === event.id ? event : null;
    },
    save: async (e: Row) => Object.assign(event, e),
  };

  const matches = (p: Row, where: Row): boolean => Object.entries(where).every(([k, v]) => p[k] === v);
  const participantRepo = {
    find: async (opts: any) => {
      reads.push('find');
      return participants.filter((p) => matches(p, opts?.where ?? {}));
    },
    findOne: async (opts: any) => participants.find((p) => matches(p, opts?.where ?? {})) ?? null,
    count: async (opts: any) => participants.filter((p) => matches(p, opts?.where ?? {})).length,
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
    update: async (where: Row, patch: Row) => {
      for (const p of participants.filter((row) => matches(row, where))) Object.assign(p, patch);
    },
  };

  const logEntries: Row[] = [];
  let nextLogId = 1;
  const logRepo = {
    create: (data: Row) => ({ ...data }),
    save: async (row: Row) => {
      row['id'] = nextLogId++;
      row['created_at'] = new Date(2026, 0, 1, 0, 0, row['id']);
      logEntries.push(row);
      return row;
    },
    findOne: async (opts: any) => logEntries.find((e) => matches(e, opts?.where ?? {})) ?? null,
    find: async (opts: any) =>
      logEntries
        .filter((e) => matches(e, opts?.where ?? {}))
        .sort((a, b) => a['cycle'] - b['cycle'] || a['id'] - b['id'])
        .map((e) => ({ ...e, target: participants.find((p) => p.user_id === e['target_user_id'])?.user ?? null })),
    delete: async (id: number) => {
      const i = logEntries.findIndex((e) => e['id'] === id);
      if (i >= 0) logEntries.splice(i, 1);
    },
  };

  const repos = new Map<unknown, unknown>([
    [MafiaEvent, eventRepo], [MafiaParticipant, participantRepo], [MafiaLogEntry, logRepo],
  ]);
  const db = {
    getRepository: (entity: unknown) => repos.get(entity),
    dataSource: {
      transaction: async (cb: (manager: unknown) => Promise<unknown>) =>
        cb({ getRepository: (entity: unknown) => repos.get(entity) }),
    },
  };
  return { service: new MafiaService(db as never), event, participants, locks, reads, logEntries };
}

function player(id: number, extra: Row = {}): Row {
  return {
    id: id * 10,
    event_id: 1,
    user_id: id,
    user: { id, telegram_id: 1000 + id, first_name: `U${id}`, fullName: `U${id}` },
    role: null,
    seat: null,
    card_variant: null,
    ...extra,
  };
}

const players = (n: number): Row[] => Array.from({ length: n }, (_, i) => player(i + 1));

describe('MafiaService.join', () => {
  test('adds the participant under an exclusive lock (concurrent joins must not overfill max_players)', async () => {
    const { service, participants, locks } = makeService(MafiaStatus.REGISTRATION, []);
    await service.join(1, 5);
    assert.equal(participants.length, 1);
    assert.deepEqual(locks, ['pessimistic_write']);
  });

  test('rejects joining after registration is closed, dealt or finished', async () => {
    for (const status of [MafiaStatus.CLOSED, MafiaStatus.DEALT, MafiaStatus.FINISHED]) {
      const { service } = makeService(status, []);
      await assert.rejects(() => service.join(1, 5), ConflictError, status);
    }
  });

  test('the host cannot play', async () => {
    const { service } = makeService(MafiaStatus.REGISTRATION, []);
    await assert.rejects(() => service.join(1, 100), /Host cannot play/);
  });

  test('rejects a double join', async () => {
    const { service } = makeService(MafiaStatus.REGISTRATION, [player(5)]);
    await assert.rejects(() => service.join(1, 5), /Already joined/);
  });

  test('rejects joining a full event, and a freed spot can be taken again', async () => {
    const { service, participants } = makeService(MafiaStatus.REGISTRATION, players(4), { max_players: 4 });
    await assert.rejects(() => service.join(1, 50), /Event is full/);

    await service.leave(1, 1);
    await service.join(1, 50);
    assert.equal(participants.length, 4);
  });

});

describe('MafiaService.leave / removeParticipant', () => {
  test('leave works only during registration', async () => {
    await assert.rejects(() => makeService(MafiaStatus.CLOSED, [player(5)]).service.leave(1, 5), ConflictError);
    await assert.rejects(() => makeService(MafiaStatus.DEALT, [player(5)]).service.leave(1, 5), ConflictError);
    await assert.rejects(() => makeService(MafiaStatus.REGISTRATION, []).service.leave(1, 5), /Not joined/);
  });

  test('the host or an admin can remove a player while registration is open or closed', async () => {
    for (const status of [MafiaStatus.REGISTRATION, MafiaStatus.CLOSED]) {
      const { service, participants } = makeService(status, [player(5)]);
      await service.removeParticipant(1, 5);
      assert.equal(participants.length, 0, status);
    }
    await assert.rejects(() => makeService(MafiaStatus.DEALT, [player(5)]).service.removeParticipant(1, 5), ConflictError);
  });
});

describe('MafiaService.closeRegistration', () => {
  test('moves registration to closed under a write lock', async () => {
    const { service, event, locks } = makeService(MafiaStatus.REGISTRATION, players(4));
    await service.closeRegistration(1);
    assert.equal(event.status, MafiaStatus.CLOSED);
    assert.deepEqual(locks, ['pessimistic_write']);
  });

  test('needs at least 4 players', async () => {
    const { service, event } = makeService(MafiaStatus.REGISTRATION, players(3));
    await assert.rejects(() => service.closeRegistration(1), /Not enough players/);
    assert.equal(event.status, MafiaStatus.REGISTRATION);
  });

  test('is rejected from any other status', async () => {
    for (const status of [MafiaStatus.CLOSED, MafiaStatus.DEALT, MafiaStatus.FINISHED]) {
      await assert.rejects(() => makeService(status, players(5)).service.closeRegistration(1), ConflictError, status);
    }
  });
});

describe('MafiaService.deal', () => {
  test('deals every participant, bumps the round and remembers the layout', async () => {
    const { service, event, participants, locks } = makeService(MafiaStatus.REGISTRATION, players(7), { assign_seats: true });

    const result = await service.deal(1);

    assert.deepEqual(locks, ['pessimistic_write']);
    assert.equal(event.status, MafiaStatus.DEALT);
    assert.equal(event.round, 1);
    assert.equal(result.round, 1);
    assert.ok(event.dealt_at instanceof Date);
    assert.equal(event.roles_config.doctor, 1);
    assert.equal(result.players.length, 7);
    for (const p of participants) {
      assert.ok(p.role);
      assert.ok(p.card_variant >= 1);
    }
    assert.deepEqual(participants.map((p) => p.seat).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
  });

  test('works from the closed status and re-deals from dealt with the next round', async () => {
    const closed = makeService(MafiaStatus.CLOSED, players(5));
    await closed.service.deal(1);
    assert.equal(closed.event.status, MafiaStatus.DEALT);

    const { service, event } = makeService(MafiaStatus.REGISTRATION, players(5));
    await service.deal(1);
    await service.deal(1);
    assert.equal(event.round, 2);
    assert.equal(event.status, MafiaStatus.DEALT);
  });

  test('is rejected from finished', async () => {
    await assert.rejects(() => makeService(MafiaStatus.FINISHED, players(5)).service.deal(1), ConflictError);
  });

  test('rejects too few players and invalid explicit counts', async () => {
    await assert.rejects(() => makeService(MafiaStatus.REGISTRATION, players(3)).service.deal(1), ValidationError);

    const { service } = makeService(MafiaStatus.REGISTRATION, players(5));
    const bad = { civilian: 5, mafia: 0, don: 0, commissar: 0, doctor: 0, maniac: 0, lover: 0 };
    await assert.rejects(() => service.deal(1, bad), ValidationError);
  });

  test('uses explicit counts, then the stored layout while it fits, otherwise the suggestion', async () => {
    const explicit = { civilian: 2, mafia: 1, don: 0, commissar: 0, doctor: 0, maniac: 1, lover: 0 };
    const { service, participants, event } = makeService(MafiaStatus.REGISTRATION, players(4));
    await service.deal(1, explicit);
    assert.equal(participants.filter((p) => p.role === 'maniac').length, 1);

    // The stored layout (with a maniac) is reused for the next deal of the same size
    await service.deal(1);
    assert.equal(participants.filter((p) => p.role === 'maniac').length, 1);

    // A different player count falls back to the suggestion
    participants.push(player(9), player(10));
    await service.deal(1);
    assert.equal(participants.filter((p) => p.role === 'maniac').length, 0);
    assert.equal(event.roles_config.commissar, 1);
  });
});

describe('MafiaService.reopen / finish / close flow', () => {
  test('reopen clears roles, seats and variants and keeps the round', async () => {
    const { service, event, participants } = makeService(MafiaStatus.REGISTRATION, players(5));
    await service.deal(1);
    await service.reopen(1);

    assert.equal(event.status, MafiaStatus.REGISTRATION);
    assert.equal(event.round, 1);
    for (const p of participants) {
      assert.equal(p.role, null);
      assert.equal(p.seat, null);
      assert.equal(p.card_variant, null);
    }
  });

  test('reopen works from closed and is rejected from registration and finished', async () => {
    const closed = makeService(MafiaStatus.CLOSED, players(5));
    await closed.service.reopen(1);
    assert.equal(closed.event.status, MafiaStatus.REGISTRATION);

    await assert.rejects(() => makeService(MafiaStatus.REGISTRATION, []).service.reopen(1), ConflictError);
    await assert.rejects(() => makeService(MafiaStatus.FINISHED, []).service.reopen(1), ConflictError);
  });

  test('finish works from registration, closed and dealt, not twice', async () => {
    for (const status of [MafiaStatus.REGISTRATION, MafiaStatus.CLOSED, MafiaStatus.DEALT]) {
      const { service, event } = makeService(status, []);
      await service.finish(1);
      assert.equal(event.status, MafiaStatus.FINISHED, status);
    }
    await assert.rejects(() => makeService(MafiaStatus.FINISHED, []).service.finish(1), ConflictError);
  });
});

describe('MafiaService.getMyCard', () => {
  const dealt = (extra: Row = {}) => makeService(MafiaStatus.DEALT, [
    player(1, { role: 'don', seat: 1, card_variant: 1 }),
    player(2, { role: 'mafia', seat: 2, card_variant: 1 }),
    player(3, { role: 'civilian', seat: 3, card_variant: 2 }),
    player(4, { role: 'commissar', seat: 4, card_variant: 1 }),
  ], { round: 3, ...extra });

  test('returns null before the deal and for a non-participant', async () => {
    assert.equal(await makeService(MafiaStatus.REGISTRATION, players(4)).service.getMyCard(1, 1), null);
    assert.equal(await makeService(MafiaStatus.CLOSED, players(4)).service.getMyCard(1, 1), null);
    assert.equal(await dealt().service.getMyCard(1, 99), null);
  });

  test('a mafia player sees teammates when the evening shows the mafia to itself', async () => {
    const card = await dealt().service.getMyCard(1, 2);
    assert.equal(card?.round, 3);
    assert.equal(card?.role, 'mafia');
    assert.deepEqual(card?.teammates, [{ name: 'U1', role: 'don', seat: 1 }]);
  });

  test('no teammates when the setting is off', async () => {
    const card = await dealt({ show_mafia_team: false }).service.getMyCard(1, 1);
    assert.deepEqual(card?.teammates, []);
  });

  test('nobody else is read for a non-mafia caller', async () => {
    const { service, reads } = dealt();
    const card = await service.getMyCard(1, 3);
    assert.equal(card?.role, 'civilian');
    assert.deepEqual(card?.teammates, []);
    assert.deepEqual(reads, [], 'no participant list may be loaded');

    const exposed = JSON.stringify(card);
    assert.ok(!exposed.includes('commissar'));
    assert.ok(!exposed.includes('don'));
  });
});

describe('MafiaService.getLayout', () => {
  test('lists every player with the role and seat', async () => {
    const { service } = makeService(MafiaStatus.DEALT, [
      player(1, { role: 'don', seat: 2 }), player(2, { role: 'civilian', seat: 1 }),
    ]);
    const rows = await service.getLayout(1);
    assert.deepEqual(rows.map((r) => [r.user.id, r.role, r.seat]), [[1, 'don', 2], [2, 'civilian', 1]]);
  });
});

describe('MafiaService game log', () => {
  const dealt = (extra: Row = {}) => makeService(MafiaStatus.DEALT, [
    player(1, { role: MafiaRole.MAFIA }),
    player(2, { role: MafiaRole.COMMISSAR }),
    player(3, { role: MafiaRole.DOCTOR }),
    player(4, { role: MafiaRole.LOVER }),
  ], { round: 2, ...extra });

  const input = (type: MafiaLogType, phase: MafiaLogPhase, target: number | null, cycle = 1, note: string | null = null) =>
    ({ cycle, phase, type, target_user_id: target, note });

  test('addLogEntry stamps the current round and takes a shared lock', async () => {
    const { service, logEntries, locks } = dealt();
    await service.addLogEntry(1, input(MafiaLogType.KILL, MafiaLogPhase.NIGHT, 3));
    assert.equal(logEntries.length, 1);
    assert.equal(logEntries[0]!['round'], 2);
    assert.equal(logEntries[0]!['event_id'], 1);
    assert.deepEqual(locks, ['pessimistic_read']);
  });

  test('addLogEntry is allowed only while roles are dealt', async () => {
    for (const status of [MafiaStatus.REGISTRATION, MafiaStatus.CLOSED, MafiaStatus.FINISHED]) {
      const { service, logEntries } = makeService(status, players(4));
      await assert.rejects(() => service.addLogEntry(1, input(MafiaLogType.KILL, MafiaLogPhase.NIGHT, 1)), ConflictError, status);
      assert.equal(logEntries.length, 0);
    }
  });

  test('addLogEntry rejects a target who does not play this evening, but a note needs none', async () => {
    const { service, logEntries } = dealt();
    await assert.rejects(
      () => service.addLogEntry(1, input(MafiaLogType.LYNCH, MafiaLogPhase.DAY, 99)),
      /Target is not a participant/,
    );
    assert.equal(logEntries.length, 0);

    await service.addLogEntry(1, input(MafiaLogType.NOTE, MafiaLogPhase.DAY, null, 1, 'argument'));
    assert.equal(logEntries.length, 1);
    assert.equal(logEntries[0]!['note'], 'argument');
  });

  test('addLogEntry rejects an action of a role that was not dealt, and accepts it once the role is there', async () => {
    const noDoctor = makeService(MafiaStatus.DEALT, [
      player(1, { role: MafiaRole.MAFIA }), player(2, { role: MafiaRole.CIVILIAN }), player(3, { role: MafiaRole.CIVILIAN }),
      player(4, { role: MafiaRole.CIVILIAN }), player(5, { role: MafiaRole.CIVILIAN }),
    ], { round: 1 });
    await assert.rejects(
      () => noDoctor.service.addLogEntry(1, input(MafiaLogType.HEAL, MafiaLogPhase.NIGHT, 2)),
      (err: unknown) => err instanceof ValidationError && /dealt roles/.test(err.message),
    );
    await assert.rejects(() => noDoctor.service.addLogEntry(1, input(MafiaLogType.BLOCK, MafiaLogPhase.NIGHT, 2)), ValidationError);
    assert.equal(noDoctor.logEntries.length, 0);

    // role-free types and a dealt role both pass; the cycle is not checked
    await noDoctor.service.addLogEntry(1, input(MafiaLogType.LYNCH, MafiaLogPhase.DAY, 2));
    await noDoctor.service.addLogEntry(1, input(MafiaLogType.KILL, MafiaLogPhase.NIGHT, 3, 5));
    assert.equal(noDoctor.logEntries.length, 2);

    const { service, logEntries } = dealt();
    await service.addLogEntry(1, input(MafiaLogType.HEAL, MafiaLogPhase.NIGHT, 2));
    assert.equal(logEntries.length, 1);
  });

  test('getLog exposes the last night every dealt role can act in', async () => {
    const { service } = dealt();
    await service.addLogEntry(1, input(MafiaLogType.KILL, MafiaLogPhase.NIGHT, 3, 2));
    const log = await service.getLog(1);
    assert.deepEqual(log.state.rolesLastNight, {
      [MafiaRole.MAFIA]: null, [MafiaRole.COMMISSAR]: null, [MafiaRole.DOCTOR]: 2, [MafiaRole.LOVER]: null,
    });
  });

  test('getLog derives who is dead and the team counts', async () => {
    const { service } = dealt();
    await service.addLogEntry(1, input(MafiaLogType.KILL, MafiaLogPhase.NIGHT, 3));
    await service.addLogEntry(1, input(MafiaLogType.HEAL, MafiaLogPhase.NIGHT, 2));
    await service.addLogEntry(1, input(MafiaLogType.KILL, MafiaLogPhase.NIGHT, 2));
    await service.addLogEntry(1, input(MafiaLogType.LYNCH, MafiaLogPhase.DAY, 1));

    const log = await service.getLog(1);
    assert.equal(log.round, 2);
    assert.equal(log.entries.length, 4);
    assert.deepEqual(log.state.dead, [1, 3]);
    assert.deepEqual(log.state.alive, [2, 4]);
    assert.deepEqual(log.state.counts, { alive: 2, mafia: 0, town: 2, solo: 0 });
    assert.equal(log.state.outcome, 'town');
  });

  test('getLog shows only the current round', async () => {
    const { service, logEntries } = dealt();
    logEntries.push({ id: 50, event_id: 1, round: 1, cycle: 1, phase: 'night', type: 'kill', target_user_id: 3 });
    await service.addLogEntry(1, input(MafiaLogType.NOTE, MafiaLogPhase.NIGHT, null, 1, 'fresh'));

    const log = await service.getLog(1);
    assert.equal(log.entries.length, 1);
    assert.deepEqual(log.state.dead, []);
  });

  test('getLog orders the entries by cycle and puts the found role on check entries only', async () => {
    const { service } = dealt();
    await service.addLogEntry(1, input(MafiaLogType.KILL, MafiaLogPhase.NIGHT, 3, 2));
    await service.addLogEntry(1, input(MafiaLogType.CHECK, MafiaLogPhase.NIGHT, 1, 1));
    await service.addLogEntry(1, input(MafiaLogType.BLOCK, MafiaLogPhase.NIGHT, 1, 1));

    const log = await service.getLog(1);
    assert.deepEqual(log.entries.map((e) => e.entry.cycle), [1, 1, 2]);
    assert.deepEqual(log.entries.map((e) => e.targetRole), [MafiaRole.MAFIA, null, null]);
    assert.equal(log.entries[0]!.target?.id, 1);
  });

  test('a decided game accepts only notes; the entry that ends it passes', async () => {
    const { service, logEntries } = dealt();
    await service.addLogEntry(1, input(MafiaLogType.LYNCH, MafiaLogPhase.DAY, 2));
    await service.addLogEntry(1, input(MafiaLogType.LYNCH, MafiaLogPhase.DAY, 3)); // 1 mafia vs 1 town: decided
    assert.equal((await service.getLog(1)).state.outcome, 'mafia');

    await assert.rejects(
      () => service.addLogEntry(1, input(MafiaLogType.KILL, MafiaLogPhase.NIGHT, 4, 2)),
      (err: unknown) => err instanceof ConflictError && /already decided/.test(err.message),
    );
    await assert.rejects(() => service.addLogEntry(1, input(MafiaLogType.LYNCH, MafiaLogPhase.DAY, 4, 2)), ConflictError);
    await service.addLogEntry(1, input(MafiaLogType.NOTE, MafiaLogPhase.DAY, null, 2, 'gg'));
    assert.equal(logEntries.length, 3);
  });

  test('deleting the entry that ended the game reopens it', async () => {
    const { service, logEntries } = dealt();
    await service.addLogEntry(1, input(MafiaLogType.LYNCH, MafiaLogPhase.DAY, 2));
    await service.addLogEntry(1, input(MafiaLogType.LYNCH, MafiaLogPhase.DAY, 3));
    await service.deleteLogEntry(1, logEntries[1]!['id']);
    await service.addLogEntry(1, input(MafiaLogType.KILL, MafiaLogPhase.NIGHT, 4, 2));
    assert.equal(logEntries.length, 2);
  });

  test('a living maniac keeps the game going after the whole mafia is gone', async () => {
    const { service } = makeService(MafiaStatus.DEALT, [
      player(1, { role: MafiaRole.MAFIA }), player(2, { role: MafiaRole.MANIAC }), player(3, { role: MafiaRole.CIVILIAN }),
      player(4, { role: MafiaRole.CIVILIAN }),
    ], { round: 1 });
    await service.addLogEntry(1, input(MafiaLogType.LYNCH, MafiaLogPhase.DAY, 1));
    assert.equal((await service.getLog(1)).state.outcome, null);
    await service.addLogEntry(1, input(MafiaLogType.KILL, MafiaLogPhase.NIGHT, 3, 2));
    await service.addLogEntry(1, input(MafiaLogType.KILL, MafiaLogPhase.NIGHT, 4, 2));
    assert.equal((await service.getLog(1)).state.outcome, 'solo');
  });

  test('a new deal starts with a clean log: entries of the previous game do not decide the new one', async () => {
    const { service, logEntries } = dealt();
    logEntries.push(
      { id: 50, event_id: 1, round: 1, cycle: 1, phase: 'day', type: 'lynch', target_user_id: 2 },
      { id: 51, event_id: 1, round: 1, cycle: 1, phase: 'day', type: 'lynch', target_user_id: 3 },
    );
    await service.addLogEntry(1, input(MafiaLogType.KILL, MafiaLogPhase.NIGHT, 3));
    assert.equal(logEntries.length, 3);
  });

  test('deleteLogEntry removes the entry and the state follows', async () => {
    const { service, logEntries } = dealt();
    await service.addLogEntry(1, input(MafiaLogType.KILL, MafiaLogPhase.NIGHT, 3));
    await service.deleteLogEntry(1, logEntries[0]!['id']);
    assert.equal(logEntries.length, 0);
    assert.deepEqual((await service.getLog(1)).state.dead, []);
  });

  test('deleteLogEntry rejects an unknown entry and an entry of another evening', async () => {
    const { service, logEntries } = dealt();
    await assert.rejects(() => service.deleteLogEntry(1, 404), /Log entry not found/);

    logEntries.push({ id: 7, event_id: 2, round: 1, cycle: 1, phase: 'night', type: 'kill', target_user_id: 3 });
    await assert.rejects(() => service.deleteLogEntry(1, 7), ConflictError);
    assert.equal(logEntries.length, 1);
  });
});
