import { Router, Response } from 'express';
import { AuthRequest } from '../types/express';
import { Database } from '../../database/Database';
import { GameService } from '../../services/GameService';
import { UserService } from '../../services/UserService';
import { GroupService } from '../../services/GroupService';
import { SportService } from '../../services/SportService';
import { LocationService } from '../../services/LocationService';
import { GameType } from '../../models/GameType';
import { ParticipationStatus } from '../../models/GameParticipant';
import { Game } from '../../models/Game';
import { User } from '../../models/User';
import { verifyTelegramInitData } from '../middleware/telegramAuth';
import { requireUser, currentUser } from '../middleware/requireUser';
import { GroupAccessChecker } from '../access';
import { serializeGame } from '../serializers';
import { parseGameBody } from '../gameBodyValidator';
import { Telegram } from 'telegraf';
import { GameMessageBuilder } from '../../bot/ui/GameMessageBuilder';
import { KeyboardBuilder } from '../../bot/ui/KeyboardBuilder';
import { JokeService } from '../../services/JokeService';
import { formatMembersMentions } from '../../bot/ui/formatters';
import { escapeHtml, escapeMarkdownV1 } from '../../utils/helpers';
import { ValidationError } from '../../utils/errors';

export function createGamesRouter(db: Database, telegram: Telegram, canAccessGroup: GroupAccessChecker): Router {
  const router = Router();
  const gameService = new GameService(db);
  const userService = new UserService(db);
  const groupService = new GroupService(db);
  const sportService = new SportService(db);
  const locationService = new LocationService(db);
  const jokeService = new JokeService();

  router.use(verifyTelegramInitData, requireUser(userService));

  /** Loads a game and checks the user is an admin of its group; sends the error response and returns null otherwise. */
  async function loadGameForAdmin(gameId: number, user: User, res: Response): Promise<Game | null> {
    const game = await gameService.getGameById(gameId);
    if (!game) { res.status(404).json({ error: 'Game not found' }); return null; }
    const isAdmin = await groupService.isUserAdmin(user.id, game.group_id);
    if (!isAdmin) { res.status(403).json({ error: 'Admin only' }); return null; }
    return game;
  }

  /** The sport must be a base sport or belong to the group, and be active. */
  async function isSportAvailable(sportId: number, groupId: number): Promise<boolean> {
    const sport = await sportService.getSportById(sportId);
    if (!sport || !sport.is_active) return false;
    return sport.group_id === null || sport.group_id === undefined || sport.group_id === groupId;
  }

  async function isLocationAvailable(locationId: number, groupId: number): Promise<boolean> {
    const location = await locationService.getById(locationId);
    return !!location && location.is_active && location.group_id === groupId;
  }

  // GET /api/games?group_id=X — upcoming games for a group (requires auth)
  router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
    const groupId = parseInt(req.query.group_id as string);
    if (!groupId) {
      res.status(400).json({ error: 'group_id is required' });
      return;
    }
    try {
      if (!(await canAccessGroup(currentUser(req), groupId))) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const games = await gameService.getUpcomingGroupGames(groupId);
      res.json(games.map(serializeGame));
    } catch (error) {
      console.error('Error fetching games:', error);
      res.status(500).json({ error: 'Failed to fetch games' });
    }
  });

  // GET /api/games/:id — get single game (requires auth)
  router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    const gameId = parseInt(req.params.id);
    if (!gameId) { res.status(400).json({ error: 'Invalid game id' }); return; }
    try {
      const game = await gameService.getGameById(gameId);
      if (!game) { res.status(404).json({ error: 'Game not found' }); return; }
      if (!(await canAccessGroup(currentUser(req), game.group_id))) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      res.json(serializeGame(game));
    } catch (error) {
      console.error('Error fetching game:', error);
      res.status(500).json({ error: 'Failed to fetch game' });
    }
  });

  // POST /api/games — create game or training (requires auth)
  router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
    const user = currentUser(req);
    const { group_id, type } = req.body ?? {}; // type: 'game' | 'training'

    try {
      const groupId = Number(group_id);
      if (!Number.isInteger(groupId) || groupId < 1) {
        res.status(400).json({ error: 'Invalid group_id' });
        return;
      }

      const body = parseGameBody(req.body, 'create');
      const sportId = body.sport_id as number;
      const locationId = body.location_id as number;

      const isMember = await groupService.isUserMember(user.id, groupId);
      if (!isMember) {
        res.status(403).json({ error: 'You are not a member of this group' });
        return;
      }

      if (!(await isSportAvailable(sportId, groupId))) {
        res.status(400).json({ error: 'Вид спорта недоступен для этой группы' });
        return;
      }
      if (!(await isLocationAvailable(locationId, groupId))) {
        res.status(400).json({ error: 'Площадка недоступна для этой группы' });
        return;
      }

      const gameType = type === 'training' ? GameType.TRAINING : GameType.GAME;

      const game = await gameService.createGame({
        group_id: groupId,
        creator_id: user.id,
        sport_id: sportId,
        game_date: body.game_date as Date,
        location_id: locationId,
        min_participants: body.min_participants as number,
        max_participants: body.max_participants as number,
        cost: body.cost || undefined,
        notes: body.notes ?? undefined,
        type: gameType,
      });

      // Send notification to the Telegram group
      try {
        const group = await groupService.getGroupById(groupId);
        if (group?.telegram_chat_id) {
          const gameWithRelations = await gameService.getGameById(game.id);
          if (gameWithRelations) {
            const isAdmin = await groupService.isUserAdmin(user.id, groupId);
            const text = GameMessageBuilder.formatGameCreatedMessage(gameWithRelations);
            const keyboard = KeyboardBuilder.createGameActionsKeyboard(game.id, 0, isAdmin, 0);
            await telegram.sendMessage(
              Number(group.telegram_chat_id),
              text,
              { parse_mode: 'Markdown', ...keyboard }
            );

            const members = await groupService.getGroupMembers(groupId);
            const mentions = formatMembersMentions(members);
            if (mentions) {
              await telegram.sendMessage(Number(group.telegram_chat_id), `👆 ${mentions}`, { parse_mode: 'HTML' });
            }
          }
        }
      } catch (notifyError) {
        // Don't fail the request if notification fails
        console.error('Failed to send group notification:', notifyError);
      }

      res.status(201).json({ id: game.id, message: 'Created successfully' });
    } catch (error) {
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      console.error('Error creating game:', error);
      res.status(500).json({ error: 'Failed to create game' });
    }
  });

  // POST /api/games/:id/register — register for a game (requires auth)
  router.post('/:id/register', async (req: AuthRequest, res: Response): Promise<void> => {
    const user = currentUser(req);
    const gameId = parseInt(req.params.id);

    if (!gameId) {
      res.status(400).json({ error: 'Invalid game id' });
      return;
    }

    try {
      const game = await gameService.getGameById(gameId);
      if (!game) { res.status(404).json({ error: 'Game not found' }); return; }

      if (!(await canAccessGroup(user, game.group_id))) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      if (game.isRegistrationLocked()) {
        res.status(403).json({ error: 'Registration locked' });
        return;
      }

      // Mirrors the bot's join handler: membership is created lazily on first registration
      if (!(await groupService.isUserMember(user.id, game.group_id))) {
        try {
          await groupService.addMemberToGroup(user.id, game.group_id);
        } catch (addError) {
          // Lost a race with a parallel request that already added the user
          if (!(addError instanceof Error && addError.message.includes('already a member'))) throw addError;
        }
      }

      const { status: rawStatus } = (req.body ?? {}) as { status?: string };
      const participationStatus =
        rawStatus === 'maybe' ? ParticipationStatus.MAYBE : ParticipationStatus.CONFIRMED;

      await gameService.addParticipant(gameId, user.id, participationStatus);

      // Respond immediately, notify group in background
      res.json({ message: 'Registered successfully' });

      // Send notification to the Telegram group (fire-and-forget)
      setImmediate(async () => { try {
        const updatedGame = await gameService.getGameById(gameId);
        if (updatedGame?.group?.telegram_chat_id) {
          const userName = [user.first_name, user.last_name].filter(Boolean).join(' ');
          const participantsText = GameMessageBuilder.formatParticipantsMessage(updatedGame);
          const emoji = participationStatus === ParticipationStatus.MAYBE ? '❓' : '✅';
          const actionText = participationStatus === ParticipationStatus.MAYBE
            ? 'Новая запись "не точно" (веб):'
            : 'Новая запись (веб):';
          await telegram.sendMessage(
            Number(updatedGame.group.telegram_chat_id),
            `${emoji} ${actionText} ${escapeMarkdownV1(userName)}\n\n${escapeMarkdownV1(participantsText)}`,
            { parse_mode: 'Markdown' }
          );
        }
      } catch (notifyError) {
        console.error('Failed to send join notification to group:', notifyError);
      }});
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
  router.delete('/:id/register', async (req: AuthRequest, res: Response): Promise<void> => {
    const user = currentUser(req);
    const gameId = parseInt(req.params.id);
    if (!gameId) { res.status(400).json({ error: 'Invalid game id' }); return; }

    try {
      const game = await gameService.getGameById(gameId);
      if (!game) { res.status(404).json({ error: 'Game not found' }); return; }
      if (game.isRegistrationLocked()) {
        res.status(403).json({ error: 'Registration locked' });
        return;
      }

      const wasParticipant = game.participants?.some((p) => p.user_id === user.id) ?? false;
      await gameService.removeParticipant(gameId, user.id);

      // Respond immediately, notify group in background
      res.json({ message: 'Cancelled successfully' });
      if (!wasParticipant) return;

      // Send cancel notification (fire-and-forget)
      setImmediate(async () => { try {
        const updatedGame = await gameService.getGameById(gameId);
        if (updatedGame?.group?.telegram_chat_id) {
          const userName = [user.first_name, user.last_name].filter(Boolean).join(' ');
          const participantsText = GameMessageBuilder.formatParticipantsMessage(updatedGame);
          const joke = await jokeService.getDeclineJoke(userName);
          const safeJoke = joke.replace(/</g, '&lt;').replace(/>/g, '&gt;');
          await telegram.sendMessage(
            Number(updatedGame.group.telegram_chat_id),
            `❌ ${escapeHtml(userName)} отказался от участия через веб-приложение\n\n🤖 <i>${safeJoke}</i>\n\n${escapeHtml(participantsText)}`,
            { parse_mode: 'HTML' }
          );
        }
      } catch (notifyError) {
        console.error('Failed to send cancel notification to group:', notifyError);
      }});
    } catch (error) {
      console.error('Error cancelling:', error);
      res.status(500).json({ error: 'Failed to cancel' });
    }
  });

  // PUT /api/games/:id — update game (admin only)
  router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    const gameId = parseInt(req.params.id);
    if (!gameId) { res.status(400).json({ error: 'Invalid game id' }); return; }
    try {
      const game = await loadGameForAdmin(gameId, currentUser(req), res);
      if (!game) return;

      const body = parseGameBody(req.body, 'update');

      const minParticipants = body.min_participants ?? game.min_participants;
      const maxParticipants = body.max_participants ?? game.max_participants;
      if (minParticipants > maxParticipants) {
        res.status(400).json({ error: 'Мин. игроков не может быть больше макс.' });
        return;
      }

      // Only re-check references that actually change: an already-assigned sport/location
      // that was deactivated later must not block editing the rest of the game.
      if (body.sport_id !== undefined && body.sport_id !== game.sport_id
        && !(await isSportAvailable(body.sport_id, game.group_id))) {
        res.status(400).json({ error: 'Вид спорта недоступен для этой группы' });
        return;
      }
      if (body.location_id !== undefined && body.location_id !== game.location_id
        && !(await isLocationAvailable(body.location_id, game.group_id))) {
        res.status(400).json({ error: 'Площадка недоступна для этой группы' });
        return;
      }

      // null values clear the nullable columns (cost, notes)
      const changes = body as Partial<Game>;
      if (Object.keys(changes).length > 0) {
        await db.getRepository(Game).update(gameId, changes);
      }
      res.json({ message: 'Updated successfully' });
    } catch (error) {
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      console.error('Error updating game:', error);
      res.status(500).json({ error: 'Failed to update game' });
    }
  });

  // DELETE /api/games/:id — delete game (admin only)
  router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    const gameId = parseInt(req.params.id);
    if (!gameId) { res.status(400).json({ error: 'Invalid game id' }); return; }
    try {
      const game = await loadGameForAdmin(gameId, currentUser(req), res);
      if (!game) return;

      const gameRepo = db.getRepository(Game);
      await gameRepo.remove(game);

      // Notify group
      try {
        if (game.group?.telegram_chat_id) {
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
  router.post('/:id/guests', async (req: AuthRequest, res: Response): Promise<void> => {
    const gameId = parseInt(req.params.id);
    if (!gameId) { res.status(400).json({ error: 'Invalid game id' }); return; }
    try {
      const game = await loadGameForAdmin(gameId, currentUser(req), res);
      if (!game) return;

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
  router.put('/:id/guests/:participantId', async (req: AuthRequest, res: Response): Promise<void> => {
    const gameId = parseInt(req.params.id);
    const participantId = parseInt(req.params.participantId);
    if (!gameId || !participantId) { res.status(400).json({ error: 'Invalid ids' }); return; }
    try {
      const game = await loadGameForAdmin(gameId, currentUser(req), res);
      if (!game) return;

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
  router.delete('/:id/guests/:participantId', async (req: AuthRequest, res: Response): Promise<void> => {
    const gameId = parseInt(req.params.id);
    const participantId = parseInt(req.params.participantId);
    if (!gameId || !participantId) { res.status(400).json({ error: 'Invalid ids' }); return; }
    try {
      const game = await loadGameForAdmin(gameId, currentUser(req), res);
      if (!game) return;

      await gameService.removeGuest(participantId, gameId);
      res.json({ message: 'Guest removed' });
    } catch (error) {
      console.error('Error removing guest:', error);
      res.status(500).json({ error: 'Failed to remove guest' });
    }
  });

  return router;
}
