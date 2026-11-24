import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Router } from 'express';

// The router mounts verifyTelegramInitData; the dev bypass below is the documented way to drive
// it without signing init data. Must be set before the router handles its first request.
process.env['NODE_ENV'] = 'development';
process.env['SKIP_TELEGRAM_AUTH'] = 'true';
process.env['BOT_TOKEN'] = 'test-token';

import { createUserRouter } from '../../webapp/routes/user';
import { Gender } from '../../models/Gender';
import { GroupRole } from '../../models/GroupMember';

/** The telegram id the dev bypass attaches to the request. */
const CALLER_TELEGRAM_ID = 0;

interface FakeUser {
  id: number;
  telegram_id: number;
  first_name?: string;
  last_name?: string | null;
  username?: string | null;
  gender?: Gender | null;
}

interface Membership {
  user_id: number;
  group_id: number;
  role: GroupRole;
}

interface Harness {
  router: Router;
  users: Map<number, FakeUser>;
  membershipLookups: number;
}

/** Router over in-memory repositories; `members` decides who is an admin of which group. */
function makeHarness(users: FakeUser[], members: Membership[] = []): Harness {
  const byId = new Map(users.map((u) => [u.id, { ...u }]));
  const harness: Harness = { router: null as unknown as Router, users: byId, membershipLookups: 0 };

  const userRepo = {
    findOne: async ({ where }: { where: Record<string, unknown> }) =>
      [...byId.values()].find((u) =>
        Object.entries(where).every(([key, value]) => (u as Record<string, unknown>)[key] === value),
      ) ?? null,
    create: (data: FakeUser) => data,
    save: async (u: FakeUser) => { byId.set(u.id, u); return u; },
    update: async (id: number, patch: Partial<FakeUser>) => {
      const user = byId.get(id);
      if (user) Object.assign(user, patch);
    },
  };

  const memberRepo = {
    findOne: async ({ where }: { where: { user_id: number; group_id: number } }) => {
      harness.membershipLookups += 1;
      return members.find((m) => m.user_id === where.user_id && m.group_id === where.group_id) ?? null;
    },
    find: async ({ where }: { where: { group_id: number } }) =>
      members
        .filter((m) => m.group_id === where.group_id)
        .map((m) => ({ ...m, user: byId.get(m.user_id) })),
  };

  const db = {
    getRepository: (entity: { name: string }) => (entity.name === 'User' ? userRepo : memberRepo),
  };

  harness.router = createUserRouter(db as never);
  return harness;
}

interface Reply {
  status: number;
  body: Record<string, unknown>;
}

/** Drives the router directly: an express Router is a plain (req, res, next) function. */
function request(
  router: Router,
  options: { method: string; url: string; query?: Record<string, string>; body?: unknown },
): Promise<Reply> {
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
      json(payload: Record<string, unknown>) { resolve({ status: this.statusCode, body: payload }); },
    };
    (router as unknown as (req: unknown, res: unknown, next: (err?: unknown) => void) => void)(
      req,
      res,
      (err?: unknown) => (err ? reject(err) : resolve({ status: 404, body: {} })),
    );
  });
}

const caller: FakeUser = {
  id: 1, telegram_id: CALLER_TELEGRAM_ID, first_name: 'Dev', username: 'dev', gender: null,
};
const other: FakeUser = { id: 2, telegram_id: 777, first_name: 'Mia', gender: null };

const adminOf = (groupId: number): Membership[] => [
  { user_id: 1, group_id: groupId, role: GroupRole.ADMIN },
  { user_id: 2, group_id: groupId, role: GroupRole.MEMBER },
];

describe('GET /api/user/me', () => {
  test('returns the caller profile without private fields', async () => {
    const h = makeHarness([{ ...caller, gender: Gender.FEMALE }]);
    const reply = await request(h.router, { method: 'GET', url: '/me' });

    assert.equal(reply.status, 200);
    assert.deepEqual(Object.keys(reply.body).sort(), ['first_name', 'gender', 'id', 'last_name', 'username']);
    assert.equal(reply.body['gender'], Gender.FEMALE);
  });
});

