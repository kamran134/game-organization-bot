import { Context, Markup, Telegraf } from 'telegraf';
import { ActionHandler, ActionServices } from './base/ActionHandler';
import { GameParticipant, ParticipationStatus } from '../../models/GameParticipant';
import { GroupRole } from '../../models/GroupMember';
import { KeyboardBuilder } from '../ui/KeyboardBuilder';
import { GameMessageBuilder } from '../ui/GameMessageBuilder';
import { Game, GameStatus } from '../../models/Game';
import { GameType } from '../../models/GameType';
import { rejectionForStatus } from '../../utils/gameStatusGuard';
import { formatDate } from '../ui/formatters';
import { Database } from '../../database/Database';
import { isMessageNotModified } from '../utils/telegramErrors';

export class GameActionsHandler extends ActionHandler {
  private db: Database;

  constructor(services: ActionServices) {
    super(services);
    this.db = Database.getInstance();
  }

  register(bot: Telegraf): void {
    // Join game (confirmed)
    bot.action(/^join_confirmed_(\d+)$/, async (ctx) => {
      await this.handleJoinGame(ctx, parseInt(ctx.match[1]), ParticipationStatus.CONFIRMED);
    });

    // Join game (maybe)
    bot.action(/^join_maybe_(\d+)$/, async (ctx) => {
      await this.handleJoinGame(ctx, parseInt(ctx.match[1]), ParticipationStatus.MAYBE);
    });
    
    // Show participants list
    bot.action(/^show_participants_(\d+)$/, async (ctx) => {
      const gameId = parseInt(ctx.match[1]);
      const game = await this.services.gameService.getGameById(gameId);
      
      if (!game) {
        await ctx.answerCbQuery('❌ Игра не найдена');
        return;
      }
      
      await ctx.answerCbQuery();
      await this.showParticipantsList(ctx, game);
    });
    
    // Leave game (отказ от участия)
    bot.action(/^leave_game_(\d+)$/, async (ctx) => {
      const gameId = parseInt(ctx.match[1]);
      const user = await this.services.userService.getUserByTelegramId(ctx.from!.id);

      if (!user) {
        await ctx.answerCbQuery('❌ Ошибка');
        return;
      }

      const gameForLock = await this.services.gameService.getGameById(gameId);
      if (!gameForLock) {
        await ctx.answerCbQuery('❌ Игра не найдена');
        return;
      }

      const leaveRejection = rejectionForStatus(gameForLock.status);
      if (leaveRejection) {
        await ctx.answerCbQuery(leaveRejection.botAlert, { show_alert: true });
        return;
      }

      if (gameForLock.isRegistrationLocked()) {
        await ctx.answerCbQuery(
          '🔒 Запись закрыта. Для экстренных ситуаций обратитесь к организатору.',
          { show_alert: true }
        );
        return;
      }

      try {
        await this.services.gameService.removeParticipant(gameId, user.id);
        await ctx.answerCbQuery('❌ Вы отказались от игры');
        
        // Обновляем кнопки
        const game = await this.services.gameService.getGameById(gameId);
        if (game) {
          const inGroup = ctx.chat?.type !== 'private';
          const isAdmin = !inGroup && await this.services.groupService.isUserAdmin(user.id, game.group_id);
          await this.refreshKeyboard(ctx, this.cardKeyboard(game, isAdmin, inGroup).reply_markup);

          await this.services.notificationService.notifyDeclined(game, user);
        }
      } catch (error) {
        console.error('Error leaving game:', error);
        await ctx.answerCbQuery('❌ Ошибка отказа');
      }
    });
    
    // Send game card to user's DM with live buttons
    bot.action(/^send_to_dm_(\d+)$/, async (ctx) => {
      const gameId = parseInt(ctx.match[1]);
      const game = await this.services.gameService.getGameById(gameId);

      if (!game) {
        await ctx.answerCbQuery('❌ Игра не найдена');
        return;
      }

      let isAdmin = false;
      if (ctx.from) {
        const user = await this.services.userService.getUserByTelegramId(ctx.from.id);
        if (user) {
          isAdmin = await this.services.groupService.isUserAdmin(user.id, game.group_id);
        }
      }

      const message = GameMessageBuilder.formatGameCard(game);
      const keyboard = this.cardKeyboard(game, isAdmin, false);

      try {
        await ctx.telegram.sendMessage(ctx.from!.id, message, {
          parse_mode: 'Markdown',
          ...keyboard,
        });
        await ctx.answerCbQuery('📩 Отправлено в личку!');
      } catch {
        await ctx.answerCbQuery('❌ Сначала начните чат с ботом: /start');
      }
    });

    // View game details
    bot.action(/^view_game_(\d+)$/, async (ctx) => {
      const gameId = parseInt(ctx.match[1]);
      const game = await this.services.gameService.getGameById(gameId);
      
      if (!game) {
        await ctx.answerCbQuery('❌ Игра не найдена');
        return;
      }
      
      await ctx.answerCbQuery();
      await this.showGameDetails(ctx, game);
    });

    // Delete game (confirmation request)
    bot.action(/^delete_game_(\d+)$/, async (ctx) => {
      const gameId = parseInt(ctx.match[1]);
      const game = await this.services.gameService.getGameById(gameId);
      
      if (!game) {
        await ctx.answerCbQuery('❌ Игра не найдена');
        return;
      }

      // Проверяем что пользователь - админ группы
      if (!await this.checkAdmin(ctx, game.group_id)) {
        await ctx.answerCbQuery('❌ Только администраторы могут удалять игры');
        return;
      }

      await ctx.answerCbQuery();
      await ctx.reply(
        `⚠️ Вы уверены, что хотите удалить эту игру?\n\n` +
        `${game.sport.emoji} ${game.sport.name}\n` +
        `📅 ${new Date(game.game_date).toLocaleString('ru-RU', { 
          day: 'numeric', 
          month: 'long', 
          hour: '2-digit', 
          minute: '2-digit' 
        })}\n` +
        `📍 ${game.location?.name || 'Не указано'}\n\n` +
        `Участников: ${game.participants?.length || 0}`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Да, удалить', `confirm_delete_game_${gameId}`)],
          [Markup.button.callback('❌ Отмена', `cancel_delete_game_${gameId}`)]
        ])
      );
    });

    // Confirm delete game
    bot.action(/^confirm_delete_game_(\d+)$/, async (ctx) => {
      const gameId = parseInt(ctx.match[1]);
      await ctx.answerCbQuery();
      const game = await this.services.gameService.getGameById(gameId);
      
      if (!game) {
        await ctx.editMessageText('❌ Игра не найдена');
        return;
      }

      // Check admin rights
      if (!await this.checkAdmin(ctx, game.group_id)) {
        await ctx.editMessageText('❌ Только администраторы могут удалять игры');
        return;
      }

      try {
        // Удаляем игру (каскадно удалятся и участники благодаря onDelete: 'CASCADE')
        const gameRepo = this.db.getRepository(Game);
        await gameRepo.remove(game);

        await ctx.editMessageText(
          `✅ Игра успешно удалена\n\n` +
          `${game.sport.emoji} ${game.sport.name}\n` +
          `📅 ${new Date(game.game_date).toLocaleString('ru-RU', { 
            day: 'numeric', 
            month: 'long', 
            hour: '2-digit', 
            minute: '2-digit' 
          })}`
        );
      } catch (error) {
        console.error('Error deleting game:', error);
        await ctx.editMessageText('❌ Ошибка при удалении игры');
      }
    });

    // Cancel delete game
    bot.action(/^cancel_delete_game_(\d+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.editMessageText('❌ Удаление игры отменено');
    });

    // Cancel game (confirmation request)
    bot.action(/^call_off_(\d+)$/, async (ctx) => {
      const gameId = parseInt(ctx.match[1]);
      const game = await this.services.gameService.getGameById(gameId);
      if (!game) { await ctx.answerCbQuery('❌ Игра не найдена'); return; }
      if (!await this.checkAdmin(ctx, game.group_id)) {
        await ctx.answerCbQuery('❌ Только администраторы могут отменять игры');
        return;
      }
      if (game.status !== GameStatus.PLANNED) {
        await ctx.answerCbQuery('ℹ️ Игра уже не активна');
        return;
      }

      await ctx.answerCbQuery();
      const noun = game.type === GameType.TRAINING ? 'тренировку' : 'игру';
      await ctx.reply(
        `⚠️ Отменить ${noun}?\n\n` +
        `${game.sport.emoji} ${game.sport.name}\n` +
        `📅 ${formatDate(game.game_date)}\n` +
        `📍 ${game.location?.name || 'Не указано'}\n\n` +
        `Участников: ${game.participants?.length || 0}. В группу уйдёт уведомление об отмене.`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Да, отменить', `confirm_call_off_${gameId}`)],
          [Markup.button.callback('↩️ Оставить', `keep_game_${gameId}`)]
        ])
      );
    });

    // Confirm cancel game
    bot.action(/^confirm_call_off_(\d+)$/, async (ctx) => {
      const gameId = parseInt(ctx.match[1]);
      await ctx.answerCbQuery();
      const groupId = await this.services.gameService.getGameGroupId(gameId);
      if (groupId === null) { await ctx.editMessageText('❌ Игра не найдена'); return; }
      if (!await this.checkAdmin(ctx, groupId)) {
        await ctx.editMessageText('❌ Только администраторы могут отменять игры');
        return;
      }

      try {
        const cancelled = await this.services.gameLifecycleService.cancel(gameId, 'manual');
        await ctx.editMessageText(cancelled ? '🚫 Игра отменена' : 'ℹ️ Игра уже не активна');
      } catch (error) {
        console.error('Error cancelling game:', error);
        await ctx.editMessageText('❌ Ошибка при отмене игры');
      }
    });

    // Keep the game (dismiss the cancel confirmation)
    bot.action(/^keep_game_(\d+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.editMessageText('👌 Игра остаётся в силе');
    });

    // Mark a started game as played (admin only, no confirmation)
    bot.action(/^complete_game_(\d+)$/, async (ctx) => {
      const gameId = parseInt(ctx.match[1]);
      const groupId = await this.services.gameService.getGameGroupId(gameId);
      if (groupId === null) { await ctx.answerCbQuery('❌ Игра не найдена'); return; }
      if (!await this.checkAdmin(ctx, groupId)) {
        await ctx.answerCbQuery('❌ Только администраторы могут завершать игры');
        return;
      }

      try {
        const completed = await this.services.gameLifecycleService.complete(gameId);
        await ctx.answerCbQuery(completed ? '✅ Игра отмечена сыгранной' : 'ℹ️ Игра уже не активна');
        if (completed) {
          // The completed card must lose its admin lifecycle buttons
          const game = await this.services.gameService.getGameById(gameId);
          if (game) await this.refreshKeyboard(ctx, this.cardKeyboard(game, true, false).reply_markup);
        }
      } catch (error) {
        console.error('Error completing game:', error);
        await ctx.answerCbQuery('❌ Ошибка при завершении игры');
      }
    });

    // Open registration lock settings (admin only)
    bot.action(/^set_lock_(\d+)$/, async (ctx) => {
      const gameId = parseInt(ctx.match[1]);
      const game = await this.services.gameService.getGameById(gameId);
      if (!game) { await ctx.answerCbQuery('❌ Игра не найдена'); return; }
      if (!await this.checkAdmin(ctx, game.group_id)) {
        await ctx.answerCbQuery('❌ Только для администраторов');
        return;
      }

      await ctx.answerCbQuery();

      const current = game.registration_lock_hours;
      const options = [1, 2, 3, 6, 12, 24];

      const hourButtons = options.map(h => {
        const suffix = h === 1 ? 'час' : h < 5 ? 'часа' : 'часов';
        const label = (current === h ? '✅ ' : '') + `${h} ${suffix}`;
        return [Markup.button.callback(label, `confirm_lock_${gameId}_${h}`)];
      });

      if (current) {
        hourButtons.push([Markup.button.callback('🔓 Отключить заморозку', `disable_lock_${gameId}`)]);
      }

      const currentStr = current
        ? `Сейчас: за ${current}ч до игры\n\n`
        : '';

      await ctx.reply(
        `🔒 Заморозка записи\n\n${currentStr}За сколько часов до игры закрыть изменения?`,
        Markup.inlineKeyboard(hourButtons)
      );
    });

    // Confirm lock hours
    bot.action(/^confirm_lock_(\d+)_(\d+)$/, async (ctx) => {
      const gameId = parseInt(ctx.match[1]);
      const hours = parseInt(ctx.match[2]);
      await ctx.answerCbQuery();
      const game = await this.services.gameService.getGameById(gameId);
      if (!game) { await ctx.editMessageText('❌ Игра не найдена'); return; }
      if (!await this.checkAdmin(ctx, game.group_id)) {
        await ctx.editMessageText('❌ Только для администраторов');
        return;
      }

      await this.services.gameService.setRegistrationLock(gameId, hours);

      const lockAt = new Date(new Date(game.game_date).getTime() - hours * 3600 * 1000);
      const timeStr = lockAt.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

      await ctx.editMessageText(
        `✅ Заморозка установлена\n\nЗапись будет закрыта за ${hours}ч до игры\n📅 ${timeStr}`
      );
    });

    // Disable lock
    bot.action(/^disable_lock_(\d+)$/, async (ctx) => {
      const gameId = parseInt(ctx.match[1]);
      await ctx.answerCbQuery();
      const groupId = await this.services.gameService.getGameGroupId(gameId);
      if (groupId === null) { await ctx.editMessageText('❌ Игра не найдена'); return; }
      if (!await this.checkAdmin(ctx, groupId)) {
        await ctx.editMessageText('❌ Только для администраторов');
        return;
      }

      await this.services.gameService.setRegistrationLock(gameId, null);
      await ctx.editMessageText('✅ Заморозка отключена');
    });
  }

  private async handleJoinGame(ctx: Context, gameId: number, status: ParticipationStatus) {
    if (!ctx.from) {
      await ctx.answerCbQuery('❌ Ошибка: нет данных пользователя');
      return;
    }

    try {
      // First fetch: need group_id and current participants before mutation
      const game = await this.services.gameService.getGameById(gameId);
      if (!game) {
        await ctx.answerCbQuery('❌ Игра не найдена');
        return;
      }

      const rejection = rejectionForStatus(game.status);
      if (rejection) {
        await ctx.answerCbQuery(rejection.botAlert, { show_alert: true });
        return;
      }

      if (game.isRegistrationLocked()) {
        await ctx.answerCbQuery(
          '🔒 Запись закрыта. Для экстренных ситуаций обратитесь к организатору.',
          { show_alert: true }
        );
        return;
      }

      // Проверяем/создаём пользователя (автоматическая регистрация)
      const user = await this.services.userService.findOrCreateUser({
        id: ctx.from.id,
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name,
      });

      // Проверяем/добавляем в группу
      const isMember = await this.services.groupService.isUserMember(user.id, game.group_id);
      if (!isMember) {
        await this.services.groupService.addMemberToGroup(user.id, game.group_id, GroupRole.MEMBER);
        console.log(`✅ Auto-added user ${user.first_name} to group ${game.group_id}`);
      }

      // Проверяем, записан ли уже на игру
      const existingParticipant = game.participants?.find((p: GameParticipant) => p.user_id === user.id);
      
      await this.services.gameService.addParticipant(gameId, user.id, status);
      
      const statusText = status === ParticipationStatus.CONFIRMED ? '✅ Точно иду' : '❓ Не точно';
      const actionText = existingParticipant ? 'статус обновлён' : 'вы записаны';
      await ctx.answerCbQuery(`${statusText} - ${actionText}!`);
      
      // Second fetch: need updated participants after mutation for UI
      const updatedGame = await this.services.gameService.getGameById(gameId);
      if (!updatedGame) return;

      const inGroupJoin = ctx.chat?.type !== 'private';
      const isAdmin = !inGroupJoin && await this.services.groupService.isUserAdmin(user.id, game.group_id);

      await this.refreshKeyboard(ctx, this.cardKeyboard(updatedGame, isAdmin, inGroupJoin).reply_markup);

      await this.services.notificationService.notifyJoined(updatedGame, user, status, !!existingParticipant);
    } catch (error) {
      console.error('Error joining game:', error);
      await ctx.answerCbQuery('❌ Ошибка записи');
    }
  }
  
  private cardKeyboard(game: Game, isAdmin: boolean, inGroup: boolean) {
    const countOf = (status: ParticipationStatus): number =>
      game.participants?.filter((p: GameParticipant) => p.participation_status === status).length || 0;
    return KeyboardBuilder.createGameActionsKeyboard(
      game.id,
      countOf(ParticipationStatus.CONFIRMED),
      isAdmin,
      countOf(ParticipationStatus.MAYBE),
      inGroup,
      game.registration_lock_hours,
      game
    );
  }

  // Telegram rejects an edit that leaves the markup unchanged (e.g. declining a game you
  // never joined keeps the counters the same). Without this the error aborts the handler
  // before the group notification is sent.
  private async refreshKeyboard(
    ctx: Context,
    markup: ReturnType<typeof KeyboardBuilder.createGameActionsKeyboard>['reply_markup']
  ): Promise<void> {
    try {
      await ctx.editMessageReplyMarkup(markup);
    } catch (error) {
      if (!isMessageNotModified(error)) throw error;
    }
  }

  private async showParticipantsList(ctx: Context, game: Game) {
    const message = GameMessageBuilder.formatParticipantsMessage(game);
    await ctx.reply(message);
  }
  
  private async showGameDetails(ctx: Context, game: Game) {
    const message = GameMessageBuilder.formatGameCard(game);
    // Admin buttons exist only in private chats, so the lookup is pointless in a group
    const inGroup = ctx.chat?.type !== 'private';
    let isAdmin = false;
    if (!inGroup && ctx.from) {
      const user = await this.services.userService.getUserByTelegramId(ctx.from.id);
      if (user) {
        isAdmin = await this.services.groupService.isUserAdmin(user.id, game.group_id);
      }
    }

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      ...this.cardKeyboard(game, isAdmin, inGroup),
    });
  }
}
