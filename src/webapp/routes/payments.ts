import { Router, Response } from 'express';
import { AuthRequest } from '../types/express';
import { Database } from '../../database/Database';
import { UserService } from '../../services/UserService';
import { GroupService } from '../../services/GroupService';
import { GameService } from '../../services/GameService';
import { verifyTelegramInitData } from '../middleware/telegramAuth';
import { GameType } from '../../models/GameType';

/** Returns 'YYYY-MM' for the current month in UTC. */
function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Validates that a string matches 'YYYY-MM'. */
function isValidMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function createPaymentsRouter(db: Database): Router {
  const router = Router();
  const userService = new UserService(db);
  const groupService = new GroupService(db);
  const gameService = new GameService(db);

  // ── GET /api/payments ────────────────────────────────────────────────────
  //
  // For GAME:      ?game_id=X
  //   Returns confirmed+guest participants of that game with their payment amounts.
  //
  // For TRAINING:  ?game_id=X&month=YYYY-MM   (month defaults to current)
  //   Returns all group members with their payment amounts for that month.
  //
  // Only group admins may access this endpoint.
  router.get('/', verifyTelegramInitData, async (req: AuthRequest, res: Response): Promise<void> => {
    const telegramUser = req.telegramUser;
    const gameId = parseInt(req.query['game_id'] as string);
    const monthParam = (req.query['month'] as string | undefined) ?? currentMonth();

    if (!telegramUser || isNaN(gameId)) {
      res.status(400).json({ error: 'game_id is required' });
      return;
    }
    if (!isValidMonth(monthParam)) {
      res.status(400).json({ error: 'month must be in YYYY-MM format' });
      return;
    }

    try {
      const user = await userService.findOrCreateUser({
        id: telegramUser.id,
        username: telegramUser.username,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name,
      });

      const game = await gameService.getGameById(gameId);
      if (!game) {
        res.status(404).json({ error: 'Game not found' });
        return;
      }

      const isAdmin = await groupService.isUserAdmin(user.id, game.group_id);
      if (!isAdmin) {
        res.status(403).json({ error: 'Only group admins can view payments' });
        return;
      }

      let people: Array<{
        user_id: number | null;
        guest_name: string | null;
        first_name?: string;
        last_name?: string;
        username?: string;
        payment_amount: number | null;
      }> = [];

      if (game.type === GameType.TRAINING) {
        // Training: load group members + their payment for the chosen month
        const rows = await db.dataSource.query<Array<{
          user_id: number;
          first_name: string | null;
          last_name: string | null;
          username: string | null;
          amount: string | null;
        }>>(
          `SELECT gm.user_id, u.first_name, u.last_name, u.username,
                  p.amount
           FROM group_members gm
           JOIN users u ON u.id = gm.user_id
           LEFT JOIN payments p
             ON p.group_id     = $1
            AND p.period_month = $2
            AND p.user_id      = gm.user_id
            AND p.game_id IS NULL
           WHERE gm.group_id = $1
           ORDER BY u.first_name, u.last_name`,
          [game.group_id, monthParam],
        );
        people = rows.map((r) => ({
          user_id:        r.user_id,
          guest_name:     null,
          first_name:     r.first_name ?? undefined,
          last_name:      r.last_name ?? undefined,
          username:       r.username ?? undefined,
          payment_amount: r.amount != null ? parseFloat(r.amount) : null,
        }));
      } else {
        // Game: load confirmed+guest participants + their payment for this game
        const rows = await db.dataSource.query<Array<{
          user_id: number | null;
          guest_name: string | null;
          first_name: string | null;
          last_name: string | null;
          username: string | null;
          amount: string | null;
        }>>(
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
        people = rows.map((r) => ({
          user_id:        r.user_id,
          guest_name:     r.guest_name,
          first_name:     r.first_name ?? undefined,
          last_name:      r.last_name ?? undefined,
          username:       r.username ?? undefined,
          payment_amount: r.amount != null ? parseFloat(r.amount) : null,
        }));
      }

      const total = people.reduce((sum, p) => sum + (p.payment_amount ?? 0), 0);
      res.json({ people, total, month: monthParam });
    } catch (error) {
      console.error('Error fetching payments:', error);
      res.status(500).json({ error: 'Failed to fetch payments' });
    }
  });

  // ── POST /api/payments/upsert ────────────────────────────────────────────
  //
  // For GAME:     body: { game_id, user_id?, guest_name?, amount }
  // For TRAINING: body: { game_id, user_id, amount, month? }
  //   game_id is provided so we can resolve group_id and validate admin role.
  //
  // Only group admins may call this.
  router.post('/upsert', verifyTelegramInitData, async (req: AuthRequest, res: Response): Promise<void> => {
    const telegramUser = req.telegramUser;

    const {
      game_id,
      user_id,
      guest_name,
      amount,
      month,
    }: {
      game_id: unknown;
      user_id?: unknown;
      guest_name?: unknown;
      amount: unknown;
      month?: unknown;
    } = req.body;

    const parsedGameId = parseInt(String(game_id));
    const parsedAmount = parseFloat(String(amount));
    const monthStr: string = typeof month === 'string' && isValidMonth(month) ? month : currentMonth();

    if (!telegramUser || isNaN(parsedGameId) || isNaN(parsedAmount) || parsedAmount < 0) {
      res.status(400).json({ error: 'game_id and a non-negative amount are required' });
      return;
    }
    if (user_id == null && !guest_name) {
      res.status(400).json({ error: 'Either user_id or guest_name must be provided' });
      return;
    }

    try {
      const admin = await userService.findOrCreateUser({
        id: telegramUser.id,
        username: telegramUser.username,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name,
      });

      const game = await gameService.getGameById(parsedGameId);
      if (!game) {
        res.status(404).json({ error: 'Game not found' });
        return;
      }

      const isAdmin = await groupService.isUserAdmin(admin.id, game.group_id);
      if (!isAdmin) {
        res.status(403).json({ error: 'Only group admins can confirm payments' });
        return;
      }

      const parsedUserId = user_id != null ? parseInt(String(user_id)) : null;

      if (game.type === GameType.TRAINING) {
        // Training: upsert by (group_id, period_month, user_id)
        if (parsedUserId == null) {
          res.status(400).json({ error: 'user_id is required for training payments' });
          return;
        }
        await db.dataSource.query(
          `INSERT INTO payments
             (group_id, game_id, period_month, user_id, amount, confirmed_by, confirmed_at, updated_at)
           VALUES ($1, NULL, $2, $3, $4, $5, NOW(), NOW())
           ON CONFLICT (group_id, period_month, user_id)
             WHERE game_id IS NULL AND user_id IS NOT NULL
           DO UPDATE SET
             amount       = EXCLUDED.amount,
             confirmed_by = EXCLUDED.confirmed_by,
             updated_at   = NOW()`,
          [game.group_id, monthStr, parsedUserId, parsedAmount, admin.id],
        );
      } else {
        // Game: upsert by (game_id, user_id) or manual upsert for guests
        if (parsedUserId != null) {
          await db.dataSource.query(
            `INSERT INTO payments
               (group_id, game_id, period_month, user_id, amount, confirmed_by, confirmed_at, updated_at)
             VALUES ($1, $2, NULL, $3, $4, $5, NOW(), NOW())
             ON CONFLICT (game_id, user_id)
               WHERE game_id IS NOT NULL AND user_id IS NOT NULL
             DO UPDATE SET
               amount       = EXCLUDED.amount,
               confirmed_by = EXCLUDED.confirmed_by,
               updated_at   = NOW()`,
            [game.group_id, parsedGameId, parsedUserId, parsedAmount, admin.id],
          );
        } else {
          // Guest: try insert, then update if already exists
          const inserted = await db.dataSource.query(
            `INSERT INTO payments
               (group_id, game_id, period_month, guest_name, amount, confirmed_by, confirmed_at, updated_at)
             VALUES ($1, $2, NULL, $3, $4, $5, NOW(), NOW())
             ON CONFLICT DO NOTHING`,
            [game.group_id, parsedGameId, String(guest_name), parsedAmount, admin.id],
          );
          if (Array.isArray(inserted) && inserted[1] === 0) {
            await db.dataSource.query(
              `UPDATE payments
                  SET amount       = $3,
                      confirmed_by = $4,
                      updated_at   = NOW()
                WHERE game_id = $1 AND guest_name = $2`,
              [parsedGameId, String(guest_name), parsedAmount, admin.id],
            );
          }
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error upserting payment:', error);
      res.status(500).json({ error: 'Failed to save payment' });
    }
  });

  // ── GET /api/payments/training ──────────────────────────────────────────
  //
  // ?group_id=X&month=YYYY-MM  (month defaults to current month)
  // Returns all group members with their training payment status for the given month.
  // Only group admins may access this endpoint.
  router.get('/training', verifyTelegramInitData, async (req: AuthRequest, res: Response): Promise<void> => {
    const telegramUser = req.telegramUser;
    const groupId = parseInt(req.query['group_id'] as string);
    const monthParam = (req.query['month'] as string | undefined) ?? currentMonth();

    if (!telegramUser || isNaN(groupId)) {
      res.status(400).json({ error: 'group_id is required' });
      return;
    }
    if (!isValidMonth(monthParam)) {
      res.status(400).json({ error: 'month must be in YYYY-MM format' });
      return;
    }

    try {
      const user = await userService.findOrCreateUser({
        id: telegramUser.id,
        username: telegramUser.username,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name,
      });

      const isAdmin = await groupService.isUserAdmin(user.id, groupId);
      if (!isAdmin) {
        res.status(403).json({ error: 'Only group admins can view payments' });
        return;
      }

      const rows = await db.dataSource.query<Array<{
        user_id: number;
        first_name: string | null;
        last_name: string | null;
        username: string | null;
        amount: string | null;
      }>>(
        `SELECT gm.user_id, u.first_name, u.last_name, u.username,
                p.amount
         FROM group_members gm
         JOIN users u ON u.id = gm.user_id
         LEFT JOIN payments p
           ON p.group_id     = $1
          AND p.period_month = $2
          AND p.user_id      = gm.user_id
          AND p.game_id IS NULL
         WHERE gm.group_id = $1
         ORDER BY u.first_name, u.last_name`,
        [groupId, monthParam],
      );

      const people = rows.map((r) => ({
        user_id:        r.user_id,
        guest_name:     null as null,
        first_name:     r.first_name ?? undefined,
        last_name:      r.last_name ?? undefined,
        username:       r.username ?? undefined,
        payment_amount: r.amount != null ? parseFloat(r.amount) : null,
      }));

      const total = people.reduce((sum, p) => sum + (p.payment_amount ?? 0), 0);
      res.json({ people, total, month: monthParam });
    } catch (error) {
      console.error('Error fetching training payments:', error);
      res.status(500).json({ error: 'Failed to fetch training payments' });
    }
  });

  // ── POST /api/payments/training/upsert ──────────────────────────────────
  //
  // Body: { group_id, user_id, amount, month? }
  // Upserts a monthly training payment for a group member.
  // Only group admins may call this.
  router.post('/training/upsert', verifyTelegramInitData, async (req: AuthRequest, res: Response): Promise<void> => {
    const telegramUser = req.telegramUser;

    const {
      group_id,
      user_id,
      amount,
      month,
    }: {
      group_id: unknown;
      user_id: unknown;
      amount: unknown;
      month?: unknown;
    } = req.body;

    const parsedGroupId = parseInt(String(group_id));
    const parsedUserId  = parseInt(String(user_id));
    const parsedAmount  = parseFloat(String(amount));
    const monthStr: string = typeof month === 'string' && isValidMonth(month) ? month : currentMonth();

    if (!telegramUser || isNaN(parsedGroupId) || isNaN(parsedUserId) || isNaN(parsedAmount) || parsedAmount < 0) {
      res.status(400).json({ error: 'group_id, user_id and a non-negative amount are required' });
      return;
    }

    try {
      const admin = await userService.findOrCreateUser({
        id: telegramUser.id,
        username: telegramUser.username,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name,
      });

      const isAdmin = await groupService.isUserAdmin(admin.id, parsedGroupId);
      if (!isAdmin) {
        res.status(403).json({ error: 'Only group admins can confirm payments' });
        return;
      }

      await db.dataSource.query(
        `INSERT INTO payments
           (group_id, game_id, period_month, user_id, amount, confirmed_by, confirmed_at, updated_at)
         VALUES ($1, NULL, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (group_id, period_month, user_id)
           WHERE game_id IS NULL AND user_id IS NOT NULL
         DO UPDATE SET
           amount       = EXCLUDED.amount,
           confirmed_by = EXCLUDED.confirmed_by,
           updated_at   = NOW()`,
        [parsedGroupId, monthStr, parsedUserId, parsedAmount, admin.id],
      );

      res.json({ success: true });
    } catch (error) {
      console.error('Error upserting training payment:', error);
      res.status(500).json({ error: 'Failed to save training payment' });
    }
  });

  return router;
}
