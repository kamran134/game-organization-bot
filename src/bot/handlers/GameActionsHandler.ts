import { Context, Markup, Telegraf } from 'telegraf';
import { ActionHandler, ActionServices } from './base/ActionHandler';
import { ParticipationStatus } from '../../models/GameParticipant';
import { GroupRole } from '../../models/GroupMember';
import { KeyboardBuilder } from '../ui/KeyboardBuilder';
import { GameMessageBuilder } from '../ui/GameMessageBuilder';
import { Game } from '../../models/Game';
import { Database } from '../../database/Database';

export class GameActionsHandler extends ActionHandler {
  private db: Database;

  constructor(services: ActionServices) {
    super(services);
    this.db = Database.getInstance();
  }

  register(bot: Telegraf): void {
    // Join game (confirmed)
    bot.action(/join_confirmed_(\d+)/, async (ctx) => {
      await this.handleJoinGame(ctx, parseInt(ctx.match[1]), ParticipationStatus.CONFIRMED);
    });

    // Join game (maybe)
    bot.action(/join_maybe_(\d+)/, async (ctx) => {
      await this.handleJoinGame(ctx, parseInt(ctx.match[1]), ParticipationStatus.MAYBE);
    });
    
    // Show participants list
    bot.action(/show_participants_(\d+)/, async (ctx) => {
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
    bot.action(/leave_game_(\d+)/, async (ctx) => {
      const gameId = parseInt(ctx.match[1]);
      const user = await this.services.userService.getUserByTelegramId(ctx.from!.id);

      if (!user) {
        await ctx.answerCbQuery('❌ Ошибка');
        return;
      }

      const gameForLock = await this.services.gameService.getGameById(gameId);
      if (gameForLock?.isRegistrationLocked()) {
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
          const confirmedCount = game.participants?.filter((p: any) => p.participation_status === ParticipationStatus.CONFIRMED).length || 0;
          const maybeCount = game.participants?.filter((p: any) => p.participation_status === ParticipationStatus.MAYBE).length || 0;
          const isAdmin = await this.services.groupService.isUserAdmin(user.id, game.group_id);
          
          const inGroup = ctx.chat?.type !== 'private';
          await ctx.editMessageReplyMarkup(
            KeyboardBuilder.createGameActionsKeyboard(gameId, confirmedCount, isAdmin, maybeCount, inGroup, game.registration_lock_hours).reply_markup
          );

          // Отправляем сообщение в группу о том кто отказался
          const userName = ctx.from!.first_name + (ctx.from!.last_name ? ` ${ctx.from!.last_name}` : '');
          const userLink = ctx.from!.username ? `@${ctx.from!.username}` : userName;
          
          if (game.group.telegram_chat_id) {
            try {
              const joke = await this.services.jokeService.getDeclineJoke(userName);
              const safeJoke = joke.replace(/</g, '&lt;').replace(/>/g, '&gt;');
              await ctx.telegram.sendMessage(
                game.group.telegram_chat_id,
                `❌ ${userLink} отказался от участия\n\n🤖 <i>${safeJoke}</i>`,
                { parse_mode: 'HTML' }
              );
            } catch (sendError) {
              console.error('Error sending decline notification to group:', sendError);
              console.log('Group chat_id:', game.group.telegram_chat_id);
              console.log('User:', userLink);
            }
          } else {
            console.error('Game group has no telegram_chat_id:', game.id);
          }
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

      const confirmedCount = game.participants?.filter((p: any) => p.participation_status === ParticipationStatus.CONFIRMED).length || 0;
      const maybeCount = game.participants?.filter((p: any) => p.participation_status === ParticipationStatus.MAYBE).length || 0;

      let isAdmin = false;
      if (ctx.from) {
        const user = await this.services.userService.getUserByTelegramId(ctx.from.id);
        if (user) {
          isAdmin = await this.services.groupService.isUserAdmin(user.id, game.group_id);
        }
      }

      const message = GameMessageBuilder.formatGameCard(game);
      const keyboard = KeyboardBuilder.createGameActionsKeyboard(gameId, confirmedCount, isAdmin, maybeCount, false, game.registration_lock_hours);

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
    bot.action(/view_game_(\d+)/, async (ctx) => {
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
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Error deleting game:', error);
        await ctx.editMessageText('❌ Ошибка при удалении игры');
        await ctx.answerCbQuery();
      }
    });

    // Cancel delete game
    bot.action(/^cancel_delete_game_(\d+)$/, async (ctx) => {
      await ctx.editMessageText('❌ Удаление игры отменено');
      await ctx.answerCbQuery();
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
      await ctx.answerCbQuery('✅ Заморозка установлена');
    });

    // Disable lock
    bot.action(/^disable_lock_(\d+)$/, async (ctx) => {
      const gameId = parseInt(ctx.match[1]);
      const game = await this.services.gameService.getGameById(gameId);
      if (!game) { await ctx.editMessageText('❌ Игра не найдена'); return; }
      if (!await this.checkAdmin(ctx, game.group_id)) {
        await ctx.editMessageText('❌ Только для администраторов');
        return;
      }

      await this.services.gameService.setRegistrationLock(gameId, null);
      await ctx.editMessageText('✅ Заморозка отключена');
      await ctx.answerCbQuery('✅ Заморозка отключена');
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
      const existingParticipant = game.participants?.find((p: any) => p.user_id === user.id);
      
      await this.services.gameService.addParticipant(gameId, user.id, status);
      
      const statusText = status === ParticipationStatus.CONFIRMED ? '✅ Точно иду' : '❓ Не точно';
      const actionText = existingParticipant ? 'статус обновлён' : 'вы записаны';
      await ctx.answerCbQuery(`${statusText} - ${actionText}!`);
      
      // Second fetch: need updated participants after mutation for UI
      const updatedGame = await this.services.gameService.getGameById(gameId);
      if (!updatedGame) return;

      const confirmedCount = updatedGame.participants?.filter((p: any) => p.participation_status === ParticipationStatus.CONFIRMED).length || 0;
      const maybeCount = updatedGame.participants?.filter((p: any) => p.participation_status === ParticipationStatus.MAYBE).length || 0;
      
      const isAdmin = await this.services.groupService.isUserAdmin(user.id, game.group_id);
      const inGroupJoin = ctx.chat?.type !== 'private';

      await ctx.editMessageReplyMarkup(
        KeyboardBuilder.createGameActionsKeyboard(gameId, confirmedCount, isAdmin, maybeCount, inGroupJoin, updatedGame.registration_lock_hours).reply_markup
      );

      const displayName = ctx.from!.first_name + (ctx.from!.last_name ? ` ${ctx.from!.last_name}` : '');
      const notifyEmoji = status === ParticipationStatus.CONFIRMED ? '✅' : '❓';
      const notifyStatus = status === ParticipationStatus.CONFIRMED ? 'точно идёт' : 'возможно придёт';
      const actionLabel = existingParticipant ? 'обновил статус' : 'записался';

      if (updatedGame.group?.telegram_chat_id) {
        try {
          await ctx.telegram.sendMessage(
            updatedGame.group.telegram_chat_id,
            `${notifyEmoji} ${displayName} ${actionLabel} — ${notifyStatus}`
          );
        } catch (err) {
          console.error('Error sending join notification to group:', err);
        }
      }
    } catch (error) {
      console.error('Error joining game:', error);
      await ctx.answerCbQuery('❌ Ошибка записи');
    }
  }
  
  private async showParticipantsList(ctx: Context, game: any) {
    const message = GameMessageBuilder.formatParticipantsMessage(game);
    await ctx.reply(message);
  }
  
  private async showGameDetails(ctx: Context, game: any) {
    const message = GameMessageBuilder.formatGameCard(game);
    const confirmedCount = game.participants?.filter((p: any) => p.participation_status === ParticipationStatus.CONFIRMED).length || 0;
    const maybeCount = game.participants?.filter((p: any) => p.participation_status === ParticipationStatus.MAYBE).length || 0;
    
    // Проверяем isAdmin
    let isAdmin = false;
    if (ctx.from) {
      const user = await this.services.userService.getUserByTelegramId(ctx.from.id);
      if (user) {
        isAdmin = await this.services.groupService.isUserAdmin(user.id, game.group_id);
      }
    }
    
    const inGroup = ctx.chat?.type !== 'private';
    await ctx.reply(
      message,
      KeyboardBuilder.createGameActionsKeyboard(game.id, confirmedCount, isAdmin, maybeCount, inGroup, game.registration_lock_hours)
    );
  }
}
