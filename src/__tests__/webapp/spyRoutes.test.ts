import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Router } from 'express';

// The router mounts verifyTelegramInitData; the dev bypass below is the documented way to drive
// it without signing init data. Must be set before the router handles its first request.
process.env['NODE_ENV'] = 'development';
process.env['SKIP_TELEGRAM_AUTH'] = 'true';
process.env['BOT_TOKEN'] = 'test-token';

import { createSpyRouter } from '../../webapp/routes/spy';
import { SpyStatus } from '../../models/SpyEvent';
import { SpyRoundStatus } from '../../models/SpyRound';
import { SpyRole } from '../../models/SpyRole';
import { SPY_MIN_PLAYERS, SPY_MAX_PLAYERS } from '../../utils/spyDeal';
import { SPY_PACKS } from '../../utils/spyRound';

/** The telegram id the dev bypass attaches to the request. */
const CALLER_TELEGRAM_ID = 0;
const CALLER_ID = 1;
const HOST_ID = 2;
const SPY_USER_ID = 3;
const SECRET_LOCATION = 'Секретная подводная лодка';

interface Row {
  [key: string]: any;
}

interface Options {
  callerIsHost?: boolean;
  callerRole?: SpyRole | null; // null = the caller does not play the round
  roundStatus?: SpyRoundStatus;
  canAccess?: boolean;
  adminOfGroups?: number[];
}

