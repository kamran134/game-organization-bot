import { Context, Markup } from 'telegraf';
import { GameType } from '../../models/GameType';
import { KeyboardBuilder } from './KeyboardBuilder';
import { GameMessageBuilder } from './GameMessageBuilder';
import { ParticipationStatus } from '../../models/GameParticipant';

export type GamesFilter = 'all' | 'games' | 'trainings';

interface GamesViewServices {
  gameService: any;
  groupService: any;
  userService: any;
}

/**
 * Shared rendering logic for the games list used by both
 * GamesCommand (creates new message) and GamesFilterHandler (edits existing message).
 */
export class GamesView {
  static buildFilterButtons(filter: GamesFilter, groupId: number) {
    return [
      Markup.button.callback(filter === 'games' ? '✅ Игры' : 'Игры', `filter_games_${groupId}`),
      Markup.button.callback(filter === 'trainings' ? '✅ Тренировки' : 'Тренировки', `filter_trainings_${groupId}`),
      Markup.button.callback(filter === 'all' ? '✅ Всё' : 'Всё', `filter_all_${groupId}`),
    ];
  }

  static filterGames(allGames: any[], filter: GamesFilter): any[] {
    if (filter === 'games') return allGames.filter((g) => g.type === GameType.GAME);
    if (filter === 'trainings') return allGames.filter((g) => g.type === GameType.TRAINING);
    return allGames;
  }

  static getEmptyMessage(filter: GamesFilter): string {
    if (filter === 'games') return '📭 Пока нет запланированных игр.\n\nСоздайте новую: /newgame';
    if (filter === 'trainings') return '📭 Пока нет запланированных тренировок.\n\nСоздайте новую: /newtraining';
    return '📭 Пока нет запланированных игр и тренировок.\n\nСоздайте: /newgame или /newtraining';
  }

  static getTitle(filter: GamesFilter): { emoji: string; title: string } {
    if (filter === 'games') return { emoji: '🎮', title: 'Предстоящие игры' };
    if (filter === 'trainings') return { emoji: '🏋️', title: 'Предстоящие тренировки' };
    return { emoji: '📋', title: 'Предстоящие игры и тренировки' };
  }

  static async show(
    ctx: Context,
    services: GamesViewServices,
    groupId: number,
    filter: GamesFilter,
    mode: 'reply' | 'edit'
  ): Promise<void> {
    const allGames = await services.gameService.getUpcomingGroupGames(groupId);
    const filteredGames = GamesView.filterGames(allGames, filter);
    const filterButtons = GamesView.buildFilterButtons(filter, groupId);

    if (filteredGames.length === 0) {
      const text = GamesView.getEmptyMessage(filter);
      const keyboard = Markup.inlineKeyboard([filterButtons]);
      if (mode === 'edit') {
        await (ctx as any).editMessageText(text, keyboard);
      } else {
        await ctx.reply(text, keyboard);
      }
      return;
    }

    if (filteredGames.length === 1) {
      await GamesView.showGameDetails(ctx, services, filteredGames[0], filterButtons, mode);
      return;
    }

    const listKeyboard = KeyboardBuilder.createGameListKeyboard(filteredGames);
    const { emoji, title } = GamesView.getTitle(filter);

    if (listKeyboard?.reply_markup?.inline_keyboard) {
      const text = `${emoji} ${title} (${filteredGames.length}):\n\nВыберите:`;
      const options: any = {
        ...listKeyboard,
        reply_markup: {
          inline_keyboard: [filterButtons, ...listKeyboard.reply_markup.inline_keyboard],
        },
      };
      if (mode === 'edit') {
        await (ctx as any).editMessageText(text, options);
      } else {
        await ctx.reply(text, options);
      }
    }
  }

  static async showGameDetails(
    ctx: Context,
    services: GamesViewServices,
    game: any,
    filterButtons: any[],
    mode: 'reply' | 'edit'
  ): Promise<void> {
    const message =
      game.type === GameType.TRAINING
        ? GameMessageBuilder.buildTrainingCard(game)
        : GameMessageBuilder.formatGameCard(game);

    const confirmedCount =
      game.participants?.filter(
        (p: any) => p.participation_status === ParticipationStatus.CONFIRMED
      ).length ?? 0;
    const maybeCount =
      game.participants?.filter(
        (p: any) => p.participation_status === ParticipationStatus.MAYBE
      ).length ?? 0;

    let isAdmin = false;
    if (ctx.from) {
      const user = await services.userService.getUserByTelegramId(ctx.from.id);
      if (user) {
        isAdmin = await services.groupService.isUserAdmin(user.id, game.group_id);
      }
    }

    const inGroup = ctx.chat?.type !== 'private';
    const actionKeyboard = KeyboardBuilder.createGameActionsKeyboard(
      game.id,
      confirmedCount,
      isAdmin,
      maybeCount,
      inGroup,
      game.registration_lock_hours
    );
    const msgOptions: any = {
      ...actionKeyboard,
      reply_markup: {
        inline_keyboard: [filterButtons, ...actionKeyboard.reply_markup!.inline_keyboard!],
      },
      parse_mode: 'Markdown',
    };

    if (mode === 'edit') {
      await (ctx as any).editMessageText(message, msgOptions);
    } else {
      await ctx.reply(message, msgOptions);
    }
  }
}
