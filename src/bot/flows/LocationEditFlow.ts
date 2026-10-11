import { Context, Markup } from 'telegraf';
import { LocationEditState, LocationEditStateManager } from '../../utils/LocationEditState';
import { LocationService } from '../../services/LocationService';
import { SportService } from '../../services/SportService';

interface LocationEditServices {
  locationService: LocationService;
  sportService: SportService;
  locationEditStates: LocationEditStateManager;
}

export class LocationEditFlow {
  private services: LocationEditServices;

  constructor(services: LocationEditServices) {
    this.services = services;
  }

  /**
   * Показать меню редактирования локации
   */
  async showEditMenu(ctx: Context, state: LocationEditState): Promise<void> {
    const location = await this.services.locationService.getById(state.data.locationId);
    
    if (!location) {
      await ctx.editMessageText('❌ Локация не найдена');
      this.services.locationEditStates.delete(ctx.from!.id);
      return;
    }

    const sports = location.sportLocations?.map(sl => `${sl.sport.emoji} ${sl.sport.name}`).join(', ') || 'Не указаны';

    const message = 
      `📍 Редактирование локации\n\n` +
      `Название: ${location.name}\n` +
      `Виды спорта: ${sports}\n` +
      `Карта: ${location.map_url || 'Не указана'}\n\n` +
      `Что вы хотите изменить?`;

    await ctx.editMessageText(
      message,
      Markup.inlineKeyboard([
        [Markup.button.callback('✏️ Название', `edit_location_name_${location.id}`)],
        [Markup.button.callback('🗺 Ссылку на карту', `edit_location_map_${location.id}`)],
        [Markup.button.callback('🏃 Виды спорта', `edit_location_sports_${location.id}`)],
        [Markup.button.callback('❌ Отменить', 'cancel_edit_location')]
      ])
    );
  }

  /**
   * Начать редактирование названия
   */
  async startNameEdit(ctx: Context, state: LocationEditState): Promise<void> {
    state.step = 'name';

    await ctx.editMessageText(
      `✏️ Введите новое название локации:\n` +
      `⚠️ Ответьте (reply) на это сообщение!\n\n` +
      `Текущее: ${state.data.locationName}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('❌ Отменить', 'cancel_edit_location')]
      ])
    );
  }

  /**
   * Обработать новое название
   */
  async handleNameInput(ctx: Context, state: LocationEditState): Promise<void> {
    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply('❌ Пожалуйста, отправьте текстовое сообщение с названием.');
      return;
    }

    const newName = ctx.message.text.trim();

    if (newName.length === 0) {
      await ctx.reply('❌ Название не может быть пустым.');
      return;
    }

    if (newName.length > 255) {
      await ctx.reply('❌ Название слишком длинное. Максимум 255 символов.');
      return;
    }

    try {
      await this.services.locationService.update(state.data.locationId, { name: newName });

      await ctx.reply(
        `✅ Название обновлено!\n\n` +
        `Было: ${state.data.locationName}\n` +
        `Стало: ${newName}`
      );

      this.services.locationEditStates.delete(ctx.from!.id);
    } catch (error) {
      console.error('Error updating location name:', error);
      await ctx.reply('❌ Произошла ошибка при обновлении названия. Попробуйте позже.');
    }
  }

  /**
   * Начать редактирование ссылки на карту
   */
  async startMapUrlEdit(ctx: Context, state: LocationEditState): Promise<void> {
    state.step = 'map_url';

    const location = await this.services.locationService.getById(state.data.locationId);
    const currentUrl = location?.map_url || 'Не указана';

    await ctx.editMessageText(
      `🗺 Введите новую ссылку на карту или "-" для удаления:\n` +
      `⚠️ Ответьте (reply) на это сообщение!\n\n` +
      `Текущая: ${currentUrl}\n\n` +
      `Примеры:\n` +
      `https://maps.google.com/?q=40.4093,49.8671\n` +
      `https://yandex.ru/maps/?ll=49.867,40.409&z=15`,
      Markup.inlineKeyboard([
        [Markup.button.callback('❌ Отменить', 'cancel_edit_location')]
      ])
    );
  }

  /**
   * Обработать новую ссылку на карту
   */
  async handleMapUrlInput(ctx: Context, state: LocationEditState): Promise<void> {
    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply('❌ Пожалуйста, отправьте текстовое сообщение со ссылкой или "-".');
      return;
    }

    const mapUrl = ctx.message.text.trim();
    let newMapUrl: string | undefined = undefined;

    if (mapUrl !== '-') {
      if (mapUrl.length > 500) {
        await ctx.reply('❌ Ссылка слишком длинная. Максимум 500 символов.');
        return;
      }

      if (!mapUrl.startsWith('http://') && !mapUrl.startsWith('https://')) {
        await ctx.reply('❌ Ссылка должна начинаться с http:// или https://');
        return;
      }

      newMapUrl = mapUrl;
    }

