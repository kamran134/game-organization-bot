import { Markup } from 'telegraf';
import type { InlineKeyboardButton } from 'telegraf/types';
import { Sport } from '../../models/Sport';
import { Game } from '../../models/Game';
import { Location } from '../../models/Location';

export class KeyboardBuilder {
  /**
   * Клавиатура выбора вида спорта
   */
  static createSportSelectionKeyboard(sports: Sport[]) {
    const buttons = sports.map(sport => [
      Markup.button.callback(`${sport.emoji} ${sport.name}`, `sport_${sport.id}`)
    ]);
    return Markup.inlineKeyboard(buttons);
  }

  /**
   * Клавиатура выбора вида спорта для создания локации
   */
  static createLocationSportSelectionKeyboard(sports: Sport[]) {
    const buttons = sports.map(sport => [
      Markup.button.callback(`${sport.emoji} ${sport.name}`, `location_sport_${sport.id}`)
    ]);
    return Markup.inlineKeyboard(buttons);
  }

  /**
   * Клавиатура выбора локации
   */
  static buildLocationSelectionKeyboard(locations: Location[]) {
    const buttons = locations.map(location => [
      Markup.button.callback(location.name, `location_${location.id}`)
    ]);
    
    // Добавляем кнопку "Другое место" для ввода своего варианта
    buttons.push([
      Markup.button.callback('📝 Другое место', 'location_custom')
    ]);
    
    return Markup.inlineKeyboard(buttons);
  }

  /**
   * Клавиатура выбора локации для управления (при создании новой локации)
   */
  static buildLocationManagementKeyboard(locations: Location[]) {
    const buttons = locations.map(location => [
      Markup.button.callback(location.name, `select_existing_location_${location.id}`)
    ]);
    
    // Добавляем кнопку "Создать новую"
    buttons.push([
      Markup.button.callback('➕ Создать новую локацию', 'create_new_location')
    ]);
    
    buttons.push([
      Markup.button.callback('❌ Отменить', 'cancel_location')
    ]);
    
    return Markup.inlineKeyboard(buttons);
  }

  /**
   * Клавиатура действий для игры (записаться/отказаться)
   * @param gameId - ID игры
   * @param confirmedCount - количество подтверждённых участников (для отображения в кнопке)
   * @param isAdmin - является ли пользователь администратором группы
   */
  static createGameActionsKeyboard(gameId: number, confirmedCount: number = 0, isAdmin: boolean = false, maybeCount: number = 0) {
    const buttons = [
      [Markup.button.callback(`✅ Точно (${confirmedCount})`, `join_confirmed_${gameId}`)],
      [Markup.button.callback(`❓ Не точно (${maybeCount})`, `join_maybe_${gameId}`)],
      [Markup.button.callback('❌ Отказаться', `leave_game_${gameId}`)],
      [Markup.button.callback('👥 Список участников', `show_participants_${gameId}`)],
    ];

    if (isAdmin) {
      buttons.push([Markup.button.callback('🗑 Удалить игру', `delete_game_${gameId}`)]);
    }

    return Markup.inlineKeyboard(buttons);
  }

  /**
   * Клавиатура списка игр
   */
  static createGameListKeyboard(games: Game[]) {
    if (games.length === 0) {
      return undefined;
    }

    const buttons = games.map(game => {
      const sportEmoji = game.sport?.emoji || '⚽';
      const label = `${sportEmoji} ${game.sport?.name || 'Игра'} - ${new Date(game.game_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`;
      return [Markup.button.callback(label, `view_game_${game.id}`)];
    });

    return Markup.inlineKeyboard(buttons);
  }

  /**
   * Клавиатура управления группой
   */
  static createGroupManagementKeyboard(groupId: number, isAdmin: boolean) {
    const buttons: InlineKeyboardButton[][] = [
      [Markup.button.callback('👥 Участники', `members_${groupId}`)],
    ];

    if (isAdmin) {
      buttons.push([
        Markup.button.callback('⚙️ Управление', `manage_${groupId}`)
      ]);
    }

    buttons.push([
      Markup.button.callback('🚪 Выйти из группы', `leave_group_${groupId}`)
    ]);

    return Markup.inlineKeyboard(buttons);
  }

  /**
   * Клавиатура для возврата к списку игр
   */
  static createBackToGamesKeyboard() {
    return Markup.inlineKeyboard([
      [Markup.button.callback('« Назад к играм', 'back_to_games')]
    ]);
  }

  /**
   * Клавиатура управления локациями (для админов)
   */
  static createLocationManagementKeyboard(locations: Location[], groupId: number) {
    const buttons = locations.map(location => [
      Markup.button.callback(`${location.name}`, `view_location_${location.id}`),
      Markup.button.callback('🗑', `delete_location_${location.id}`)
    ]);
    
    buttons.push([Markup.button.callback('« Назад', `group_${groupId}`)]);
    return Markup.inlineKeyboard(buttons);
  }

  /**
   * Клавиатура подтверждения создания игры
   */
  static createGameConfirmationKeyboard(userId?: number) {
    const confirmAction = userId ? `confirm_game_${userId}` : 'confirm_game';
    const cancelAction = userId ? `cancel_game_${userId}` : 'cancel_game';
    
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Создать', confirmAction),
        Markup.button.callback('❌ Отмена', cancelAction),
      ]
    ]);
  }

  /**
   * Клавиатура списка групп пользователя
   */
  static createUserGroupsKeyboard(groups: Array<{ id: number; name: string }>) {
    if (groups.length === 0) {
      return undefined;
    }

    const buttons = groups.map(group => [
      Markup.button.callback(group.name, `group_${group.id}`)
    ]);

    return Markup.inlineKeyboard(buttons);
  }
}
