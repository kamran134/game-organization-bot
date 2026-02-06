import { Game } from '../../models/Game';
import { GameCreationState } from '../../utils/GameCreationState';
import { formatDate, formatParticipantsList } from './formatters';

export class GameMessageBuilder {
  /**
   * Полная карточка игры с деталями
   */
  static formatGameCard(game: Game): string {
    const sportEmoji = game.sport?.emoji || '⚽';
    const sportName = game.sport?.name || 'Игра';
    
    const confirmedCount = game.participants?.filter(p => p.participation_status === 'confirmed').length || 0;
    const maybeCount = game.participants?.filter(p => p.participation_status === 'maybe').length || 0;

    let text = `${sportEmoji} ${sportName}\n\n`;
    text += `📅 Дата: ${formatDate(game.game_date)}\n`;
    
    const locationName = game.location?.name || game.location_text || 'Не указано';
    text += `📍 Место: ${locationName}\n`;
    
    if (game.location?.map_url) {
      text += `🗺 [Открыть на карте](${game.location.map_url})\n`;
    }
    
    text += `👥 Участники: ${confirmedCount}/${game.max_participants}`;
    
    if (maybeCount > 0) {
      text += ` (ещё ${maybeCount} под вопросом)`;
    }
    text += `\n`;

    if (game.min_participants) {
      text += `Минимум: ${game.min_participants}\n`;
    }

    if (game.cost) {
      text += `💰 Стоимость: ${game.cost} ₼\n`;
    }
    if (game.notes) {
      text += `\n📝 Заметки: ${game.notes}`;
    }

    return text;
  }

  /**
   * Краткая информация об игре (для списка)
   */
  static formatGameSummary(game: Game): string {
    const sportEmoji = game.sport?.emoji || '⚽';
    const sportName = game.sport?.name || 'Игра';
    const confirmedCount = game.participants?.filter(p => p.participation_status === 'confirmed').length || 0;
    
    return `${sportEmoji} ${sportName} - ${formatDate(game.game_date)}\n` +
           `📍 ${game.location?.name || game.location_text || 'Не указано'} | 👥 ${confirmedCount}/${game.max_participants}`;
  }

  /**
   * Подтверждение создания игры
   */
  static formatGameConfirmation(state: GameCreationState): string {
    const sportName = state.data.sportName || 'Игра';
    const sportEmoji = '⚽'; // TODO: получать emoji из БД по sportId

    let text = `🎮 Подтверждение создания игры\n\n`;
    text += `${sportEmoji} Вид спорта: ${sportName}\n`;
    text += `📅 Дата: ${formatDate(state.data.gameDate!)}\n`;
    text += `📍 Место: ${state.data.locationName || 'Не указано'}\n`;
    text += `👥 Максимум участников: ${state.data.maxParticipants}\n`;
    
    if (state.data.minParticipants) {
      text += `Минимум участников: ${state.data.minParticipants}\n`;
    }

    if (state.data.cost) {
      text += `💰 Стоимость: ${state.data.cost} ₼\n`;
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
   * Сообщение "игра не найдена"
   */
  static formatGameNotFoundMessage(): string {
    return '❌ Игра не найдена или была удалена.';
  }

  /**
   * Сообщение об успешной записи на игру
   */
  static formatJoinSuccessMessage(status: 'confirmed' | 'maybe'): string {
    if (status === 'confirmed') {
      return '✅ Вы записаны на игру!';
    } else {
      return '❓ Вы отметились как "Возможно приду"';
    }
  }

  /**
   * Сообщение об отказе от игры
   */
  static formatLeaveSuccessMessage(): string {
    return '👋 Вы отказались от участия в игре';
  }
}