describe('PATCH /api/user/me', () => {
  test('sets the own gender without any admin membership', async () => {
    const h = makeHarness([caller]);
    const reply = await request(h.router, { method: 'PATCH', url: '/me', body: { gender: 'female' } });

    assert.equal(reply.status, 200);
    assert.equal(reply.body['gender'], Gender.FEMALE);
    assert.equal(h.users.get(1)?.gender, Gender.FEMALE);
    assert.equal(h.membershipLookups, 0, 'a self-service route must not ask about group membership');
  });

  test('null clears the gender', async () => {
    const h = makeHarness([{ ...caller, gender: Gender.MALE }]);
    const reply = await request(h.router, { method: 'PATCH', url: '/me', body: { gender: null } });

    assert.equal(reply.status, 200);
    assert.equal(reply.body['gender'], null);
    assert.equal(h.users.get(1)?.gender, null);
  });

  test('rejects anything that is not a known gender', async () => {
    for (const gender of ['м', 'other', 'MALE', 123, true, {}, ['male']]) {
      const h = makeHarness([caller]);
      const reply = await request(h.router, { method: 'PATCH', url: '/me', body: { gender } });

      assert.equal(reply.status, 400, JSON.stringify(gender));
      assert.equal(reply.body['error'], 'Invalid gender');
      assert.equal(h.users.get(1)?.gender, null, 'a rejected body must not change anything');
    }
  });

  test('a body without a gender is rejected rather than silently ignored', async () => {
    const h = makeHarness([caller]);
    const reply = await request(h.router, { method: 'PATCH', url: '/me', body: {} });

    assert.equal(reply.status, 400);
    assert.equal(reply.body['error'], 'gender is required');
  });

  test('it never touches another user', async () => {
    const h = makeHarness([caller, other]);
    await request(h.router, { method: 'PATCH', url: '/me', body: { gender: 'male' } });

    assert.equal(h.users.get(2)?.gender, null);
    assert.equal(h.users.get(2)?.first_name, 'Mia');
  });
});

describe('PATCH /api/user/:id/profile', () => {
  test('an admin changes a member name and gender in one request', async () => {
    const h = makeHarness([caller, other], adminOf(5));
    const reply = await request(h.router, {
      method: 'PATCH',
      url: '/2/profile',
      query: { group_id: '5' },
      body: { first_name: ' Mia ', last_name: 'Wallace', gender: 'female' },
    });

    assert.equal(reply.status, 200);
    const updated = h.users.get(2)!;
    assert.equal(updated.first_name, 'Mia');
    assert.equal(updated.last_name, 'Wallace');
    assert.equal(updated.gender, Gender.FEMALE);
  });

  test('an empty last_name clears it, an absent gender leaves it alone', async () => {
    const h = makeHarness([caller, { ...other, last_name: 'Wallace', gender: Gender.FEMALE }], adminOf(5));
    const reply = await request(h.router, {
      method: 'PATCH',
      url: '/2/profile',
      query: { group_id: '5' },
      body: { first_name: 'Mia', last_name: '' },
    });

    assert.equal(reply.status, 200);
    assert.equal(h.users.get(2)?.last_name, null);
    assert.equal(h.users.get(2)?.gender, Gender.FEMALE);
  });

  test('a non-admin is refused', async () => {
    const h = makeHarness([caller, other], [{ user_id: 1, group_id: 5, role: GroupRole.MEMBER }]);
    const reply = await request(h.router, {
      method: 'PATCH',
      url: '/2/profile',
      query: { group_id: '5' },
      body: { first_name: 'Zoe', gender: 'female' },
    });

    assert.equal(reply.status, 403);
    assert.equal(h.users.get(2)?.first_name, 'Mia');
    assert.equal(h.users.get(2)?.gender, null);
  });

  test('an invalid gender is rejected before anything is written', async () => {
    const h = makeHarness([caller, other], adminOf(5));
    const reply = await request(h.router, {
      method: 'PATCH',
      url: '/2/profile',
      query: { group_id: '5' },
      body: { first_name: 'Zoe', gender: 'ж' },
    });

    assert.equal(reply.status, 400);
    assert.equal(reply.body['error'], 'Invalid gender');
    assert.equal(h.users.get(2)?.first_name, 'Mia');
  });

  test('an empty first name is still rejected', async () => {
    const h = makeHarness([caller, other], adminOf(5));
    const reply = await request(h.router, {
      method: 'PATCH',
      url: '/2/profile',
      query: { group_id: '5' },
      body: { first_name: '   ' },
    });

    assert.equal(reply.status, 400);
    assert.equal(reply.body['error'], 'first_name is required');
  });

  test('the replaced /name route is gone', async () => {
    const h = makeHarness([caller, other], adminOf(5));
    const reply = await request(h.router, {
      method: 'PATCH',
      url: '/2/name',
      query: { group_id: '5' },
      body: { first_name: 'Zoe' },
    });

    assert.equal(reply.status, 404);
  });
});

describe('GET /api/user/members', () => {
  test('carries the gender of every member', async () => {
    const h = makeHarness([caller, { ...other, gender: Gender.FEMALE }], adminOf(5));
    const reply = await request(h.router, { method: 'GET', url: '/members', query: { group_id: '5' } });

    assert.equal(reply.status, 200);
    const members = reply.body as unknown as Array<Record<string, unknown>>;
    assert.deepEqual(members.map((m) => m['gender']), [null, Gender.FEMALE]);
  });
});
