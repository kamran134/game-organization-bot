import { Router, Response } from 'express';
import { AuthRequest } from '../types/express';
import { Database } from '../../database/Database';
import { UserService } from '../../services/UserService';
import { GroupService } from '../../services/GroupService';
import { GameService } from '../../services/GameService';
import { verifyTelegramInitData } from '../middleware/telegramAuth';
import { GameType } from '../../models/GameType';

export function createPaymentsRouter(db: Database): Router {
  const router = Router();
  const userService = new UserService(db);
  const groupService = new GroupService(db);
  const gameService = new GameService(db);

  // ── GET /api/payments?game_id=X ──────────────────────────────────────────
  // Returns payment records for a given game, plus the list of people to collect from.
  // For GAME type: list comes from confirmed+guest participants.
  // For TRAINING type: list comes from group members.
  // Only accessible by group admins.
  router.get('/', verifyTelegramInitData, async (req: AuthRequest, res: Response): Promise<void> => {
    const telegramUser = req.telegramUser;
    const gameId = parseInt(req.query['game_id'] as string);

    if (!telegramUser || isNaN(gameId)) {
      res.status(400).json({ error: 'game_id is required' });
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

      // Load existing payments
      const payments = await db.dataSource.query<Array<{
        id: number;
        user_id: number | null;
        guest_name: string | null;
        amount: string;
        confirmed_at: string;
      }>>(
        `SELECT id, user_id, guest_name, amount, confirmed_at
         FROM payments
         WHERE game_id = $1`,
        [gameId],
      );

      // Build the "people to collect from" list
      let people: Array<{
        user_id: number | null;
        guest_name: string | null;
        first_name?: string;
        last_name?: string;
        username?: string;
        payment_amount: number | null;
      }> = [];

      const paymentByUserId = new Map<number, number>();
      const paymentByGuestName = new Map<string, number>();
      for (const p of payments) {
        if (p.user_id != null) {
          paymentByUserId.set(p.user_id, parseFloat(p.amount));
        } else if (p.guest_name) {
          paymentByGuestName.set(p.guest_name, parseFloat(p.amount));
        }
      }

      if (game.type === GameType.TRAINING) {
        // Training: use all group members
        const membersResult = await db.dataSource.query<Array<{
          user_id: number;
          first_name: string | null;
          last_name: string | null;
          username: string | null;
        }>>(
          `SELECT gm.user_id, u.first_name, u.last_name, u.username
           FROM group_members gm
           JOIN users u ON u.id = gm.user_id
           WHERE gm.group_id = $1
           ORDER BY u.first_name, u.last_name`,
          [game.group_id],
        );
        people = membersResult.map((m) => ({
          user_id: m.user_id,
          guest_name: null,
          first_name: m.first_name ?? undefined,
          last_name: m.last_name ?? undefined,
          username: m.username ?? undefined,
          payment_amount: paymentByUserId.get(m.user_id) ?? null,
        }));
      } else {
        // Game: use confirmed + guest participants
        const participantsResult = await db.dataSource.query<Array<{
          user_id: number | null;
          guest_name: string | null;
          first_name: string | null;
          last_name: string | null;
          username: string | null;
        }>>(
          `SELECT gp.user_id, gp.guest_name, u.first_name, u.last_name, u.username
           FROM game_participants gp
           LEFT JOIN users u ON u.id = gp.user_id
           WHERE gp.game_id = $1
             AND gp.participation_status IN ('confirmed', 'guest')
           ORDER BY gp.position, gp.joined_at`,
          [gameId],
        );
        people = participantsResult.map((p) => {
          const amount =
            p.user_id != null
              ? (paymentByUserId.get(p.user_id) ?? null)
              : (p.guest_name ? (paymentByGuestName.get(p.guest_name) ?? null) : null);
          return {
            user_id: p.user_id,
            guest_name: p.guest_name,
            first_name: p.first_name ?? undefined,
            last_name: p.last_name ?? undefined,
            username: p.username ?? undefined,
            payment_amount: amount,
          };
        });
      }

      const total = people.reduce((sum, p) => sum + (p.payment_amount ?? 0), 0);

      res.json({ people, total });
    } catch (error) {
      console.error('Error fetching payments:', error);
      res.status(500).json({ error: 'Failed to fetch payments' });
    }
  });

  // ── POST /api/payments/upsert ────────────────────────────────────────────
  // Upserts a payment record for one person in a game.
  // Body: { game_id, user_id?, guest_name?, amount }
  // Only group admins can confirm payments.
  router.post('/upsert', verifyTelegramInitData, async (req: AuthRequest, res: Response): Promise<void> => {
    const telegramUser = req.telegramUser;

    const {
      game_id,
      user_id,
      guest_name,
      amount,
    }: {
      game_id: unknown;
      user_id?: unknown;
      guest_name?: unknown;
      amount: unknown;
    } = req.body;

    const parsedGameId = parseInt(String(game_id));
    const parsedAmount = parseFloat(String(amount));

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

      if (parsedUserId != null) {
        // Upsert by (game_id, user_id)
        await db.dataSource.query(
          `INSERT INTO payments (game_id, user_id, amount, confirmed_by, confirmed_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           ON CONFLICT (game_id, user_id) DO UPDATE
             SET amount       = EXCLUDED.amount,
                 confirmed_by = EXCLUDED.confirmed_by,
                 updated_at   = NOW()`,
          [parsedGameId, parsedUserId, parsedAmount, admin.id],
        );
      } else {
        // For guests there is no unique constraint on guest_name — use manual upsert
        await db.dataSource.query(
          `INSERT INTO payments (game_id, guest_name, amount, confirmed_by, confirmed_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           ON CONFLICT DO NOTHING`,
          [parsedGameId, String(guest_name), parsedAmount, admin.id],
        );
        // If ON CONFLICT did nothing (i.e. row existed), update manually
        await db.dataSource.query(
          `UPDATE payments
              SET amount       = $3,
                  confirmed_by = $4,
                  updated_at   = NOW()
            WHERE game_id = $1 AND guest_name = $2`,
          [parsedGameId, String(guest_name), parsedAmount, admin.id],
        );
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error upserting payment:', error);
      res.status(500).json({ error: 'Failed to save payment' });
    }
  });

  return router;
}
