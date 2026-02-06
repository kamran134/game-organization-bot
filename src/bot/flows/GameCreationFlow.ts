import { Context } from 'telegraf';
import { GameService } from '../../services/GameService';
import { SportService } from '../../services/SportService';
import { LocationService } from '../../services/LocationService';
import { GameCreationStateManager, GameCreationState } from '../../utils/GameCreationState';
import { KeyboardBuilder } from '../ui/KeyboardBuilder';
import { GameMessageBuilder } from '../ui/GameMessageBuilder';
import { GameCreationValidator } from './GameCreationValidator';
import { formatDate } from '../../utils/helpers';

export interface GameCreationServices {
  gameService: GameService;
  sportService: SportService;
  locationService: LocationService;
  gameCreationStates: GameCreationStateManager;
}

export class GameCreationFlow {
  constructor(private services: GameCreationServices) {}

  async handleTextInput(ctx: Context, userId: number, text: string): Promise<void> {
    const state = this.services.gameCreationStates.get(userId);

    if (!state) return; // Нет активного диалога

    // Проверяем быстрый формат (через /)
    if (state.step === 'date' && text.includes(' / ')) {
      await this.handleQuickGameCreation(ctx, state, text);
      return;
    }

    // Обычный пошаговый процесс
    await this.handleGameCreationStep(ctx, state);
  }

  private async handleQuickGameCreation(
    ctx: Context,
    state: GameCreationState,
    text: string
  ): Promise<void> {
    const parts = text.split(' / ').map((p) => p.trim());

    if (parts.length < 2) {
      await ctx.reply(
        '❌ Неверный формат быстрого ввода.\n\n' +
          '📝 Формат: дата время / мин-макс / стоимость / заметки / локация\n\n' +
          'Пример:\n' +
          '10.02 18:00 / 5-10 / 500 / Приходите заранее / Спортзал Олимп\n' +
          'Или: 10.02 18:00 / 12 / 0 / - / Зал\n\n' +
          'Минимум 2 части: дата и участники (остальное опционально)'
      );
      return;
    }

    // Парсим дату
    const dateResult = GameCreationValidator.parseDate(parts[0]);
    if (!dateResult.success) {
      await ctx.reply(dateResult.error!);
      return;
    }

    // Парсим количество участников (теперь вторая часть)
    const participantsResult = GameCreationValidator.parseParticipantsRange(parts[1]);
    if (!participantsResult.success) {
      await ctx.reply(participantsResult.error!);
      return;
    }

    // Стоимость (третья часть, опционально)
    let cost: number | undefined;
    if (parts.length > 2 && parts[2].length > 0 && parts[2] !== '-') {
      const costResult = GameCreationValidator.validateCost(parts[2]);
      if (!costResult.success) {
        await ctx.reply(
          '❌ Неверный формат стоимости (третья часть). Укажите число или "-".'
        );
        return;
      }
      cost = costResult.value;
    }

    // Заметки (четвертая часть, опционально)
    const notes = parts.length > 3 && parts[3].length > 0 && parts[3] !== '-' ? parts[3] : undefined;

    // Сохраняем основные данные
    state.data.gameDate = dateResult.date;
    state.data.maxParticipants = participantsResult.max;
    state.data.minParticipants = participantsResult.min;
    state.data.cost = cost;
    state.data.notes = notes;

    // Локация (пятая часть, опционально)
    if (parts.length > 4 && parts[4].length > 0 && parts[4] !== '-') {
      const locationText = parts[4];
      const locationResult = GameCreationValidator.validateLocation(locationText);
      if (!locationResult.success) {
        await ctx.reply('❌ Слишком короткое название места (пятая часть).');
        return;
      }

      // Map URL (шестая часть, опционально)
      const mapUrl = parts.length > 5 && parts[5].length > 0 && parts[5] !== '-' ? parts[5] : undefined;

      // Создаём или находим локацию в БД для этой группы
      const location = await this.services.locationService.findOrCreate(
        locationText, 
        state.data.sportId!, 
        state.groupId,
        mapUrl
      );

      state.data.locationId = location.id;
      state.data.locationName = location.name;

      // Показываем подтверждение
      await this.showGameConfirmation(ctx, state);
    } else {
      // Локация не указана - показываем выбор
      state.step = 'location';
      this.services.gameCreationStates.set(ctx.from!.id, state);

      const locations = await this.services.locationService.getByGroupAndSport(state.groupId, state.data.sportId!);

      if (locations.length === 0) {
        await ctx.reply(
          '⚠️ Локаций для этого вида спорта в группе пока нет.\n' +
          '📍 Введите место проведения текстом:\n' +
          '⚠️ Ответьте (reply) на это сообщение!\n\n' +
          'Например: "Стадион Центральный" или "ул. Ленина, 15"\n\n' +
          'Администраторы могут добавить постоянную локацию командой /addlocation'
        );
        return;
      }

      const keyboard = KeyboardBuilder.buildLocationSelectionKeyboard(locations);
      await ctx.reply('📍 Выберите место проведения:', keyboard);
    }
  }

