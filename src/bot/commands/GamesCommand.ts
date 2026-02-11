import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { CommandHandler } from './base/CommandHandler';
import { KeyboardBuilder } from '../ui/KeyboardBuilder';
import { GameMessageBuilder } from '../ui/GameMessageBuilder';
import { ParticipationStatus } from '../../models/GameParticipant';
import { GameType } from '../../models/GameType';

export class GamesCommand extends CommandHandler {
  get command(): string {
    return 'games';
  }

  async execute(ctx: Context): Promise<void> {
    if (!this.isGroupOnly(ctx)) return;

    const chatId = ctx.chat!.id;
    const group = await this.services.groupService.getGroupByChatId(chatId);

    if (!group) {
      await ctx.reply('❌ Группа не найдена.');
      return;
    }

    await this.showGamesWithFilters(ctx, group.id, 'all');
  }

  private async showGamesWithFilters(ctx: Context, groupId: number, filter: 'all' | 'games' | 'trainings'): Promise<void> {
    const allGames = await this.services.gameService.getUpcomingGroupGames(groupId);

    // Применяем фильтр
    let filteredGames = allGames;
    if (filter === 'games') {
      filteredGames = allGames.filter(g => g.type === GameType.GAME);
    } else if (filter === 'trainings') {
      filteredGames = allGames.filter(g => g.type === GameType.TRAINING);
    }

    // Создаём кнопки фильтров
    const filterButtons = [
      Markup.button.callback(filter === 'games' ? '✅ Игры' : 'Игры', `filter_games_${groupId}`),
      Markup.button.callback(filter === 'trainings' ? '✅ Тренировки' : 'Тренировки', `filter_trainings_${groupId}`),
      Markup.button.callback(filter === 'all' ? '✅ Всё' : 'Всё', `filter_all_${groupId}`)
    ];

    if (filteredGames.length === 0) {
      const message = filter === 'games' 
        ? '📭 Пока нет запланированных игр.\n\nСоздайте новую: /newgame'
        : filter === 'trainings'
        ? '📭 Пока нет запланированных тренировок.\n\nСоздайте новую: /newtraining'
        : '📭 Пока нет запланированных игр и тренировок.\n\nСоздайте: /newgame или /newtraining';
      
      await ctx.reply(message, Markup.inlineKeyboard([filterButtons]));
      return;
    }

    // Если одна игра/тренировка - показываем сразу с кнопками
    if (filteredGames.length === 1) {
      const game = filteredGames[0];
      await this.showGameDetails(ctx, game, filterButtons);
      return;
    }

    // Несколько - показываем список кнопок
    const keyboard = KeyboardBuilder.createGameListKeyboard(filteredGames);

    const emoji = filter === 'games' ? '🎮' : filter === 'trainings' ? '🏋️' : '📋';
    const title = filter === 'games' ? 'Предстоящие игры' : filter === 'trainings' ? 'Предстоящие тренировки' : 'Предстоящие игры и тренировки';

    if (keyboard && keyboard.reply_markup && keyboard.reply_markup.inline_keyboard) {
      await ctx.reply(
        `${emoji} ${title} (${filteredGames.length}):\n\nВыберите:`,
        {
          ...keyboard,
          reply_markup: {
            inline_keyboard: [
              filterButtons,
              ...keyboard.reply_markup.inline_keyboard
            ]
          }
        }
      );
    }
  }

  private async showGameDetails(ctx: Context, game: any, filterButtons?: any[]): Promise<void> {
    const message = game.type === GameType.TRAINING
      ? GameMessageBuilder.buildTrainingCard(game)
      : GameMessageBuilder.formatGameCard(game);
    
    const confirmedCount = game.participants?.filter((p: any) => p.participation_status === ParticipationStatus.CONFIRMED).length || 0;
    
    // Проверяем является ли пользователь админом
    let isAdmin = false;
    if (ctx.from) {
      const user = await this.services.userService.getUserByTelegramId(ctx.from.id);
      if (user) {
        isAdmin = await this.services.groupService.isUserAdmin(user.id, game.group_id);
      }
    }
    
    const actionKeyboard = KeyboardBuilder.createGameActionsKeyboard(game.id, confirmedCount, isAdmin);
    
    // Если есть кнопки фильтров - добавляем их сверху
    if (filterButtons) {
      await ctx.reply(message, {
        ...actionKeyboard,
        reply_markup: {
          inline_keyboard: [
            filterButtons,
            ...actionKeyboard.reply_markup!.inline_keyboard!
          ]
        },
        parse_mode: 'Markdown'
      });
    } else {
      await ctx.reply(message, {
        ...actionKeyboard,
        parse_mode: 'Markdown'
      });
    }
  }
}
