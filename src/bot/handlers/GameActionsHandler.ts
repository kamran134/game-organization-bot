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
      
      try {
        await this.services.gameService.removeParticipant(gameId, user.id);
        await ctx.answerCbQuery('❌ Вы отказались от игры');
        
        // Обновляем кнопки
        const game = await this.services.gameService.getGameById(gameId);
        if (game) {
          const confirmedCount = game.participants?.filter((p: any) => p.participation_status === ParticipationStatus.CONFIRMED).length || 0;
          
          await ctx.editMessageReplyMarkup(
            KeyboardBuilder.createGameActionsKeyboard(gameId, confirmedCount).reply_markup
          );
          
          // Показываем обновленный список
          await this.showParticipantsList(ctx, game);
        }
      } catch (error) {
        console.error('Error leaving game:', error);
        await ctx.answerCbQuery('❌ Ошибка отказа');
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
      const user = await this.services.userService.getUserByTelegramId(ctx.from!.id);
      if (!user) {
        await ctx.answerCbQuery('❌ Ошибка');
        return;
      }

      const isAdmin = await this.services.groupService.isUserAdmin(user.id, game.group_id);
      if (!isAdmin) {
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

      // Проверяем права
      const user = await this.services.userService.getUserByTelegramId(ctx.from!.id);
      if (!user) {
        await ctx.editMessageText('❌ Ошибка');
        return;
      }

      const isAdmin = await this.services.groupService.isUserAdmin(user.id, game.group_id);
      if (!isAdmin) {
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
  }

  private async handleJoinGame(ctx: Context, gameId: number, status: ParticipationStatus) {
    if (!ctx.from) {
      await ctx.answerCbQuery('❌ Ошибка: нет данных пользователя');
      return;
    }

    try {
      // Получаем игру чтобы знать группу
      const game = await this.services.gameService.getGameById(gameId);
      if (!game) {
        await ctx.answerCbQuery('❌ Игра не найдена');
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
      
      // Записываем на игру (создаёт новую запись или обновляет статус существующей)
      await this.services.gameService.addParticipant(gameId, user.id, status);
      
      const statusText = status === ParticipationStatus.CONFIRMED ? '✅ Точно иду' : '❓ Не точно';
      const actionText = existingParticipant ? 'статус обновлён' : 'вы записаны';
      await ctx.answerCbQuery(`${statusText} - ${actionText}!`);
      
      // Обновляем сообщение с актуальным списком
      const updatedGame = await this.services.gameService.getGameById(gameId);
      if (updatedGame) {
        const confirmedCount = updatedGame.participants?.filter((p: any) => p.participation_status === ParticipationStatus.CONFIRMED).length || 0;
        
        // Проверяем isAdmin
        const isAdmin = await this.services.groupService.isUserAdmin(user.id, updatedGame.group_id);
        
        await ctx.editMessageReplyMarkup(
          Markup.inlineKeyboard([
            [Markup.button.callback(`✅ Точно (${confirmedCount})`, `join_confirmed_${gameId}`)],
            [Markup.button.callback('❓ Не точно', `join_maybe_${gameId}`)],
            [Markup.button.callback('❌ Отказаться', `leave_game_${gameId}`)],
            [Markup.button.callback('👥 Список участников', `show_participants_${gameId}`)],
            ...(isAdmin ? [[Markup.button.callback('🗑 Удалить игру', `delete_game_${gameId}`)]] : [])
          ]).reply_markup
        );
        
        // Показываем список участников
        await this.showParticipantsList(ctx, updatedGame);
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
    
    // Проверяем isAdmin
    let isAdmin = false;
    if (ctx.from) {
      const user = await this.services.userService.getUserByTelegramId(ctx.from.id);
      if (user) {
        isAdmin = await this.services.groupService.isUserAdmin(user.id, game.group_id);
      }
    }
    
    await ctx.reply(
      message,
      KeyboardBuilder.createGameActionsKeyboard(game.id, confirmedCount, isAdmin)
    );
  }
}
