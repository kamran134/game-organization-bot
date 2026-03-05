import { Router, Response } from 'express';
import { AuthRequest } from '../types/express';
import { Database } from '../../database/Database';
import { GameService } from '../../services/GameService';
import { UserService } from '../../services/UserService';
import { GroupService } from '../../services/GroupService';
import { GameType } from '../../models/GameType';
import { ParticipationStatus } from '../../models/GameParticipant';
import { verifyTelegramInitData } from '../middleware/telegramAuth';
import { Telegram } from 'telegraf';
import { GameMessageBuilder } from '../../bot/ui/GameMessageBuilder';
import { KeyboardBuilder } from '../../bot/ui/KeyboardBuilder';

export function createGamesRouter(db: Database): Router {
  const router = Router();
  const gameService = new GameService(db);
  const userService = new UserService(db);
  const groupService = new GroupService(db);

  // GET /api/games?group_id=X — upcoming games for a group (requires auth)
  router.get('/', verifyTelegramInitData, async (req: AuthRequest, res: Response): Promise<void> => {
    const groupId = parseInt(req.query.group_id as string);
    if (!groupId) {
      res.status(400).json({ error: 'group_id is required' });
      return;
    }
    try {
      const games = await gameService.getUpcomingGroupGames(groupId);
      res.json(games);
    } catch (error) {
      console.error('Error fetching games:', error);
      res.status(500).json({ error: 'Failed to fetch games' });
    }
  });

  // POST /api/games — create game or training (requires auth)
  router.post('/', verifyTelegramInitData, async (req: AuthRequest, res: Response): Promise<void> => {
    const telegramUser = req.telegramUser;

    const {
      group_id,
      sport_id,
      game_date,
      location_id,
      min_participants,
      max_participants,
      cost,
      notes,
      type, // 'game' | 'training'
    } = req.body;

    if (!telegramUser || !group_id || !sport_id || !game_date || !location_id || !max_participants) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    try {
      // Find or create user from Telegram data
      const user = await userService.findOrCreateUser({
        id: telegramUser.id,
        username: telegramUser.username,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name,
      });

      const gameType = type === 'training' ? GameType.TRAINING : GameType.GAME;

      const game = await gameService.createGame({
        group_id: parseInt(group_id),
        creator_id: user.id,
        sport_id: parseInt(sport_id),
        game_date: new Date(game_date),
        location_id: parseInt(location_id),
        min_participants: parseInt(min_participants) || 2,
        max_participants: parseInt(max_participants),
        cost: cost ? parseFloat(cost) : undefined,
        notes: notes || undefined,
        type: gameType,
      });

      // Auto-register creator
      await gameService.addParticipant(game.id, user.id, ParticipationStatus.CONFIRMED);

      // Send notification to the Telegram group
      try {
        const botToken = process.env.BOT_TOKEN;
        const group = await groupService.getGroupById(parseInt(group_id));
        if (botToken && group?.telegram_chat_id) {
          const gameWithRelations = await gameService.getGameById(game.id);
          if (gameWithRelations) {
            const isAdmin = await groupService.isUserAdmin(user.id, parseInt(group_id));
            const text = GameMessageBuilder.formatGameCreatedMessage(gameWithRelations);
            const keyboard = KeyboardBuilder.createGameActionsKeyboard(game.id, 1, isAdmin);
            const telegram = new Telegram(botToken);
            await telegram.sendMessage(
              Number(group.telegram_chat_id),
              text,
              { parse_mode: 'Markdown', ...keyboard }
            );
          }
        }
      } catch (notifyError) {
        // Don't fail the request if notification fails
        console.error('Failed to send group notification:', notifyError);
      }

      res.status(201).json({ id: game.id, message: 'Created successfully' });
    } catch (error) {
      console.error('Error creating game:', error);
      res.status(500).json({ error: 'Failed to create game' });
    }
  });

  // POST /api/games/:id/register — register for a game (requires auth)
  router.post('/:id/register', verifyTelegramInitData, async (req: AuthRequest, res: Response): Promise<void> => {
    const telegramUser = req.telegramUser;
    const gameId = parseInt(req.params.id);

    if (!gameId) {
      res.status(400).json({ error: 'Invalid game id' });
      return;
    }

    try {
      if (!telegramUser) { res.status(401).json({ error: 'Unauthorized' }); return; }

      const user = await userService.findOrCreateUser({
        id: telegramUser.id,
        username: telegramUser.username,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name,
      });

      await gameService.addParticipant(gameId, user.id, ParticipationStatus.CONFIRMED);
      res.json({ message: 'Registered successfully' });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if ((err as {code?: string})?.code === '23505' || (err as Error)?.message?.includes('duplicate')) {
        res.status(409).json({ error: 'Already registered' });
      } else {
        console.error('Error registering:', error);
        res.status(500).json({ error: 'Failed to register' });
      }
    }
  });

  // DELETE /api/games/:id/register — cancel registration (requires auth)
  router.delete('/:id/register', verifyTelegramInitData, async (req: AuthRequest, res: Response): Promise<void> => {
    const telegramUser = req.telegramUser;
    const gameId = parseInt(req.params.id);

    try {
      if (!telegramUser) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const user = await userService.getUserByTelegramId(telegramUser.id);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      await gameService.removeParticipant(gameId, user.id);
      res.json({ message: 'Cancelled successfully' });
    } catch (error) {
      console.error('Error cancelling:', error);
      res.status(500).json({ error: 'Failed to cancel' });
    }
  });

  return router;
}
