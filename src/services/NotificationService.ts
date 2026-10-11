import { Telegram } from 'telegraf';
import { GroupService } from './GroupService';
import { JokeService } from './JokeService';
import { Game } from '../models/Game';
import { Group } from '../models/Group';
import { User } from '../models/User';
import { GameType } from '../models/GameType';
import { ParticipationStatus, countCertainPlayers } from '../models/GameParticipant';
import { GameMessageBuilder } from '../bot/ui/GameMessageBuilder';
import { KeyboardBuilder } from '../bot/ui/KeyboardBuilder';
import { formatDate, formatMembersMentions, formatMention } from '../bot/ui/formatters';
import { escapeHtml } from '../utils/helpers';

/** Where the action that triggered the notification came from; the web variants carry a participants list. */
export type NotifyVia = 'web';

/**
 * Single place for messages the bot posts into group chats. Every method swallows its own
 * errors: a failed notification must never break the action that triggered it.
 */
export class NotificationService {
  constructor(
    private readonly telegram: Telegram,
    private readonly groupService: GroupService,
    private readonly jokeService: JokeService,
  ) {}

  /** `game` must be loaded with group and participants, after the participant change was saved. */
  async notifyJoined(
    game: Game,
    user: User,
    status: ParticipationStatus,
    isUpdate: boolean,
    via?: NotifyVia,
  ): Promise<void> {
    try {
      const chatId = this.chatIdOf(game.group, game.id);
      if (chatId === null) return;

      const name = escapeHtml(user.fullName);
      const maybe = status === ParticipationStatus.MAYBE;
      const emoji = maybe ? '❓' : '✅';

      let text: string;
      if (via === 'web') {
        const action = maybe ? 'Новая запись "не точно" (веб):' : 'Новая запись (веб):';
        const participants = escapeHtml(GameMessageBuilder.formatParticipantsMessage(game));
        text = `${emoji} ${action} ${name}\n\n${participants}`;
      } else {
        const label = isUpdate ? 'Обновление:' : 'Новая запись:';
        const state = maybe ? 'возможно придёт' : 'точно идёт';
        text = `${emoji} ${label} ${name} — ${state}`;
      }

      await this.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Failed to send join notification to group:', error);
    }
  }

  /** `game` must be loaded with group and participants, after the participant was removed. */
  async notifyDeclined(game: Game, user: User, via?: NotifyVia): Promise<void> {
    try {
      const chatId = this.chatIdOf(game.group, game.id);
      if (chatId === null) return;

      const userName = user.fullName;
      const joke = await this.jokeService.getDeclineJoke(userName);
      const suffix = via === 'web' ? ' через веб-приложение' : '';
      let text = `❌ ${escapeHtml(userName)} отказался от участия${suffix}\n\n🤖 <i>${escapeHtml(joke)}</i>`;
      if (via === 'web') {
        text += `\n\n${escapeHtml(GameMessageBuilder.formatParticipantsMessage(game))}`;
      }

      await this.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Failed to send decline notification to group:', error);
    }
  }

  /** Posts the game card with the signup buttons; used when a game is created outside the group chat. */
  async notifyGameCreated(game: Game): Promise<void> {
    try {
      const chatId = this.chatIdOf(game.group, game.id);
      if (chatId === null) return;

      // The card is built as legacy Markdown by GameMessageBuilder, so it keeps that parse mode
      await this.telegram.sendMessage(chatId, GameMessageBuilder.formatGameCreatedMessage(game), {
        parse_mode: 'Markdown',
        ...KeyboardBuilder.createGameActionsKeyboard(game.id, 0, false, 0, true),
      });
    } catch (error) {
      console.error('Failed to send game created notification to group:', error);
    }
  }

  /** The "👆" ping that mentions every active member under a freshly created game card. */
  async mentionMembers(groupId: number): Promise<void> {
    try {
      const group = await this.groupService.getGroupById(groupId);
      const chatId = this.chatIdOf(group ?? undefined, groupId);
      if (chatId === null) return;

      const members = await this.groupService.getGroupMembers(groupId);
      const mentions = formatMembersMentions(members);
      if (!mentions) return;

      await this.telegram.sendMessage(chatId, `👆 ${mentions}`, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Failed to send mention notification to group:', error);
    }
  }

  /** `game` must be loaded with group and sport. */
  async notifyGameDeleted(game: Game): Promise<void> {
    try {
      const chatId = this.chatIdOf(game.group, game.id);
      if (chatId === null) return;

      const sportName = game.sport ? `${game.sport.emoji} ${game.sport.name}` : 'Игра';
      const dateStr = new Date(game.game_date).toLocaleString('ru-RU', {
        day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
      });
      await this.telegram.sendMessage(
        chatId,
        `🗑 Игра удалена администратором\n\n${escapeHtml(sportName)}\n📅 ${dateStr}`,
        { parse_mode: 'HTML' },
      );
    } catch (error) {
      console.error('Failed to send delete notification to group:', error);
    }
  }

  /** `game` must be loaded with group, sport, location and participants (with users), after the cancellation was saved. */
  async notifyCancelled(game: Game, reason: 'manual' | 'min_not_reached'): Promise<void> {
    try {
      const chatId = this.chatIdOf(game.group, game.id);
      if (chatId === null) return;

      const what = game.type === GameType.TRAINING ? 'Тренировка отменена' : 'Игра отменена';
      let text = `🚫 ${what}`;
      if (reason === 'min_not_reached') {
        text += `: не набралось минимальное количество участников (${countCertainPlayers(game.participants)}/${game.min_participants})`;
      }

      const sportName = game.sport ? `${game.sport.emoji} ${game.sport.name}` : what;
      text += `\n\n${escapeHtml(sportName)}\n📅 ${escapeHtml(formatDate(game.game_date))}`;
      if (game.location) text += `\n📍 ${escapeHtml(game.location.name)}`;

      const participants = game.participants ?? [];
      const people = [
        ...participants.filter((p) => p.user).map((p) => formatMention(p.user!)),
        // Guests have no Telegram account to mention: plain escaped names
        ...participants.filter((p) => !p.user).map((p) => escapeHtml(p.guest_name || 'Гость')),
      ];
      if (people.length > 0) text += `\n\n👥 ${people.join(', ')}`;

      await this.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Failed to send cancel notification to group:', error);
    }
  }

  /** Telegram chat of the group, or null (and a log line) when the group is not linked to one. */
  private chatIdOf(group: Group | undefined, subjectId: number): number | null {
    if (!group?.telegram_chat_id) {
      console.warn('Group has no telegram_chat_id, notification skipped for id:', subjectId);
      return null;
    }
    // The bigint column comes back from the driver as a string
    return Number(group.telegram_chat_id);
  }
}
