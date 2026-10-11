import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { PaymentService } from '../../services/PaymentService';

interface QueryCall {
  sql: string;
  params: unknown[];
}

function makeService(rows: unknown[] = []): { service: PaymentService; calls: QueryCall[] } {
  const calls: QueryCall[] = [];
  const db = {
    dataSource: {
      query: async (sql: string, params: unknown[]): Promise<unknown[]> => {
        calls.push({ sql, params });
        return rows;
      },
    },
  } as never;
  return { service: new PaymentService(db), calls };
}

describe('PaymentService reads', () => {
  test('getTrainingMemberPayments passes group and month and returns rows as-is', async () => {
    const rows = [{ user_id: 1, first_name: 'A', last_name: null, username: null, amount: '10.00' }];
    const { service, calls } = makeService(rows);

    const result = await service.getTrainingMemberPayments(7, '2026-03');

    assert.deepEqual(result, rows);
    assert.deepEqual(calls[0].params, [7, '2026-03']);
    assert.match(calls[0].sql, /WITH relevant_users/);
    assert.match(calls[0].sql, /p\.game_id IS NULL/);
  });

  test('getGameParticipantPayments filters confirmed and guest participants by game', async () => {
    const { service, calls } = makeService();

    await service.getGameParticipantPayments(42);

    assert.deepEqual(calls[0].params, [42]);
    assert.match(calls[0].sql, /participation_status IN \('confirmed', 'guest'\)/);
  });

  test('getTrainingPaid queries monthly payments without a game', async () => {
    const rows = [{ first_name: 'B', last_name: 'C', amount: '5.50' }];
    const { service, calls } = makeService(rows);

    const result = await service.getTrainingPaid(3, '2026-01');

    assert.deepEqual(result, rows);
    assert.deepEqual(calls[0].params, [3, '2026-01']);
    assert.match(calls[0].sql, /p\.period_month = \$2/);
    assert.match(calls[0].sql, /p\.game_id IS NULL/);
  });

  test('getGamePaid queries payments of one game including guests', async () => {
    const rows = [{ first_name: null, last_name: null, guest_name: 'Vasya', amount: '3' }];
    const { service, calls } = makeService(rows);

    const result = await service.getGamePaid(9);

    assert.deepEqual(result, rows);
    assert.deepEqual(calls[0].params, [9]);
    assert.match(calls[0].sql, /LEFT JOIN users/);
    assert.match(calls[0].sql, /p\.game_id = \$1/);
  });
});

describe('PaymentService upserts', () => {
  test('upsertTrainingPayment conflicts on (group_id, period_month, user_id)', async () => {
    const { service, calls } = makeService();

    await service.upsertTrainingPayment(1, '2026-02', 5, 12.5, 99);

    assert.match(calls[0].sql, /ON CONFLICT \(group_id, period_month, user_id\)/);
    assert.match(calls[0].sql, /WHERE game_id IS NULL AND user_id IS NOT NULL/);
    assert.deepEqual(calls[0].params, [1, '2026-02', 5, 12.5, 99]);
  });

  test('upsertGameUserPayment conflicts on (game_id, user_id)', async () => {
    const { service, calls } = makeService();

    await service.upsertGameUserPayment(1, 20, 5, 8, 99);

    assert.match(calls[0].sql, /ON CONFLICT \(game_id, user_id\)/);
    assert.match(calls[0].sql, /WHERE game_id IS NOT NULL AND user_id IS NOT NULL/);
    assert.deepEqual(calls[0].params, [1, 20, 5, 8, 99]);
  });

  test('upsertGameGuestPayment conflicts on (game_id, guest_name)', async () => {
    const { service, calls } = makeService();

    await service.upsertGameGuestPayment(1, 20, 'Guest', 8, 99);

    assert.match(calls[0].sql, /ON CONFLICT \(game_id, guest_name\)/);
    assert.match(calls[0].sql, /WHERE game_id IS NOT NULL AND user_id IS NULL/);
    assert.deepEqual(calls[0].params, [1, 20, 'Guest', 8, 99]);
  });
});
