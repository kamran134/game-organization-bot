import { Context } from 'telegraf';
import { CommandHandler } from './base/CommandHandler';
import { KeyboardBuilder } from '../ui/KeyboardBuilder';
import { GameMessageBuilder } from '../ui/GameMessageBuilder';
import { ParticipationStatus } from '../../models/GameParticipant';

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

    const games = await this.services.gameService.getUpcomingGroupGames(group.id);

    if (games.length === 0) {
      await ctx.reply(
        '📭 Пока нет запланированных игр.\n\n' +
        'Создайте новую: /newgame'
      );
      return;
    }

    // Если одна игра - показываем сразу с кнопками
    if (games.length === 1) {
      const game = games[0];
      await this.showGameDetails(ctx, game);
      return;
    }

    // Несколько игр - показываем список кнопок
    const keyboard = KeyboardBuilder.createGameListKeyboard(games);

    await ctx.reply(
      `🎮 Предстоящие игры (${games.length}):\n\nВыберите игру:`,
      keyboard
    );
  }

  private async showGameDetails(ctx: Context, game: any): Promise<void> {
    const message = GameMessageBuilder.formatGameCard(game);
    const confirmedCount = game.participants?.filter((p: any) => p.participation_status === ParticipationStatus.CONFIRMED).length || 0;
    
    // Проверяем является ли пользователь админом
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
