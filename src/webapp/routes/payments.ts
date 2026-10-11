import { Router, Response } from 'express';
import { AuthRequest } from '../types/express';
import { Database } from '../../database/Database';
import { UserService } from '../../services/UserService';
import { GroupService } from '../../services/GroupService';
import { GameService } from '../../services/GameService';
import { PaymentService } from '../../services/PaymentService';
import { currentMonth, isValidMonth } from '../../utils/helpers';
import { verifyTelegramInitData } from '../middleware/telegramAuth';
import { requireUser, currentUser } from '../middleware/requireUser';
import { GameType } from '../../models/GameType';

export function createPaymentsRouter(db: Database): Router {
  const router = Router();
  const userService = new UserService(db);
  const groupService = new GroupService(db);
  const gameService = new GameService(db);
  const paymentService = new PaymentService(db);

  router.use(verifyTelegramInitData, requireUser(userService));

  // ── GET /api/payments ────────────────────────────────────────────────────
  //
  // For GAME:      ?game_id=X
  //   Returns confirmed+guest participants of that game with their payment amounts.
  //
  // For TRAINING:  ?game_id=X&month=YYYY-MM   (month defaults to current)
  //   Returns all group members with their payment amounts for that month.
  //
  // Only group admins may access this endpoint.
  router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
    const gameId = parseInt(req.query['game_id'] as string);
    const monthParam = (req.query['month'] as string | undefined) ?? currentMonth();

    if (isNaN(gameId)) {
      res.status(400).json({ error: 'game_id is required' });
      return;
    }
    if (!isValidMonth(monthParam)) {
      res.status(400).json({ error: 'month must be in YYYY-MM format' });
      return;
    }

    try {
      const user = currentUser(req);

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
        const rows = await paymentService.getTrainingMemberPayments(game.group_id, monthParam);
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
        const rows = await paymentService.getGameParticipantPayments(gameId);
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
  router.post('/upsert', async (req: AuthRequest, res: Response): Promise<void> => {
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

    if (isNaN(parsedGameId) || !Number.isFinite(parsedAmount) || parsedAmount < 0) {
      res.status(400).json({ error: 'game_id and a non-negative amount are required' });
      return;
    }
    if (user_id == null && !guest_name) {
      res.status(400).json({ error: 'Either user_id or guest_name must be provided' });
      return;
    }

    try {
      const admin = currentUser(req);

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
      if (parsedUserId != null && isNaN(parsedUserId)) {
        res.status(400).json({ error: 'Invalid user_id' });
        return;
      }

      if (game.type === GameType.TRAINING) {
        // Training: upsert by (group_id, period_month, user_id)
        if (parsedUserId == null) {
          res.status(400).json({ error: 'user_id is required for training payments' });
          return;
        }
        if (!(await groupService.isUserMember(parsedUserId, game.group_id))) {
          res.status(400).json({ error: 'user_id is not a member of this group' });
          return;
        }
        await paymentService.upsertTrainingPayment(game.group_id, monthStr, parsedUserId, parsedAmount, admin.id);
      } else {
        // Game: upsert by (game_id, user_id) or manual upsert for guests
        if (parsedUserId != null) {
          // A game payer is either someone signed up for this game or a current group member
          const isParticipant = game.participants?.some((p) => p.user_id === parsedUserId) ?? false;
          if (!isParticipant && !(await groupService.isUserMember(parsedUserId, game.group_id))) {
            res.status(400).json({ error: 'user_id is not a participant of this game' });
            return;
          }
          await paymentService.upsertGameUserPayment(game.group_id, parsedGameId, parsedUserId, parsedAmount, admin.id);
        } else {
          // Guest: upsert by (game_id, guest_name), see uq_payments_game_guest
          if (typeof guest_name !== 'string' || !guest_name.trim()) {
            res.status(400).json({ error: 'guest_name must be a non-empty string' });
            return;
          }
          await paymentService.upsertGameGuestPayment(game.group_id, parsedGameId, String(guest_name), parsedAmount, admin.id);
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
  router.get('/training', async (req: AuthRequest, res: Response): Promise<void> => {
    const groupId = parseInt(req.query['group_id'] as string);
    const monthParam = (req.query['month'] as string | undefined) ?? currentMonth();

    if (isNaN(groupId)) {
      res.status(400).json({ error: 'group_id is required' });
      return;
    }
    if (!isValidMonth(monthParam)) {
      res.status(400).json({ error: 'month must be in YYYY-MM format' });
      return;
    }

    try {
      const isAdmin = await groupService.isUserAdmin(currentUser(req).id, groupId);
      if (!isAdmin) {
        res.status(403).json({ error: 'Only group admins can view payments' });
        return;
      }

      const rows = await paymentService.getTrainingMemberPayments(groupId, monthParam);

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
  router.post('/training/upsert', async (req: AuthRequest, res: Response): Promise<void> => {
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

    if (isNaN(parsedGroupId) || isNaN(parsedUserId) || !Number.isFinite(parsedAmount) || parsedAmount < 0) {
      res.status(400).json({ error: 'group_id, user_id and a non-negative amount are required' });
      return;
    }

    try {
      const admin = currentUser(req);

      const isAdmin = await groupService.isUserAdmin(admin.id, parsedGroupId);
      if (!isAdmin) {
        res.status(403).json({ error: 'Only group admins can confirm payments' });
        return;
      }
      if (!(await groupService.isUserMember(parsedUserId, parsedGroupId))) {
        res.status(400).json({ error: 'user_id is not a member of this group' });
        return;
      }

      await paymentService.upsertTrainingPayment(parsedGroupId, monthStr, parsedUserId, parsedAmount, admin.id);

      res.json({ success: true });
    } catch (error) {
      console.error('Error upserting training payment:', error);
      res.status(500).json({ error: 'Failed to save training payment' });
    }
  });

  return router;
}