/** Router over in-memory repositories. By default the caller (user 1) is a plain member playing as a civilian. */
function makeRouter(options: Options = {}): { router: Router; participants: Row[]; locations: Row[]; calls: string[] } {
  const callerRole = options.callerRole === undefined ? SpyRole.CIVILIAN : options.callerRole;
  const users: Row[] = [
    { id: CALLER_ID, telegram_id: CALLER_TELEGRAM_ID, first_name: 'Dev' },
    { id: HOST_ID, telegram_id: 777, first_name: 'Host' },
    { id: SPY_USER_ID, telegram_id: 778, first_name: 'Ann' },
    { id: 4, telegram_id: 779, first_name: 'Bob' },
  ];
  const event: Row = {
    id: 1, group_id: 1, title: 'Evening', status: SpyStatus.IN_PROGRESS, host_id: options.callerIsHost ? CALLER_ID : HOST_ID,
    round: 1, max_players: 10, spy_count: null, double_agent: false, mr_white: false, packs: ['base'],
    turn_seconds: null, hint_after_cycles: null, group: { id: 1 }, host: users[1],
  };
  const participants: Row[] = [
    { id: 30, event_id: 1, user_id: HOST_ID, user: users[1], is_active: true },
    { id: 31, event_id: 1, user_id: SPY_USER_ID, user: users[2], is_active: true },
    { id: 32, event_id: 1, user_id: 4, user: users[3], is_active: true },
  ];
  if (callerRole) participants.push({ id: 33, event_id: 1, user_id: CALLER_ID, user: users[0], is_active: true });

  const round: Row = {
    id: 10, event_id: 1, number: 1, status: options.roundStatus ?? SpyRoundStatus.IN_PROGRESS,
    location_name: SECRET_LOCATION, location_pack: 'base', turn_order: [HOST_ID, SPY_USER_ID, 4, CALLER_ID],
    turn_index: 0, cycle: 1, turn_started_at: new Date(), outcome: null, outcome_reason: null, guess: null, guessed_by: null,
    started_at: new Date(), finished_at: null,
  };
  if (round['status'] === SpyRoundStatus.FINISHED) {
    Object.assign(round, { outcome: 'spies', outcome_reason: 'vote_miss', finished_at: new Date() });
  }
  const roundPlayers: Row[] = [
    { id: 50, round_id: 10, user_id: HOST_ID, user: users[1], role: SpyRole.CIVILIAN, is_eliminated: false },
    { id: 51, round_id: 10, user_id: SPY_USER_ID, user: users[2], role: SpyRole.SPY, is_eliminated: false },
    { id: 52, round_id: 10, user_id: 4, user: users[3], role: SpyRole.CIVILIAN, is_eliminated: false },
  ];
  if (callerRole) roundPlayers.push({ id: 53, round_id: 10, user_id: CALLER_ID, user: users[0], role: callerRole, is_eliminated: false });

  const locations: Row[] = [
    { id: 1, name: 'Больница', pack: 'base', group_id: null, is_active: true },
    { id: 2, name: 'Своя', pack: 'custom', group_id: 1, is_active: true },
    { id: 3, name: 'Чужая', pack: 'custom', group_id: 2, is_active: true },
  ];
  const calls: string[] = [];

  const matches = (row: Row, where: Row): boolean => Object.entries(where).every(([k, v]) => row[k] === v);
  const repos = new Map<string, Row>([
    ['User', {
      findOne: async ({ where }: { where: Row }) => users.find((u) => matches(u, where)) ?? null,
      save: async (u: Row) => u,
      update: async () => undefined,
    }],
    ['SpyEvent', {
      findOne: async ({ where }: { where: Row }) => (where['id'] === event['id'] ? event : null),
      find: async () => [event],
      save: async (e: Row) => e,
    }],
    ['SpyParticipant', {
      find: async () => participants,
      findOne: async ({ where }: { where: Row }) => participants.find((p) => matches(p, where)) ?? null,
      count: async () => participants.filter((p) => p.is_active).length,
      save: async (p: Row) => p,
    }],
    ['SpyRound', {
      findOne: async ({ where }: { where: Row }) => (matches(round, where) ? round : null),
      find: async () => [],
      save: async (r: Row) => r,
    }],
    ['SpyRoundPlayer', {
      find: async ({ where }: { where: Row }) => roundPlayers.filter((p) => matches(p, where)),
      findOne: async ({ where }: { where: Row }) => roundPlayers.find((p) => matches(p, where)) ?? null,
      save: async (p: Row) => p,
    }],
    ['SpyVote', { find: async () => [] }],
    ['SpyLocation', {
      findOne: async ({ where }: { where: Row }) => locations.find((l) => matches(l, where)) ?? null,
      find: async ({ where }: { where: Row }) => (where['group_id'] !== undefined && typeof where['group_id'] === 'number'
        ? locations.filter((l) => l.group_id === where['group_id'])
        : locations),
      create: (data: Row) => ({ ...data }),
      save: async (row: Row) => { row['id'] = 100 + locations.length; locations.push(row); return row; },
      delete: async (id: number) => { locations.splice(locations.findIndex((l) => l['id'] === id), 1); },
    }],
    ['GroupMember', {
      findOne: async ({ where }: { where: Row }) => (
        where['user_id'] === CALLER_ID && (options.adminOfGroups ?? []).includes(where['group_id']) ? { role: 'admin' } : null
      ),
    }],
  ]);
  const manager = { getRepository: (entity: { name: string }) => repos.get(entity.name) };
  const db = {
    getRepository: manager.getRepository,
    dataSource: { transaction: async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager) },
  };
  // Every notification is a recorded no-op: the routes must reach them only on the documented paths
  const notifications = new Proxy({}, {
    get: (_target, name: string) => async () => { calls.push(name); return null; },
  });

  const canAccess = options.canAccess ?? true;
  const router = createSpyRouter(db as never, notifications as never, async () => canAccess);
  return { router, participants, locations, calls };
}

interface Reply {
  status: number;
  body: any;
}

/** Drives the router directly: an express Router is a plain (req, res, next) function. */
function request(router: Router, options: { method: string; url: string; body?: unknown; query?: Record<string, string> }): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = {
      method: options.method,
      url: options.url,
      originalUrl: options.url,
      headers: {} as Record<string, string>,
      query: options.query ?? {},
      body: options.body,
    };
    const res = {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this; },
      json(payload: unknown) { resolve({ status: this.statusCode, body: payload }); },
    };
    (router as unknown as (req: unknown, res: unknown, next: (err?: unknown) => void) => void)(
      req,
      res,
      (err?: unknown) => (err ? reject(err) : resolve({ status: 404, body: {} })),
    );
  });
}

