import { Database } from '../database/Database';

export interface TrainingMemberPaymentRow {
  user_id: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  amount: string | null;
}

export interface GameParticipantPaymentRow {
  user_id: number | null;
  guest_name: string | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  amount: string | null;
}

export interface TrainingPaidRow {
  first_name: string | null;
  last_name: string | null;
  amount: string;
}

export interface GamePaidRow {
  first_name: string | null;
  last_name: string | null;
  guest_name: string | null;
  amount: string;
}

export class PaymentService {
  private db: Database;

  constructor(database: Database) {
    this.db = database;
  }

  /** Group members (plus anyone who already paid) with their training payment for the month. */
  async getTrainingMemberPayments(groupId: number, month: string): Promise<TrainingMemberPaymentRow[]> {
    return this.db.dataSource.query<TrainingMemberPaymentRow[]>(
      `WITH relevant_users AS (
         SELECT user_id FROM group_members WHERE group_id = $1 AND is_active = true
         UNION
         SELECT user_id FROM payments WHERE group_id = $1 AND period_month = $2 AND game_id IS NULL AND user_id IS NOT NULL
       )
       SELECT ru.user_id, u.first_name, u.last_name, u.username,
              p.amount
       FROM relevant_users ru
       JOIN users u ON u.id = ru.user_id
       LEFT JOIN payments p
         ON p.group_id     = $1
        AND p.period_month = $2
        AND p.user_id      = ru.user_id
        AND p.game_id IS NULL
       ORDER BY u.first_name, u.last_name`,
      [groupId, month],
    );
  }

  /** Confirmed and guest participants of a game with their payment for that game. */
  async getGameParticipantPayments(gameId: number): Promise<GameParticipantPaymentRow[]> {
    return this.db.dataSource.query<GameParticipantPaymentRow[]>(
      `SELECT gp.user_id, gp.guest_name, u.first_name, u.last_name, u.username,
              p.amount
       FROM game_participants gp
       LEFT JOIN users u ON u.id = gp.user_id
       LEFT JOIN payments p
         ON p.game_id = gp.game_id
        AND (
              (p.user_id IS NOT NULL AND p.user_id = gp.user_id)
           OR (p.guest_name IS NOT NULL AND p.guest_name = gp.guest_name)
        )
       WHERE gp.game_id = $1
         AND gp.participation_status IN ('confirmed', 'guest')
       ORDER BY gp.position, gp.joined_at`,
      [gameId],
    );
  }

  /** Users who have paid for training in the group for the month. */
  async getTrainingPaid(groupId: number, month: string): Promise<TrainingPaidRow[]> {
    return this.db.dataSource.query<TrainingPaidRow[]>(
      `SELECT u.first_name, u.last_name, p.amount
       FROM payments p
       JOIN users u ON u.id = p.user_id
       WHERE p.group_id = $1
         AND p.period_month = $2
         AND p.game_id IS NULL`,
      [groupId, month],
    );
  }

  /** Everyone (members and guests) who has paid for a game. */
  async getGamePaid(gameId: number): Promise<GamePaidRow[]> {
    return this.db.dataSource.query<GamePaidRow[]>(
      `SELECT u.first_name, u.last_name, p.guest_name, p.amount
       FROM payments p
       LEFT JOIN users u ON u.id = p.user_id
       WHERE p.game_id = $1`,
      [gameId],
    );
  }

  /** Monthly training payment, unique per (group, month, user). */
  async upsertTrainingPayment(
    groupId: number,
    month: string,
    userId: number,
    amount: number,
    confirmedBy: number,
  ): Promise<void> {
    await this.db.dataSource.query(
      `INSERT INTO payments
         (group_id, game_id, period_month, user_id, amount, confirmed_by, confirmed_at, updated_at)
       VALUES ($1, NULL, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (group_id, period_month, user_id)
         WHERE game_id IS NULL AND user_id IS NOT NULL
       DO UPDATE SET
         amount       = EXCLUDED.amount,
         confirmed_by = EXCLUDED.confirmed_by,
         updated_at   = NOW()`,
      [groupId, month, userId, amount, confirmedBy],
    );
  }

  /** Per-game payment of a registered user, unique per (game, user). */
  async upsertGameUserPayment(
    groupId: number,
    gameId: number,
    userId: number,
    amount: number,
    confirmedBy: number,
  ): Promise<void> {
    await this.db.dataSource.query(
      `INSERT INTO payments
         (group_id, game_id, period_month, user_id, amount, confirmed_by, confirmed_at, updated_at)
       VALUES ($1, $2, NULL, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (game_id, user_id)
         WHERE game_id IS NOT NULL AND user_id IS NOT NULL
       DO UPDATE SET
         amount       = EXCLUDED.amount,
         confirmed_by = EXCLUDED.confirmed_by,
         updated_at   = NOW()`,
      [groupId, gameId, userId, amount, confirmedBy],
    );
  }

  /** Per-game payment of a guest, unique per (game, guest_name), see uq_payments_game_guest. */
  async upsertGameGuestPayment(
    groupId: number,
    gameId: number,
    guestName: string,
    amount: number,
    confirmedBy: number,
  ): Promise<void> {
    await this.db.dataSource.query(
      `INSERT INTO payments
         (group_id, game_id, period_month, guest_name, amount, confirmed_by, confirmed_at, updated_at)
       VALUES ($1, $2, NULL, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (game_id, guest_name)
         WHERE game_id IS NOT NULL AND user_id IS NULL
       DO UPDATE SET
         amount       = EXCLUDED.amount,
         confirmed_by = EXCLUDED.confirmed_by,
         updated_at   = NOW()`,
      [groupId, gameId, guestName, amount, confirmedBy],
    );
  }
}
