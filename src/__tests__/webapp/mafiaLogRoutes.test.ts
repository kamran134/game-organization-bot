import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Router } from 'express';

// The router mounts verifyTelegramInitData; the dev bypass below is the documented way to drive
// it without signing init data. Must be set before the router handles its first request.
process.env['NODE_ENV'] = 'development';
process.env['SKIP_TELEGRAM_AUTH'] = 'true';
process.env['BOT_TOKEN'] = 'test-token';

import { createMafiaRouter } from '../../webapp/routes/mafia';
import { MafiaStatus } from '../../models/MafiaEvent';
import { MafiaRole } from '../../models/MafiaRole';

/** The telegram id the dev bypass attaches to the request. */
const CALLER_TELEGRAM_ID = 0;
const CALLER_ID = 1;
const HOST_ID = 2;

interface Row {
  [key: string]: any;
}

/** Router over in-memory repositories; the caller (user 1) is NOT the host (user 2) unless `callerIsHost`. */
function makeRouter(callerIsHost = false): { router: Router; logRows: Row[] } {
  const users: Row[] = [
    { id: CALLER_ID, telegram_id: CALLER_TELEGRAM_ID, first_name: 'Dev' },
    { id: HOST_ID, telegram_id: 777, first_name: 'Host' },
    { id: 3, telegram_id: 778, first_name: 'Ann' },
  ];
  const event: Row = {
    id: 1, group_id: 1, title: 'Evening', status: MafiaStatus.DEALT, host_id: callerIsHost ? CALLER_ID : HOST_ID,
    round: 1, max_players: 10,
  };
  const participants: Row[] = [
    { id: 30, event_id: 1, user_id: 3, user: users[2], role: MafiaRole.MAFIA, seat: null },
  ];
  const logRows: Row[] = [{ id: 5, event_id: 1, round: 1, cycle: 1, phase: 'night', type: 'kill', target_user_id: 3, created_at: new Date(), target: users[2] }];

  const matches = (row: Row, where: Row): boolean => Object.entries(where).every(([k, v]) => row[k] === v);
  const repos = new Map<string, Row>([
    ['User', {
      findOne: async ({ where }: { where: Row }) => users.find((u) => matches(u, where)) ?? null,
      save: async (u: Row) => u,
      update: async () => undefined,
    }],
    ['MafiaEvent', {
      findOne: async ({ where }: { where: Row }) => (where['id'] === event['id'] ? event : null),
    }],
    ['MafiaParticipant', {
      find: async () => participants,
      findOne: async ({ where }: { where: Row }) => participants.find((p) => matches(p, where)) ?? null,
    }],
    ['MafiaLogEntry', {
      create: (data: Row) => ({ ...data }),
      save: async (row: Row) => { row['id'] = 100 + logRows.length; row['created_at'] = new Date(); logRows.push(row); return row; },
      findOne: async ({ where }: { where: Row }) => logRows.find((r) => matches(r, where)) ?? null,
      find: async () => logRows,
      delete: async (id: number) => { logRows.splice(logRows.findIndex((r) => r['id'] === id), 1); },
    }],
    // GroupService.isUserAdmin reads group members; nobody is an admin here
    ['GroupMember', { findOne: async () => null }],
  ]);
  const manager = { getRepository: (entity: { name: string }) => repos.get(entity.name) };
  const db = {
    getRepository: manager.getRepository,
    dataSource: { transaction: async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager) },
  };

  const router = createMafiaRouter(db as never, {} as never, async () => true);
  return { router, logRows };
}

interface Reply {
  status: number;
  body: Record<string, any>;
}

/** Drives the router directly: an express Router is a plain (req, res, next) function. */
function request(router: Router, options: { method: string; url: string; body?: unknown }): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = {
      method: options.method,
      url: options.url,
      originalUrl: options.url,
      headers: {} as Record<string, string>,
      query: {},
      body: options.body,
    };
    const res = {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this; },
      json(payload: Record<string, unknown>) { resolve({ status: this.statusCode, body: payload }); },
    };
    (router as unknown as (req: unknown, res: unknown, next: (err?: unknown) => void) => void)(
      req,
      res,
      (err?: unknown) => (err ? reject(err) : resolve({ status: 404, body: {} })),
    );
  });
}

const killBody = { cycle: 1, phase: 'night', type: 'kill', target_user_id: 3 };

describe('mafia log routes: access', () => {
  test('a non-host gets 403 on all three endpoints and nothing is written or removed', async () => {
    const { router, logRows } = makeRouter(false);

    for (const options of [
      { method: 'GET', url: '/1/log' },
      { method: 'POST', url: '/1/log', body: killBody },
      { method: 'DELETE', url: '/1/log/5' },
    ]) {
      const reply = await request(router, options);
      assert.equal(reply.status, 403, `${options.method} ${options.url}`);
      assert.deepEqual(reply.body, { error: 'Host only' });
    }
    assert.equal(logRows.length, 1);
  });
});

describe('mafia log routes: host', () => {
  test('GET returns the log with the derived state', async () => {
    const { router } = makeRouter(true);
    const reply = await request(router, { method: 'GET', url: '/1/log' });

    assert.equal(reply.status, 200);
    assert.equal(reply.body['entries'].length, 1);
    assert.equal(reply.body['entries'][0].type, 'kill');
    assert.deepEqual(reply.body['state'].dead, [3]);
  });

  test('POST answers 201 with the fresh log; a bad body is a 400', async () => {
    const { router, logRows } = makeRouter(true);

    const created = await request(router, { method: 'POST', url: '/1/log', body: { cycle: 1, phase: 'night', type: 'check', target_user_id: 3 } });
    assert.equal(created.status, 201);
    assert.equal(logRows.length, 2);
    assert.equal(created.body['entries'].find((e: Row) => e['type'] === 'check').target_role, MafiaRole.MAFIA);

    const bad = await request(router, { method: 'POST', url: '/1/log', body: { cycle: 1, phase: 'day', type: 'kill', target_user_id: 3 } });
    assert.equal(bad.status, 400);
    assert.equal(logRows.length, 2);
  });

  test('DELETE answers with the fresh log; an unknown entry is a 409', async () => {
    const { router, logRows } = makeRouter(true);

    const deleted = await request(router, { method: 'DELETE', url: '/1/log/5' });
    assert.equal(deleted.status, 200);
    assert.equal(logRows.length, 0);
    assert.deepEqual(deleted.body['entries'], []);

    const missing = await request(router, { method: 'DELETE', url: '/1/log/5' });
    assert.equal(missing.status, 409);
  });

  test('a malformed entry id is a 400', async () => {
    const { router } = makeRouter(true);
    const reply = await request(router, { method: 'DELETE', url: '/1/log/abc' });
    assert.equal(reply.status, 400);
  });
});
