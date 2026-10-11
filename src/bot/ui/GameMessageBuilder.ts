import { Game } from '../../models/Game';
import { CreationState } from '../../utils/CreationState';
import { formatDate, formatParticipantsList } from './formatters';
import { escapeMarkdownV1, escapeMarkdownUrl } from '../../utils/helpers';
import { KeyboardBuilder } from './KeyboardBuilder';

/** Currency symbol — override via CURRENCY_SYMBOL env var if needed. */
const CURRENCY = process.env.CURRENCY_SYMBOL ?? '₼';

export class GameMessageBuilder {
  /**
   * Полная карточка игры с деталями
   */
  static formatGameCard(game: Game): string {
    const sportEmoji = game.sport?.emoji || '⚽';
    const sportName = game.sport?.name || 'Игра';
    
    const confirmedCount = game.participants?.filter(p => p.participation_status === 'confirmed').length || 0;
    const maybeCount     = game.participants?.filter(p => p.participation_status === 'maybe').length || 0;
    const guestCount     = game.participants?.filter(p => p.participation_status === 'guest').length || 0;

    let text = `${sportEmoji} ${escapeMarkdownV1(sportName)}\n\n`;
    text += `📅 Дата: ${formatDate(game.game_date)}\n`;
    
    const locationName = game.location?.name || game.location_text || 'Не указано';
    text += `📍 Место: ${escapeMarkdownV1(locationName)}\n`;
    
    if (game.location?.map_url) {
      text += `🗺 [Открыть на карте](${escapeMarkdownUrl(game.location.map_url)})\n`;
    }
    
    const maxDisplay = game.max_participants === 999 ? 'Безлимит' : game.max_participants;
    text += `👥 Участники: ${confirmedCount}/${maxDisplay}`;
    
    if (maybeCount > 0) {
      text += ` (ещё ${maybeCount} под вопросом)`;
    }
    if (guestCount > 0) {
      text += ` + ${guestCount} гост${guestCount === 1 ? 'ь' : guestCount < 5 ? 'я' : 'ей'}`;
    }
    text += `\n`;

    if (game.min_participants) {
      text += `Минимум: ${game.min_participants}\n`;
    }

    if (game.cost) {
      text += `💰 Стоимость: ${game.cost} ${CURRENCY}\n`;
    }
    if (game.notes) {
      text += `\n📝 Заметки: ${escapeMarkdownV1(game.notes)}`;
    }

    if (game.registration_lock_hours) {
      const lockAt = new Date(new Date(game.game_date).getTime() - game.registration_lock_hours * 3600 * 1000);
      const isLocked = new Date() >= lockAt;
      if (isLocked) {
        text += `\n\n🔒 Запись закрыта`;
      } else {
        const timeStr = lockAt.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
        text += `\n\n🔒 Запись закроется ${timeStr}`;
      }
    }

    return text;
  }

  /**
   * Подтверждение создания игры
   */
  static formatGameConfirmation(state: CreationState): string {
    const sportName = state.data.sportName || '⚽ Игра';

    let text = `🎮 Подтверждение создания игры\n\n`;
    text += `Вид спорта: ${sportName}\n`;
    text += `📅 Дата: ${formatDate(state.data.gameDate!)}\n`;
    text += `📍 Место: ${state.data.locationName || 'Не указано'}\n`;
    text += `👥 Максимум участников: ${state.data.maxParticipants}\n`;
    
    if (state.data.minParticipants) {
      text += `Минимум участников: ${state.data.minParticipants}\n`;
    }

    if (state.data.cost) {
      text += `💰 Стоимость: ${state.data.cost} ${CURRENCY}\n`;
    }

    if (state.data.notes) {
      text += `\n📝 Заметки: ${state.data.notes}`;
    }

    return text;
  }