  private async handleGameCreationStep(ctx: Context, state: GameCreationState): Promise<void> {
    const text = 'text' in ctx.message! ? ctx.message.text : '';

    switch (state.step) {
      case 'date':
        await this.handleDateInput(ctx, state, text);
        break;
      case 'location':
        await this.handleLocationInput(ctx, state, text);
        break;
      case 'max_participants':
        await this.handleMaxParticipantsInput(ctx, state, text);
        break;
      case 'min_participants':
        await this.handleMinParticipantsInput(ctx, state, text);
        break;
      case 'cost':
        await this.handleCostInput(ctx, state, text);
        break;
      case 'notes':
        await this.handleNotesInput(ctx, state, text);
        break;
    }
  }

  private async handleDateInput(
    ctx: Context,
    state: GameCreationState,
    text: string
  ): Promise<void> {
    const result = GameCreationValidator.parseDate(text);

    if (!result.success) {
      await ctx.reply(result.error!);
      return;
    }

    state.data.gameDate = result.date;
    state.step = 'max_participants';
    this.services.gameCreationStates.set(ctx.from!.id, state);

    await ctx.reply(
      `✅ Дата: ${formatDate(result.date!)}\n\n` +
        '👥 Введите максимальное количество участников:\n' +
        '⚠️ Ответьте (reply) на это сообщение!\n\n' +
        'Например: 10'
    );
  }

  private async handleLocationInput(
    ctx: Context,
    state: GameCreationState,
    text: string
  ): Promise<void> {
    const result = GameCreationValidator.validateLocation(text);

    if (!result.success) {
      await ctx.reply(result.error!);
      return;
    }

    // Создаём или находим локацию в БД для этой группы
    const location = await this.services.locationService.findOrCreate(text, state.data.sportId!, state.groupId);
    
    state.data.locationId = location.id;
    state.data.locationName = location.name;

    // Показываем подтверждение
    await this.showGameConfirmation(ctx, state);
  }

  private async handleMaxParticipantsInput(
    ctx: Context,
    state: GameCreationState,
    text: string
  ): Promise<void> {
    const result = GameCreationValidator.validateMaxParticipants(text);

    if (!result.success) {
      await ctx.reply(result.error!);
      return;
    }

    state.data.maxParticipants = result.value;
    state.step = 'min_participants';
    this.services.gameCreationStates.set(ctx.from!.id, state);

    await ctx.reply(
      `✅ Максимум участников: ${result.value}\n\n` +
        '👤 Введите минимальное количество участников:\n' +
        '⚠️ Ответьте (reply) на это сообщение!\n\n' +
        `(от 2 до ${result.value})`
    );
  }

  private async handleMinParticipantsInput(
    ctx: Context,
    state: GameCreationState,
    text: string
  ): Promise<void> {
    const max = state.data.maxParticipants || 100;
    const result = GameCreationValidator.validateMinParticipants(text, max);

    if (!result.success) {
      await ctx.reply(result.error!);
      return;
    }

    state.data.minParticipants = result.value;
    state.step = 'cost';
    this.services.gameCreationStates.set(ctx.from!.id, state);

    await ctx.reply(
      `✅ Минимум участников: ${result.value}\n\n` +
        '💰 Введите стоимость участия (в манатах):\n' +
        '⚠️ Ответьте (reply) на это сообщение!\n\n' +
        'Или отправьте 0, если игра бесплатная'
    );
  }

  private async handleCostInput(
    ctx: Context,
    state: GameCreationState,
    text: string
  ): Promise<void> {
    const result = GameCreationValidator.validateCost(text);

    if (!result.success) {
      await ctx.reply(result.error!);
      return;
    }

    state.data.cost = result.value;
    state.step = 'notes';
    this.services.gameCreationStates.set(ctx.from!.id, state);

    const costMessage = result.value ? `✅ Стоимость: ${result.value} ₼\n\n` : '✅ Игра бесплатная\n\n';
    await ctx.reply(
      costMessage +
        '📝 Добавьте дополнительные заметки или отправьте "-" чтобы пропустить:\n' +
        '⚠️ Ответьте (reply) на это сообщение!\n\n' +
        'Например: "Своя форма", "Принести мяч" и т.д.'
    );
  }

  private async handleNotesInput(
    ctx: Context,
    state: GameCreationState,
    text: string
  ): Promise<void> {
    if (text !== '-' && text.length > 0) {
      state.data.notes = text;
    }

    state.step = 'location';
    this.services.gameCreationStates.set(ctx.from!.id, state);

    // Получаем локации для выбранного вида спорта и группы
    const locations = await this.services.locationService.getByGroupAndSport(state.groupId, state.data.sportId!);

    if (locations.length === 0) {
      await ctx.reply(
        '⚠️ Локаций для этого вида спорта в группе пока нет.\n' +
        '📍 Введите место проведения текстом:\n' +
        '⚠️ Ответьте (reply) на это сообщение!\n\n' +
        'Например: "Стадион Центральный" или "ул. Ленина, 15"\n\n' +
        'Администраторы могут добавить постоянную локацию командой /addlocation'
      );
      return;
    }

    // Формируем кнопки с локациями
    const keyboard = KeyboardBuilder.buildLocationSelectionKeyboard(locations);

    await ctx.reply(
      '📍 Выберите место проведения:',
      keyboard
    );
  }

  private async showGameConfirmation(ctx: Context, state: GameCreationState): Promise<void> {
    const confirmationMessage = GameMessageBuilder.formatGameConfirmation(state);

    await ctx.reply(
      confirmationMessage,
      KeyboardBuilder.createGameConfirmationKeyboard(ctx.from!.id)
    );
  }
}