    try {
      await this.services.locationService.update(state.data.locationId, { map_url: newMapUrl || '' });

      const message = newMapUrl 
        ? `✅ Ссылка на карту обновлена!\n\n🗺 ${newMapUrl}`
        : `✅ Ссылка на карту удалена`;

      await ctx.reply(message);

      this.services.locationEditStates.delete(ctx.from!.id);
    } catch (error) {
      console.error('Error updating location map_url:', error);
      await ctx.reply('❌ Произошла ошибка при обновлении ссылки. Попробуйте позже.');
    }
  }

  /**
   * Начать редактирование видов спорта
   */
  async startSportsEdit(ctx: Context, state: LocationEditState): Promise<void> {
    state.step = 'sports';

    const location = await this.services.locationService.getById(state.data.locationId);
    if (!location) {
      await ctx.editMessageText('❌ Локация не найдена');
      this.services.locationEditStates.delete(ctx.from!.id);
      return;
    }

    const currentSports = location.sportLocations?.map(sl => `${sl.sport.emoji} ${sl.sport.name}`).join(', ') || 'Не указаны';
    const currentSportIds = location.sportLocations?.map(sl => sl.sport_id) || [];

    // Получаем все виды спорта
    const allSports = await this.services.sportService.getSportsForGroup(state.groupId);

    // Формируем кнопки с галочками для выбранных
    const buttons = allSports.map(sport => {
      const isSelected = currentSportIds.includes(sport.id);
      const prefix = isSelected ? '✅ ' : '';
      return [
        Markup.button.callback(
          `${prefix}${sport.emoji} ${sport.name}`,
          `toggle_location_sport_${state.data.locationId}_${sport.id}`
        )
      ];
    });

    buttons.push([Markup.button.callback('💾 Сохранить', `save_location_sports_${state.data.locationId}`)]);
    buttons.push([Markup.button.callback('❌ Отменить', 'cancel_edit_location')]);

    await ctx.editMessageText(
      `🏃 Выберите виды спорта для локации\n\n` +
      `Текущие: ${currentSports}\n\n` +
      `Нажмите на вид спорта для добавления/удаления:`,
      Markup.inlineKeyboard(buttons)
    );

    // Сохраняем текущие sport_ids в состояние
    state.data.sportIds = currentSportIds;
  }

  /**
   * Переключить вид спорта (добавить/удалить)
   */
  async toggleSport(ctx: Context, state: LocationEditState, sportId: number): Promise<void> {
    if (!state.data.sportIds) {
      state.data.sportIds = [];
    }

    const index = state.data.sportIds.indexOf(sportId);
    if (index > -1) {
      // Удаляем
      state.data.sportIds.splice(index, 1);
    } else {
      // Добавляем
      state.data.sportIds.push(sportId);
    }

    // Обновляем клавиатуру
    const allSports = await this.services.sportService.getSportsForGroup(state.groupId);
    const buttons = allSports.map(sport => {
      const isSelected = state.data.sportIds!.includes(sport.id);
      const prefix = isSelected ? '✅ ' : '';
      return [
        Markup.button.callback(
          `${prefix}${sport.emoji} ${sport.name}`,
          `toggle_location_sport_${state.data.locationId}_${sport.id}`
        )
      ];
    });

    buttons.push([Markup.button.callback('💾 Сохранить', `save_location_sports_${state.data.locationId}`)]);
    buttons.push([Markup.button.callback('❌ Отменить', 'cancel_edit_location')]);

    const selectedSports = allSports
      .filter(s => state.data.sportIds!.includes(s.id))
      .map(s => `${s.emoji} ${s.name}`)
      .join(', ') || 'Не выбраны';

    await ctx.editMessageText(
      `🏃 Выберите виды спорта для локации\n\n` +
      `Выбрано: ${selectedSports}\n\n` +
      `Нажмите на вид спорта для добавления/удаления:`,
      Markup.inlineKeyboard(buttons)
    );

    await ctx.answerCbQuery();
  }

  /**
   * Сохранить изменения видов спорта
   */
  async saveSports(ctx: Context, state: LocationEditState): Promise<void> {
    if (!state.data.sportIds || state.data.sportIds.length === 0) {
      await ctx.answerCbQuery('❌ Выберите хотя бы один вид спорта');
      return;
    }

    try {
      await this.services.locationService.update(state.data.locationId, {
        sport_ids: state.data.sportIds
      });

      const allSports = await this.services.sportService.getSportsForGroup(state.groupId);
      const selectedSports = allSports
        .filter(s => state.data.sportIds!.includes(s.id))
        .map(s => `${s.emoji} ${s.name}`)
        .join(', ');

      await ctx.editMessageText(
        `✅ Виды спорта обновлены!\n\n` +
        `📍 ${state.data.locationName}\n` +
        `🏃 ${selectedSports}`
      );

      this.services.locationEditStates.delete(ctx.from!.id);
      await ctx.answerCbQuery('✅ Сохранено');
    } catch (error) {
      console.error('Error updating location sports:', error);
      await ctx.answerCbQuery('❌ Ошибка при сохранении');
      await ctx.reply('❌ Произошла ошибка при обновлении видов спорта. Попробуйте позже.');
    }
  }

  /**
   * Отменить редактирование
   */
  async handleCancellation(ctx: Context): Promise<void> {
    this.services.locationEditStates.delete(ctx.from!.id);
    await ctx.editMessageText('❌ Редактирование отменено');
    await ctx.answerCbQuery();
  }
}