describe('spy routes: access guards', () => {
  test('a user outside the group gets 403 on every read and on joining', async () => {
    const { router } = makeRouter({ canAccess: false });

    for (const options of [
      { method: 'GET', url: '/', query: { group_id: '1' } },
      { method: 'GET', url: '/1' },
      { method: 'GET', url: '/1/layout' },
      { method: 'GET', url: '/1/rounds/1' },
      { method: 'GET', url: '/stats', query: { group_id: '1' } },
      { method: 'GET', url: '/locations', query: { group_id: '1' } },
      { method: 'POST', url: '/1/join' },
      { method: 'POST', url: '/1/rounds/current/vote', body: { target_id: 3 } },
      { method: 'POST', url: '/1/rounds/current/guess', body: { guess: 'x' } },
      { method: 'POST', url: '/', body: { group_id: 1, title: 'x' } },
    ]) {
      const reply = await request(router, options);
      assert.equal(reply.status, 403, `${options.method} ${options.url}`);
      assert.deepEqual(reply.body, { error: 'Forbidden' });
    }
  });

  test('a plain member gets 403 on every manager endpoint', async () => {
    const { router, calls } = makeRouter();

    for (const options of [
      { method: 'PATCH', url: '/1', body: { title: 'New' } },
      { method: 'DELETE', url: '/1' },
      { method: 'POST', url: '/1/close' },
      { method: 'POST', url: '/1/reopen' },
      { method: 'POST', url: '/1/finish' },
      { method: 'POST', url: '/1/rounds' },
      { method: 'POST', url: '/1/rounds/current/voting' },
      { method: 'POST', url: '/1/rounds/current/abort' },
      { method: 'POST', url: '/1/rounds/current/eliminate', body: { user_id: 3, eliminated: true } },
      { method: 'DELETE', url: '/1/participants/3' },
    ]) {
      const reply = await request(router, options);
      assert.equal(reply.status, 403, `${options.method} ${options.url}`);
      assert.deepEqual(reply.body, { error: 'Host or admin only' });
    }
    assert.deepEqual(calls, [], 'nothing was announced');
  });

  test('forcing the turn and editing someone else\'s participation need a manager', async () => {
    const { router } = makeRouter();

    const forced = await request(router, { method: 'POST', url: '/1/rounds/current/next', body: { force: true } });
    assert.equal(forced.status, 403);

    const other = await request(router, { method: 'PATCH', url: '/1/participants/3', body: { is_active: false } });
    assert.equal(other.status, 403);
  });

  test('passing the turn out of order is a 409', async () => {
    const { router } = makeRouter();
    const reply = await request(router, { method: 'POST', url: '/1/rounds/current/next' });
    assert.equal(reply.status, 409);
    assert.deepEqual(reply.body, { error: 'Not your turn' });
  });

  test('an unknown event is a 404, a malformed id a 400', async () => {
    const { router } = makeRouter({ callerIsHost: true });

    for (const options of [
      { method: 'GET', url: '/99' },
      { method: 'PATCH', url: '/99', body: { title: 'x' } },
      { method: 'POST', url: '/99/rounds' },
      { method: 'GET', url: '/99/layout' },
    ]) {
      const reply = await request(router, options);
      assert.equal(reply.status, 404, `${options.method} ${options.url}`);
    }
    assert.equal((await request(router, { method: 'GET', url: '/abc' })).status, 400);
    assert.equal((await request(router, { method: 'GET', url: '/stats' })).status, 400);
  });

  test('a participant may take themselves out of the next rounds', async () => {
    const { router, participants } = makeRouter();
    const reply = await request(router, { method: 'PATCH', url: `/1/participants/${CALLER_ID}`, body: { is_active: false } });

    assert.equal(reply.status, 200);
    assert.equal(participants.find((p) => p['user_id'] === CALLER_ID)!['is_active'], false);
  });

  test('a bad body is a 400, not a 500', async () => {
    const { router } = makeRouter({ callerIsHost: true });
    assert.equal((await request(router, { method: 'PATCH', url: '/1', body: { max_players: 99 } })).status, 400);
    assert.equal((await request(router, { method: 'POST', url: '/1/rounds/current/vote', body: {} })).status, 400);
    assert.equal((await request(router, { method: 'POST', url: '/1/rounds/current/guess', body: { guess: ' ' } })).status, 400);
    assert.equal((await request(router, { method: 'POST', url: '/1/rounds/current/eliminate', body: { user_id: 3 } })).status, 400);
  });
});

