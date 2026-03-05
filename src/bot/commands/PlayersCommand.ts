import { Context, Markup } from 'telegraf';
import { CommandHandler } from './base/CommandHandler';
import { GameMessageBuilder } from '../ui/GameMessageBuilder';
import { GameType } from '../../models/GameType';
import { formatDate } from '../ui/formatters';

export class PlayersCommand extends CommandHandler {
  get command(): string {
    return 'players';
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
      await ctx.reply('📭 Нет запланированных игр.');
      return;
    }

    // Если одна игра — сразу показываем список участников
    if (games.length === 1) {
      const message = GameMessageBuilder.formatParticipantsMessage(games[0]);
      await ctx.reply(message);
      return;
    }

    // Если несколько — показываем кнопки для выбора игры
    const buttons = games.map((g) => {
      const sport = g.sport ? `${g.sport.emoji} ${g.sport.name}` : 'Игра';
      const date = formatDate(g.game_date);
      const typeLabel = g.type === GameType.TRAINING ? '🏃' : '🎮';
      return [Markup.button.callback(
        `${typeLabel} ${sport} — ${date}`,
        `show_participants_${g.id}`,
      )];
    });

    await ctx.reply(
      '👥 Выберите игру для просмотра участников:',
      Markup.inlineKeyboard(buttons),
    );
  }
}
