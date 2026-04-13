import { Router, Response } from 'express';
import { AuthRequest } from '../types/express';
import { Database } from '../../database/Database';
import { GameService } from '../../services/GameService';
import { UserService } from '../../services/UserService';
import { GroupService } from '../../services/GroupService';
import { GameType } from '../../models/GameType';
import { ParticipationStatus } from '../../models/GameParticipant';
import { Game } from '../../models/Game';
import { verifyTelegramInitData } from '../middleware/telegramAuth';
import { Telegram } from 'telegraf';
import { GameMessageBuilder } from '../../bot/ui/GameMessageBuilder';
import { KeyboardBuilder } from '../../bot/ui/KeyboardBuilder';
import { jokeService } from '../../services/JokeService';

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

  // GET /api/games/:id — get single game (requires auth)
  router.get('/:id', verifyTelegramInitData, async (req: AuthRequest, res: Response): Promise<void> => {
    const gameId = parseInt(req.params.id);
    if (!gameId) { res.status(400).json({ error: 'Invalid game id' }); return; }
    try {
      const game = await gameService.getGameById(gameId);
      if (!game) { res.status(404).json({ error: 'Game not found' }); return; }
      res.json(game);
    } catch (error) {
      console.error('Error fetching game:', error);
      res.status(500).json({ error: 'Failed to fetch game' });
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

      // Verify user is a member of the group
      const parsedGroupId = parseInt(group_id);
      if (isNaN(parsedGroupId) || isNaN(parseInt(sport_id)) || isNaN(parseInt(location_id)) || isNaN(parseInt(max_participants))) {
        res.status(400).json({ error: 'Invalid numeric field' });
        return;
      }
      const isMember = await groupService.isUserMember(user.id, parsedGroupId);
      if (!isMember) {
        res.status(403).json({ error: 'You are not a member of this group' });
        return;
      }

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

      // Send notification to the Telegram group
      try {
        const botToken = process.env.BOT_TOKEN;
        const group = await groupService.getGroupById(parseInt(group_id));
        if (botToken && group?.telegram_chat_id) {
          const gameWithRelations = await gameService.getGameById(game.id);
          if (gameWithRelations) {
            const isAdmin = await groupService.isUserAdmin(user.id, parseInt(group_id));
            const text = GameMessageBuilder.formatGameCreatedMessage(gameWithRelations);
            const keyboard = KeyboardBuilder.createGameActionsKeyboard(game.id, 0, isAdmin, 0);
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

      const { status: rawStatus } = req.body as { status?: string };
      const participationStatus =
        rawStatus === 'maybe' ? ParticipationStatus.MAYBE : ParticipationStatus.CONFIRMED;

      await gameService.addParticipant(gameId, user.id, participationStatus);

      // Send notification to the Telegram group
      try {
        const botToken = process.env.BOT_TOKEN;
        const updatedGame = await gameService.getGameById(gameId);
        if (botToken && updatedGame?.group?.telegram_chat_id) {
          const telegram = new Telegram(botToken);
          const userName = [user.first_name, user.last_name].filter(Boolean).join(' ');
          const userLink = user.username ? `@${user.username}` : userName;
          const participantsText = GameMessageBuilder.formatParticipantsMessage(updatedGame);
          const emoji = participationStatus === ParticipationStatus.MAYBE ? '❓' : '✅';
          const actionText = participationStatus === ParticipationStatus.MAYBE
            ? 'отметился "не точно" через веб-приложение'
            : 'записался на игру через веб-приложение';
          await telegram.sendMessage(
            Number(updatedGame.group.telegram_chat_id),
            `${emoji} ${userLink} ${actionText}\n\n${participantsText}`,
            { parse_mode: 'Markdown' }
          );
        }
      } catch (notifyError) {
        console.error('Failed to send join notification to group:', notifyError);
      }

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
    if (!gameId) { res.status(400).json({ error: 'Invalid game id' }); return; }

    try {
      if (!telegramUser) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const user = await userService.getUserByTelegramId(telegramUser.id);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      await gameService.removeParticipant(gameId, user.id);

      // Send cancel notification to the Telegram group
      try {
        const botToken = process.env.BOT_TOKEN;
        const updatedGame = await gameService.getGameById(gameId);
        if (botToken && updatedGame?.group?.telegram_chat_id) {
          const telegram = new Telegram(botToken);
          const userName = [user.first_name, user.last_name].filter(Boolean).join(' ');
          const userLink = user.username ? `@${user.username}` : userName;
          const participantsText = GameMessageBuilder.formatParticipantsMessage(updatedGame);
          const joke = await jokeService.getDeclineJoke(userName);
          const safeJoke = joke.replace(/</g, '&lt;').replace(/>/g, '&gt;');
          await telegram.sendMessage(
            Number(updatedGame.group.telegram_chat_id),
            `❌ ${userLink} отказался от участия через веб-приложение\n\n🤖 <i>${safeJoke}</i>\n\n${participantsText}`,
            { parse_mode: 'HTML' }
          );
        }
      } catch (notifyError) {
        console.error('Failed to send cancel notification to group:', notifyError);
      }

      res.json({ message: 'Cancelled successfully' });
    } catch (error) {
      console.error('Error cancelling:', error);
      res.status(500).json({ error: 'Failed to cancel' });
    }
  });

  // PUT /api/games/:id — update game (admin only)
  router.put('/:id', verifyTelegramInitData, async (req: AuthRequest, res: Response): Promise<void> => {
    const telegramUser = req.telegramUser;
    const gameId = parseInt(req.params.id);
    if (!telegramUser) { res.status(401).json({ error: 'Unauthorized' }); return; }
    if (!gameId) { res.status(400).json({ error: 'Invalid game id' }); return; }
    try {
      const user = await userService.getUserByTelegramId(telegramUser.id);
      if (!user) { res.status(404).json({ error: 'User not found' }); return; }
      const game = await gameService.getGameById(gameId);
      if (!game) { res.status(404).json({ error: 'Game not found' }); return; }
      const isAdmin = await groupService.isUserAdmin(user.id, game.group_id);
      if (!isAdmin) { res.status(403).json({ error: 'Admin only' }); return; }

      const { sport_id, game_date, location_id, min_participants, max_participants, cost, notes } = req.body as Record<string, string | undefined>;
      const gameRepo = db.getRepository(Game);
      await gameRepo.update(gameId, {
        ...(sport_id      && { sport_id: parseInt(sport_id) }),
        ...(game_date     && { game_date: new Date(game_date) }),
        ...(location_id   && { location_id: parseInt(location_id) }),
        ...(min_participants && { min_participants: parseInt(min_participants) }),
        ...(max_participants && { max_participants: parseInt(max_participants) }),
        ...(cost !== undefined && { cost: cost === '' || cost === null ? undefined : parseFloat(cost) }),
        ...(notes !== undefined && { notes: notes || undefined }),
      });
      res.json({ message: 'Updated successfully' });
    } catch (error) {
      console.error('Error updating game:', error);
      res.status(500).json({ error: 'Failed to update game' });
    }
  });

  // DELETE /api/games/:id — delete game (admin only)
  router.delete('/:id', verifyTelegramInitData, async (req: AuthRequest, res: Response): Promise<void> => {
    const telegramUser = req.telegramUser;
    const gameId = parseInt(req.params.id);
    if (!telegramUser) { res.status(401).json({ error: 'Unauthorized' }); return; }
    if (!gameId) { res.status(400).json({ error: 'Invalid game id' }); return; }
    try {
      const user = await userService.getUserByTelegramId(telegramUser.id);
      if (!user) { res.status(404).json({ error: 'User not found' }); return; }
      const game = await gameService.getGameById(gameId);
      if (!game) { res.status(404).json({ error: 'Game not found' }); return; }
      const isAdmin = await groupService.isUserAdmin(user.id, game.group_id);
      if (!isAdmin) { res.status(403).json({ error: 'Admin only' }); return; }

      const gameRepo = db.getRepository(Game);
      await gameRepo.remove(game);

      // Notify group
      try {
        const botToken = process.env.BOT_TOKEN;
        if (botToken && game.group?.telegram_chat_id) {
          const telegram = new Telegram(botToken);
          const sportName = game.sport ? `${game.sport.emoji} ${game.sport.name}` : 'Игра';
          const dateStr = new Date(game.game_date).toLocaleString('ru-RU', {
            day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
          });
          await telegram.sendMessage(
            Number(game.group.telegram_chat_id),
            `🗑 Игра удалена администратором\n\n${sportName}\n📅 ${dateStr}`
          );
        }
      } catch (notifyError) {
        console.error('Failed to send delete notification:', notifyError);
      }

      res.json({ message: 'Deleted successfully' });
    } catch (error) {
      console.error('Error deleting game:', error);
      res.status(500).json({ error: 'Failed to delete game' });
    }
  });

  // ---- Guest management (admin only) ----

  // POST /api/games/:id/guests — add a guest participant
  router.post('/:id/guests', verifyTelegramInitData, async (req: AuthRequest, res: Response): Promise<void> => {
    const telegramUser = req.telegramUser;
    const gameId = parseInt(req.params.id);
    if (!telegramUser) { res.status(401).json({ error: 'Unauthorized' }); return; }
    if (!gameId) { res.status(400).json({ error: 'Invalid game id' }); return; }
    try {
      const user = await userService.getUserByTelegramId(telegramUser.id);
      if (!user) { res.status(404).json({ error: 'User not found' }); return; }
      const game = await gameService.getGameById(gameId);
      if (!game) { res.status(404).json({ error: 'Game not found' }); return; }
      const isAdmin = await groupService.isUserAdmin(user.id, game.group_id);
      if (!isAdmin) { res.status(403).json({ error: 'Admin only' }); return; }

      const { first_name, last_name } = req.body as { first_name?: string; last_name?: string };
      if (!first_name?.trim()) {
        res.status(400).json({ error: 'first_name is required' });
        return;
      }

      const participant = await gameService.addGuest(gameId, first_name, last_name);
      res.status(201).json({ id: participant.id, message: 'Guest added' });
    } catch (error) {
      console.error('Error adding guest:', error);
      res.status(500).json({ error: 'Failed to add guest' });
    }
  });

  // PUT /api/games/:id/guests/:participantId — edit a guest participant
  router.put('/:id/guests/:participantId', verifyTelegramInitData, async (req: AuthRequest, res: Response): Promise<void> => {
    const telegramUser = req.telegramUser;
    const gameId = parseInt(req.params.id);
    const participantId = parseInt(req.params.participantId);
    if (!telegramUser) { res.status(401).json({ error: 'Unauthorized' }); return; }
    if (!gameId || !participantId) { res.status(400).json({ error: 'Invalid ids' }); return; }
    try {
      const user = await userService.getUserByTelegramId(telegramUser.id);
      if (!user) { res.status(404).json({ error: 'User not found' }); return; }
      const game = await gameService.getGameById(gameId);
      if (!game) { res.status(404).json({ error: 'Game not found' }); return; }
      const isAdmin = await groupService.isUserAdmin(user.id, game.group_id);
      if (!isAdmin) { res.status(403).json({ error: 'Admin only' }); return; }

      const { first_name, last_name } = req.body as { first_name?: string; last_name?: string };
      if (!first_name?.trim()) {
        res.status(400).json({ error: 'first_name is required' });
        return;
      }

      await gameService.updateGuest(participantId, gameId, first_name, last_name);
      res.json({ message: 'Guest updated' });
    } catch (error) {
      console.error('Error updating guest:', error);
      res.status(500).json({ error: 'Failed to update guest' });
    }
  });

  // DELETE /api/games/:id/guests/:participantId — remove a guest participant
  router.delete('/:id/guests/:participantId', verifyTelegramInitData, async (req: AuthRequest, res: Response): Promise<void> => {
    const telegramUser = req.telegramUser;
    const gameId = parseInt(req.params.id);
    const participantId = parseInt(req.params.participantId);
    if (!telegramUser) { res.status(401).json({ error: 'Unauthorized' }); return; }
    if (!gameId || !participantId) { res.status(400).json({ error: 'Invalid ids' }); return; }
    try {
      const user = await userService.getUserByTelegramId(telegramUser.id);
      if (!user) { res.status(404).json({ error: 'User not found' }); return; }
      const game = await gameService.getGameById(gameId);
      if (!game) { res.status(404).json({ error: 'Game not found' }); return; }
      const isAdmin = await groupService.isUserAdmin(user.id, game.group_id);
      if (!isAdmin) { res.status(403).json({ error: 'Admin only' }); return; }

      await gameService.removeGuest(participantId, gameId);
      res.json({ message: 'Guest removed' });
    } catch (error) {
      console.error('Error removing guest:', error);
      res.status(500).json({ error: 'Failed to remove guest' });
    }
  });

  return router;
}