describe('spy routes: locations', () => {
  test('anyone in the group reads; only a group admin writes', async () => {
    const { router, locations } = makeRouter();

    const read = await request(router, { method: 'GET', url: '/locations', query: { group_id: '1' } });
    assert.equal(read.status, 200);
    assert.ok(read.body.length > 0);

    const denied = await request(router, { method: 'POST', url: '/locations', body: { group_id: 1, name: 'Новая' } });
    assert.equal(denied.status, 403);
    assert.equal(locations.length, 3);

    const own = await request(router, { method: 'DELETE', url: '/locations/2' });
    assert.equal(own.status, 403);
    assert.equal(locations.length, 3);
  });

  test('an admin adds and deletes the group\'s own locations, never a global or a foreign one', async () => {
    const { router, locations } = makeRouter({ adminOfGroups: [1] });

    const created = await request(router, { method: 'POST', url: '/locations', body: { group_id: 1, name: ' Новая ' } });
    assert.equal(created.status, 201);
    assert.equal(created.body.name, 'Новая');
    assert.equal(created.body.pack, 'custom');

    assert.equal((await request(router, { method: 'POST', url: '/locations', body: { group_id: 1, name: '' } })).status, 400);
    assert.equal((await request(router, { method: 'DELETE', url: '/locations/1' })).status, 403, 'global');
    assert.equal((await request(router, { method: 'DELETE', url: '/locations/3' })).status, 403, 'foreign group');
    assert.equal((await request(router, { method: 'DELETE', url: '/locations/99' })).status, 404);

    const removed = await request(router, { method: 'DELETE', url: '/locations/2' });
    assert.equal(removed.status, 200);
    assert.ok(!locations.some((l) => l['id'] === 2));
  });
});

/** Every key of an object tree, to prove a field is absent rather than null. */
function allKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, keys));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { keys.add(k); allKeys(v, keys); }
  }
  return keys;
}

const HIDDEN_KEYS = ['location_name', 'location_pack', 'guess', 'guessed_by', 'outcome', 'outcome_reason', 'role'];

