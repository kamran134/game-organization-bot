import { Context, Markup } from 'telegraf';
import { ExtraEditMessageText, ExtraReplyMessage } from 'telegraf/typings/telegram-types';
import { GameType } from '../../models/GameType';
import { KeyboardBuilder } from './KeyboardBuilder';
import { GameMessageBuilder } from './GameMessageBuilder';
import { Game } from '../../models/Game';
import { GameParticipant, ParticipationStatus } from '../../models/GameParticipant';
import { GameService } from '../../services/GameService';
import { GroupService } from '../../services/GroupService';
import { UserService } from '../../services/UserService';
import { isMessageNotModified } from '../utils/telegramErrors';

export type GamesFilter = 'all' | 'games' | 'trainings';

export interface GamesViewServices {
  gameService: Pick<GameService, 'getUpcomingGroupGames'>;
  groupService: Pick<GroupService, 'isUserAdmin'>;
  userService: Pick<UserService, 'getUserByTelegramId'>;
}

type FilterButtons = ReturnType<typeof GamesView.buildFilterButtons>;
type MessageOptions = ExtraReplyMessage & ExtraEditMessageText;

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

  static filterGames(allGames: Game[], filter: GamesFilter): Game[] {
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

  /** Edits the message in place; re-tapping the active filter yields an identical message, which is not an error. */
  private static async edit(ctx: Context, text: string, extra: MessageOptions): Promise<void> {
    try {
      await ctx.editMessageText(text, extra);
    } catch (error) {
      if (!isMessageNotModified(error)) throw error;
    }
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
        await GamesView.edit(ctx, text, keyboard);
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
      const options: MessageOptions = {
        ...listKeyboard,
        reply_markup: {
          inline_keyboard: [filterButtons, ...listKeyboard.reply_markup.inline_keyboard],
        },
      };
      if (mode === 'edit') {
        await GamesView.edit(ctx, text, options);
      } else {
        await ctx.reply(text, options);
      }
    }
  }

  static async showGameDetails(
    ctx: Context,
    services: GamesViewServices,
    game: Game,
    filterButtons: FilterButtons,
    mode: 'reply' | 'edit'
  ): Promise<void> {
    const message =
      game.type === GameType.TRAINING
        ? GameMessageBuilder.buildTrainingCard(game)
        : GameMessageBuilder.formatGameCard(game);

    const confirmedCount =
      game.participants?.filter(
        (p: GameParticipant) => p.participation_status === ParticipationStatus.CONFIRMED
      ).length ?? 0;
    const maybeCount =
      game.participants?.filter(
        (p: GameParticipant) => p.participation_status === ParticipationStatus.MAYBE
      ).length ?? 0;

    // Admin buttons exist only in private chats, so the lookup is pointless in a group
    const inGroup = ctx.chat?.type !== 'private';
    let isAdmin = false;
    if (!inGroup && ctx.from) {
      const user = await services.userService.getUserByTelegramId(ctx.from.id);
      if (user) {
        isAdmin = await services.groupService.isUserAdmin(user.id, game.group_id);
      }
    }

    const actionKeyboard = KeyboardBuilder.createGameActionsKeyboard(
      game.id,
      confirmedCount,
      isAdmin,
      maybeCount,
      inGroup,
      game.registration_lock_hours,
      game
    );
    const msgOptions: MessageOptions = {
      ...actionKeyboard,
      reply_markup: {
        inline_keyboard: [filterButtons, ...actionKeyboard.reply_markup!.inline_keyboard!],
      },
      parse_mode: 'Markdown',
    };

    if (mode === 'edit') {
      await GamesView.edit(ctx, message, msgOptions);
    } else {
      await ctx.reply(message, msgOptions);
    }
  }
}
