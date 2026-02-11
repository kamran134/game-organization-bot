import { Telegraf, Context } from 'telegraf';
import { GameType } from '../../models/GameType';
import { KeyboardBuilder } from '../ui/KeyboardBuilder';
import { GameMessageBuilder } from '../ui/GameMessageBuilder';
import { ParticipationStatus } from '../../models/GameParticipant';
import { Markup } from 'telegraf';

interface HandlerServices {
  gameService: any;
  groupService: any;
  userService: any;
}

export class GamesFilterHandler {
  constructor(
    private bot: Telegraf,
    private services: HandlerServices
  ) {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Обработчики фильтров
    this.bot.action(/^filter_(games|trainings|all)_(\d+)$/, this.handleFilter.bind(this));
  }

  private async handleFilter(ctx: Context): Promise<void> {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

    const match = ctx.callbackQuery.data.match(/^filter_(games|trainings|all)_(\d+)$/);
    if (!match) return;

    const [, filterType, groupIdStr] = match;
    const groupId = parseInt(groupIdStr);

    await ctx.answerCbQuery();

    const allGames = await this.services.gameService.getUpcomingGroupGames(groupId);

    // Применяем фильтр
    let filteredGames = allGames;
    if (filterType === 'games') {
      filteredGames = allGames.filter((g: any) => g.type === GameType.GAME);
    } else if (filterType === 'trainings') {
      filteredGames = allGames.filter((g: any) => g.type === GameType.TRAINING);
    }

    // Создаём кнопки фильтров
    const filterButtons = [
      Markup.button.callback(filterType === 'games' ? '✅ Игры' : 'Игры', `filter_games_${groupId}`),
      Markup.button.callback(filterType === 'trainings' ? '✅ Тренировки' : 'Тренировки', `filter_trainings_${groupId}`),
      Markup.button.callback(filterType === 'all' ? '✅ Всё' : 'Всё', `filter_all_${groupId}`)
    ];

    if (filteredGames.length === 0) {
      const message = filterType === 'games' 
        ? '📭 Пока нет запланированных игр.\n\nСоздайте новую: /newgame'
        : filterType === 'trainings'
        ? '📭 Пока нет запланированных тренировок.\n\nСоздайте новую: /newtraining'
        : '📭 Пока нет запланированных игр и тренировок.\n\nСоздайте: /newgame или /newtraining';
      
      await ctx.editMessageText(message, Markup.inlineKeyboard([filterButtons]));
      return;
    }

    // Если одна игра/тренировка - показываем детали
    if (filteredGames.length === 1) {
      const game = filteredGames[0];
      await this.showGameDetails(ctx, game, filterButtons);
      return;
    }

    // Несколько - показываем список
    const keyboard = KeyboardBuilder.createGameListKeyboard(filteredGames);

    const emoji = filterType === 'games' ? '🎮' : filterType === 'trainings' ? '🏋️' : '📋';
    const title = filterType === 'games' ? 'Предстоящие игры' : filterType === 'trainings' ? 'Предстоящие тренировки' : 'Предстоящие игры и тренировки';

    if (keyboard && keyboard.reply_markup && keyboard.reply_markup.inline_keyboard) {
      await ctx.editMessageText(
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

  private async showGameDetails(ctx: Context, game: any, filterButtons: any[]): Promise<void> {
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
    
    await ctx.editMessageText(message, {
      ...actionKeyboard,
      reply_markup: {
        inline_keyboard: [
          filterButtons,
          ...actionKeyboard.reply_markup!.inline_keyboard!
        ]
      },
      parse_mode: 'Markdown'
    });
  }
}