describe('spy routes: no leak of the location and the roles', () => {
  test('a spy sees neither the location nor a single role anywhere in GET /:id', async () => {
    const { router } = makeRouter({ callerRole: SpyRole.SPY });
    const reply = await request(router, { method: 'GET', url: '/1' });

    assert.equal(reply.status, 200);
    const json = JSON.stringify(reply.body);
    assert.ok(!json.includes(SECRET_LOCATION), 'location leaked');
    assert.equal(reply.body.myCard.role, SpyRole.SPY);
    assert.equal(reply.body.myCard.location, null);
    assert.equal(reply.body.round.status, SpyRoundStatus.IN_PROGRESS);

    const publicKeys = allKeys({ round: reply.body.round, participants: reply.body.participants, event: reply.body.event });
    for (const key of HIDDEN_KEYS) assert.ok(!publicKeys.has(key), `${key} is present before the finish`);
  });

  test('a civilian gets the location only in their own card, and nobody else\'s role', async () => {
    const { router } = makeRouter({ callerRole: SpyRole.CIVILIAN });
    const reply = await request(router, { method: 'GET', url: '/1' });

    assert.equal(reply.body.myCard.location, SECRET_LOCATION);
    // Outside myCard the location and the roles are absent, voting included
    const rest = { ...reply.body, myCard: null };
    assert.ok(!JSON.stringify(rest).includes(SECRET_LOCATION));
    assert.ok(!JSON.stringify(rest).includes(`"${SpyRole.SPY}"`), 'the spy role leaked outside the own card');
    for (const key of HIDDEN_KEYS) assert.ok(!allKeys(reply.body.round).has(key), `${key} is present before the finish`);
  });

  test('voting does not change that', async () => {
    const { router } = makeRouter({ callerRole: SpyRole.CIVILIAN, roundStatus: SpyRoundStatus.VOTING });
    const reply = await request(router, { method: 'GET', url: '/1' });

    assert.equal(reply.body.round.status, SpyRoundStatus.VOTING);
    assert.ok(reply.body.votingState);
    assert.ok(!JSON.stringify({ ...reply.body, myCard: null }).includes(SECRET_LOCATION));
    for (const key of HIDDEN_KEYS) assert.ok(!allKeys(reply.body.round).has(key));
  });

  test('GET /:id/rounds/:number of an unfinished round is a 409 with no data', async () => {
    for (const status of [SpyRoundStatus.IN_PROGRESS, SpyRoundStatus.VOTING]) {
      const { router } = makeRouter({ roundStatus: status });
      const reply = await request(router, { method: 'GET', url: '/1/rounds/1' });

      assert.equal(reply.status, 409);
      assert.deepEqual(reply.body, { error: 'Round is not finished' });
    }
  });

  test('an unknown round number is a 404', async () => {
    const { router } = makeRouter({ roundStatus: SpyRoundStatus.FINISHED });
    assert.equal((await request(router, { method: 'GET', url: '/1/rounds/7' })).status, 404);
  });

  test('a finished round reveals the location and the roles', async () => {
    const { router } = makeRouter({ roundStatus: SpyRoundStatus.FINISHED });
    const reply = await request(router, { method: 'GET', url: '/1/rounds/1' });

    assert.equal(reply.status, 200);
    assert.equal(reply.body.location_name, SECRET_LOCATION);
    assert.equal(reply.body.outcome, 'spies');
    assert.equal(reply.body.players.find((p: Row) => p.user_id === SPY_USER_ID).role, SpyRole.SPY);
  });

  test('the layout is refused to a player of the running round and open to a bystander', async () => {
    const playing = makeRouter({ callerRole: SpyRole.CIVILIAN });
    assert.equal((await request(playing.router, { method: 'GET', url: '/1/layout' })).status, 409);

    const bystander = makeRouter({ callerRole: null });
    const reply = await request(bystander.router, { method: 'GET', url: '/1/layout' });
    assert.equal(reply.status, 200);
    assert.equal(reply.body.players.length, 3);

    const afterwards = makeRouter({ callerRole: SpyRole.CIVILIAN, roundStatus: SpyRoundStatus.FINISHED });
    assert.equal((await request(afterwards.router, { method: 'GET', url: '/1/layout' })).status, 200);
  });

  test('a player of the running round cannot read the card of anybody else through the details', async () => {
    const { router } = makeRouter({ callerRole: SpyRole.CIVILIAN });
    const reply = await request(router, { method: 'GET', url: '/1' });

    assert.deepEqual(Object.keys(reply.body.myCard).sort(), [
      'current_user_id', 'cycle', 'deadline', 'hint', 'is_my_turn', 'location', 'role', 'round',
    ]);
    assert.equal(reply.body.myCard.role, SpyRole.CIVILIAN);
  });
});

describe('spy routes: caller identity and form meta', () => {
  test('GET /:id tells the client who the caller is', async () => {
    const { router } = makeRouter();
    const reply = await request(router, { method: 'GET', url: '/1' });

    assert.equal(reply.status, 200);
    assert.deepEqual(reply.body.me, { userId: CALLER_ID });
  });

  test('GET /meta is not read as an event id and carries the packs and the limits', async () => {
    const { router } = makeRouter();
    const reply = await request(router, { method: 'GET', url: '/meta' });

    assert.equal(reply.status, 200);
    assert.deepEqual(reply.body.packs, SPY_PACKS);
    assert.deepEqual(reply.body.limits, {
      min_players: SPY_MIN_PLAYERS,
      max_players: SPY_MAX_PLAYERS,
      turn_seconds: { min: 15, max: 300 },
      hint_cycles: { min: 1, max: 10 },
    });
  });

  test('GET /meta needs no group_id: any authorized user reads it', async () => {
    const { router } = makeRouter({ canAccess: false });
    assert.equal((await request(router, { method: 'GET', url: '/meta' })).status, 200);
  });
});
