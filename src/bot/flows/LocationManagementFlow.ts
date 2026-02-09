import { Context } from 'telegraf';
import { LocationCreationState, LocationCreationStateManager } from '../../utils/LocationCreationState';
import { LocationService } from '../../services/LocationService';
import { SportService } from '../../services/SportService';
import { KeyboardBuilder } from '../ui/KeyboardBuilder';
import { Markup } from 'telegraf';

export interface LocationManagementServices {
  locationService: LocationService;
  sportService: SportService;
  locationCreationStates: LocationCreationStateManager;
}

export class LocationManagementFlow {
  private services: LocationManagementServices;

  constructor(services: LocationManagementServices) {
    this.services = services;
  }

  async handleNameInput(ctx: Context, state: LocationCreationState): Promise<void> {
    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply('❌ Пожалуйста, отправьте текстовое сообщение с названием локации.');
      return;
    }

    const name = ctx.message.text.trim();
    
    if (name.length < 2) {
      await ctx.reply('❌ Название локации слишком короткое. Минимум 2 символа.');
      return;
    }

    if (name.length > 255) {
      await ctx.reply('❌ Название локации слишком длинное. Максимум 255 символов.');
      return;
    }

    state.data.name = name;
    state.step = 'sport';

    // Показываем выбор вида спорта
    const sports = await this.services.sportService.getAllSports();
    await ctx.reply(
      `✅ Название: ${name}\n\n` +
      '🏃 Теперь выберите вид спорта для этой локации:',
      KeyboardBuilder.createLocationSportSelectionKeyboard(sports)
    );
  }

  async handleSportSelection(ctx: Context, state: LocationCreationState, sportId: number): Promise<void> {
    const sport = await this.services.sportService.getSportById(sportId);
    if (!sport) {
      await ctx.reply('❌ Вид спорта не найден.');
      return;
    }

    state.data.sportId = sportId;
    state.data.sportName = sport.name;
    state.step = 'location_selection';

    // Получаем все локации группы
    const locations = await this.services.locationService.getByGroup(state.groupId);
    
    // Создаём клавиатуру с локациями + кнопка создания новой
    const keyboard = KeyboardBuilder.buildLocationManagementKeyboard(locations);

    await ctx.editMessageText(
      `✅ Вид спорта: ${sport.emoji} ${sport.name}\n\n` +
      '📍 Выберите существующую локацию или создайте новую:',
      keyboard
    );
  }

  async handleMapUrlInput(ctx: Context, state: LocationCreationState): Promise<void> {
    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply('❌ Пожалуйста, отправьте текстовое сообщение со ссылкой на карту или "-".');
      return;
    }

    const mapUrl = ctx.message.text.trim();
    
    if (mapUrl !== '-') {
      // Простая валидация URL
      if (mapUrl.length > 500) {
        await ctx.reply('❌ Ссылка слишком длинная. Максимум 500 символов.');
        return;
      }

      // Проверка что это похоже на URL
      if (!mapUrl.startsWith('http://') && !mapUrl.startsWith('https://')) {
        await ctx.reply('❌ Ссылка должна начинаться с http:// или https://');
        return;
      }

      state.data.mapUrl = mapUrl;
    }

    state.step = 'confirmation';

    // Показываем превью и запрашиваем подтверждение
    const message = this.formatLocationConfirmation(state);
    await ctx.reply(
      message,
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ Создать локацию', 'confirm_location')],
        [Markup.button.callback('❌ Отменить', 'cancel_location')]
      ])
    );
  }

  async handleExistingLocationSelection(ctx: Context, state: LocationCreationState, locationId: number): Promise<void> {
    const location = await this.services.locationService.getById(locationId);
    if (!location) {
      await ctx.answerCbQuery('❌ Локация не найдена.');
      return;
    }

    // Проверяем, есть ли уже связь с этим видом спорта
    const hasSport = location.sportLocations?.some(sl => sl.sport_id === state.data.sportId);
    
    if (hasSport) {
      // Уже добавлена
      await ctx.editMessageText(
        `ℹ️ Эта площадка уже добавлена для ${state.data.sportName}\n\n` +
        `📍 ${location.name}\n` +
        `🏃 ${state.data.sportName}`
      );
      this.services.locationCreationStates.delete(ctx.from!.id);
      return;
    }

    // Добавляем спорт к локации
    try {
      await this.services.locationService.addSportToLocation(locationId, state.data.sportId!);
      
      await ctx.editMessageText(
        `✅ Локация успешно добавлена для ${state.data.sportName}!\n\n` +
        `📍 ${location.name}\n` +
        `🏃 ${state.data.sportName}\n` +
        (location.map_url ? `🗺 ${location.map_url}` : '')
      );

      this.services.locationCreationStates.delete(ctx.from!.id);
    } catch (error) {
      console.error('Error adding sport to location:', error);
      await ctx.reply('❌ Произошла ошибка при добавлении локации. Попробуйте позже.');
      this.services.locationCreationStates.delete(ctx.from!.id);
    }
  }

  async handleNewLocationRequest(ctx: Context, state: LocationCreationState): Promise<void> {
    state.step = 'name';
    await ctx.editMessageText(
      `✅ Вид спорта: ${state.data.sportName}\n\n` +
      '📍 Отправьте название новой локации:',
      Markup.inlineKeyboard([
        [Markup.button.callback('❌ Отменить', 'cancel_location')]
      ])
    );
  }

  async handleConfirmation(ctx: Context, state: LocationCreationState): Promise<void> {
    try {
      const location = await this.services.locationService.create({
        name: state.data.name!,
        sport_ids: [state.data.sportId!],
        group_id: state.groupId,
        map_url: state.data.mapUrl,
      });

      await ctx.editMessageText(
        `✅ Локация успешно создана!\n\n` +
        `📍 ${location.name}\n` +
        `🏃 ${state.data.sportName}\n` +
        (location.map_url ? `🗺 ${location.map_url}` : '')
      );

      this.services.locationCreationStates.delete(ctx.from!.id);
    } catch (error) {
      console.error('Error creating location:', error);
      await ctx.reply('❌ Произошла ошибка при создании локации. Попробуйте позже.');
      this.services.locationCreationStates.delete(ctx.from!.id);
    }
  }

  async handleCancellation(ctx: Context): Promise<void> {
    this.services.locationCreationStates.delete(ctx.from!.id);
    await ctx.editMessageText('❌ Создание локации отменено.');
  }

  private formatLocationConfirmation(state: LocationCreationState): string {
    let message = '📋 Проверьте данные локации:\n\n';
    message += `📍 Название: ${state.data.name}\n`;
    message += `🏃 Вид спорта: ${state.data.sportName}\n`;
    
    if (state.data.mapUrl) {
      message += `🗺 Ссылка на карту: ${state.data.mapUrl}\n`;
    } else {
      message += `🗺 Ссылка на карту: не указана\n`;
    }

    return message;
  }
}