  /**
   * Сообщение со списком участников
   */
  static formatParticipantsMessage(game: Game): string {
    const sportEmoji = game.sport?.emoji || '⚽';
    const sportName = game.sport?.name || 'Игра';
    
    let text = `👥 Участники игры\n`;
    text += `${sportEmoji} ${sportName}\n`;
    text += `📅 ${formatDate(game.game_date)}\n\n`;

    if (game.participants && game.participants.length > 0) {
      text += formatParticipantsList(game.participants);
    } else {
      text += 'Пока никто не записался';
    }

    return text;
  }

  /**
   * Сообщение об успешном создании игры
   */
  static formatGameCreatedMessage(game: Game): string {
    return `✅ Игра создана!\n\n${this.formatGameCard(game)}`;
  }

  /**
   * Универсальное подтверждение (для игр и тренировок)
   */
  static buildConfirmationMessage(
    sportName: string,
    gameDate: Date,
    locationName: string,
    minParticipants: number,
    maxParticipants: number,
    cost?: number,
    notes?: string,
    prefix: string = '🎮 ИГРА'
  ): string {
    let text = `${prefix}\n\n`;
    text += `🏃 Вид спорта: ${sportName}\n`;
    text += `📅 Дата: ${formatDate(gameDate)}\n`;
    text += `📍 Место: ${locationName}\n`;
    text += `👥 Минимум: ${minParticipants}, Максимум: ${maxParticipants === 999 ? 'Безлимит' : maxParticipants}\n`;
    
    if (cost !== undefined && cost > 0) {
      text += `💰 Стоимость: ${cost} ${CURRENCY}\n`;
    }

    if (notes) {
      text += `\n📝 Заметки: ${notes}`;
    }

    return text;
  }

  /**
   * Карточка тренировки
   */
  static buildTrainingCard(training: Game): string {
    const sportName = training.sport?.name || 'Тренировка';

    const confirmedCount = training.participants?.filter(p => p.participation_status === 'confirmed').length || 0;
    const maybeCount = training.participants?.filter(p => p.participation_status === 'maybe').length || 0;

    let text = `🏋️ ${escapeMarkdownV1(sportName)}\n\n`;
    text += `📅 Дата: ${formatDate(training.game_date)}\n`;
    
    const locationName = training.location?.name || training.location_text || 'Не указано';
    text += `📍 Место: ${escapeMarkdownV1(locationName)}\n`;
    
    if (training.location?.map_url) {
      text += `🗺 [Открыть на карте](${escapeMarkdownUrl(training.location.map_url)})\n`;
    }
    
    const maxDisplay = training.max_participants === 999 ? 'Безлимит' : training.max_participants;
    text += `👥 Участники: ${confirmedCount}/${maxDisplay}`;
    
    if (maybeCount > 0) {
      text += ` (ещё ${maybeCount} под вопросом)`;
    }
    text += `\n`;

    if (training.min_participants) {
      text += `Минимум: ${training.min_participants}\n`;
    }

    if (training.cost && training.cost > 0) {
      text += `💰 Стоимость: ${training.cost} ${CURRENCY}\n`;
    }
    if (training.notes) {
      text += `\n📝 Заметки: ${escapeMarkdownV1(training.notes)}`;
    }

    if (training.registration_lock_hours) {
      const lockAt = new Date(new Date(training.game_date).getTime() - training.registration_lock_hours * 3600 * 1000);
      const isLocked = new Date() >= lockAt;
      if (isLocked) {
        text += `\n\n🔒 Запись закрыта`;
      } else {
        const timeStr = lockAt.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
        text += `\n\n🔒 Запись закроется ${timeStr}`;
      }
    }

    return text;
  }

  /**
   * Клавиатура действий для игры/тренировки
   */
  static buildGameActionsKeyboard(gameId: number, confirmedCount: number, isAdmin: boolean, maybeCount: number = 0, inGroup: boolean = true) {
    return KeyboardBuilder.createGameActionsKeyboard(gameId, confirmedCount, isAdmin, maybeCount, inGroup);
  }
}
