import { Context } from 'telegraf';
import { GameService } from '../../services/GameService';
import { SportService } from '../../services/SportService';
import { LocationService } from '../../services/LocationService';
import { TrainingCreationStateManager, TrainingCreationState } from '../../utils/TrainingCreationState';
import { KeyboardBuilder } from '../ui/KeyboardBuilder';
import { GameMessageBuilder } from '../ui/GameMessageBuilder';
import { GameCreationValidator } from './GameCreationValidator';
// import { formatDate } from '../../utils/helpers';
import { GameType } from '../../models/GameType';

export interface TrainingCreationServices {
  gameService: GameService;
  sportService: SportService;
  locationService: LocationService;
  trainingCreationStates: TrainingCreationStateManager;
}

export class TrainingCreationFlow {
  constructor(private services: TrainingCreationServices) {}

  async handleTextInput(ctx: Context, userId: number, text: string): Promise<void> {
    console.log('text input:', text);
    const state = this.services.trainingCreationStates.get(userId);
    if (!state) return;

    // Проверяем быстрый формат (через /)
    if (state.step === 'date' && text.includes(' / ')) {
      await this.handleQuickTrainingCreation(ctx, state, text);
      return;
    }

    await this.handleTrainingCreationStep(ctx, state);
  }

  private async handleQuickTrainingCreation(
    ctx: Context,
    state: TrainingCreationState,
    text: string
  ): Promise<void> {
    const parts = text.split(' / ').map((p) => p.trim());

    if (parts.length < 2) {
      await ctx.reply(
        '❌ Неверный формат быстрого ввода.\n\n' +
          '📝 Формат: дата время / мин / макс / стоимость / заметки / локация\n\n' +
          'Пример:\n' +
          '10.02 18:00 / 5 / - / - / Приходите пораньше / Зал\n' +
          'Или: 10.02 18:00 / 6 / 10 / 500 / - / Спортзал\n\n' +
          'Минимум 2 части: дата и мин. участники (остальное опционально)'
      );
      return;
    }

    // Парсим дату (обязательно)
    const dateResult = GameCreationValidator.parseDate(parts[0]);
    if (!dateResult.success) {
      await ctx.reply(dateResult.error!);
      return;
    }
    state.data.gameDate = dateResult.date;

    // Макс. участников (опционально, может быть "-")
    let maxParticipants = 999; // По умолчанию безлимит
    if (parts.length > 2 && parts[2] && parts[2] !== '-') {
      const maxVal = parseInt(parts[2]);
      if (isNaN(maxVal) || maxVal < 1) {
        await ctx.reply('❌ Макс. участников должно быть числом >= 1');
        return;
      }
      maxParticipants = maxVal;
    }
    state.data.maxParticipants = maxParticipants;

    // Парсим мин. участников (обязательно)
    const minResult = GameCreationValidator.validateMinParticipants(parts[1], maxParticipants);
    if (!minResult.success) {
      await ctx.reply('❌ Ошибка в мин. участниках: ' + minResult.error);
      return;
    }
    state.data.minParticipants = minResult.value!;

    // Стоимость (опционально, может быть "-")
    if (parts.length > 3 && parts[3] && parts[3] !== '-') {
      const costVal = parseInt(parts[3]);
      if (isNaN(costVal) || costVal < 0) {
        await ctx.reply('❌ Стоимость должна быть числом >= 0');
        return;
      }
      state.data.cost = costVal;
    } else {
      state.data.cost = 0; // Бесплатно
    }

    // Заметки (опционально)
    if (parts.length > 4 && parts[4] && parts[4] !== '-') {
      state.data.notes = parts[4];
    }

    // Локация (опционально)
    if (parts.length > 5 && parts[5] && parts[5] !== '-') {
      state.data.locationName = parts[5];
      state.step = 'confirm';
      await this.showConfirmation(ctx, state);
    } else {
      // Локация не указана - показываем выбор
      state.step = 'location';
      const locations = await this.services.locationService.getByGroupAndSport(
        state.groupId,
        state.data.sportId!
      );

      if (locations.length === 0) {
        await ctx.reply(
          '⚠️ Локаций для этого вида спорта в группе пока нет.\n' +
            '📍 Введите место проведения текстом:\n\n' +
            'Например: "Зал CrossFit" или "Школа №5"'
        );
        return;
      }

      const keyboard = KeyboardBuilder.buildLocationSelectionKeyboard(locations);
      await ctx.reply('📍 Выберите место проведения:', keyboard);
    }
  }

  private async handleTrainingCreationStep(
    ctx: Context,
    state: TrainingCreationState
  ): Promise<void> {
    if (!ctx.message || !('text' in ctx.message)) return;

    const text = ctx.message.text.trim();

    switch (state.step) {
      case 'date':
        await this.handleDateInput(ctx, state, text);
        break;
      case 'location':
        await this.handleLocationInput(ctx, state, text);
        break;
      case 'min_participants':
        await this.handleMinParticipantsInput(ctx, state, text);
        break;
      case 'max_participants':
        await this.handleMaxParticipantsInput(ctx, state, text);
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
    state: TrainingCreationState,
    text: string
  ): Promise<void> {
    const result = GameCreationValidator.parseDate(text);
    if (!result.success) {
      await ctx.reply(result.error!);
      return;
    }

    state.data.gameDate = result.date;
    state.step = 'location';

    const locations = await this.services.locationService.getByGroupAndSport(
      state.groupId,
      state.data.sportId!
    );

    if (locations.length > 0) {
      const keyboard = KeyboardBuilder.buildLocationSelectionKeyboard(locations);
      await ctx.reply('📍 Выберите место проведения:', keyboard);
    } else {
      await ctx.reply(
        '📍 Введите место проведения тренировки:\n\n' +
          'Например: "Стадион Центральный" или "ул. Ленина, 15"\n\n' +
          'Администраторы могут добавить постоянную локацию командой /addlocation'
      );
    }
  }

  private async handleLocationInput(
    ctx: Context,
    state: TrainingCreationState,
    text: string
  ): Promise<void> {
    const result = GameCreationValidator.validateLocation(text);
    if (!result.success) {
      await ctx.reply(result.error!);
      return;
    }

    state.data.locationName = text;
    state.step = 'min_participants';

    await ctx.reply(
      '👥 Введите минимальное количество участников:\n\n' +
        'Например: 5\n' +
        '(если наберётся меньше, тренировка может быть отменена)'
    );
  }

  private async handleMinParticipantsInput(
    ctx: Context,
    state: TrainingCreationState,
    text: string
  ): Promise<void> {
    const result = GameCreationValidator.validateNumber(text, 1, 1000);
    if (!result.success) {
      await ctx.reply('❌ Укажите число от 1 до 1000');
      return;
    }

    state.data.minParticipants = result.value;
    state.step = 'max_participants';

    await ctx.reply(
      '👥 Введите максимальное количество участников или "-" для безлимита:\n\n' +
        'Например: 20 или -'
    );
  }

  private async handleMaxParticipantsInput(
    ctx: Context,
    state: TrainingCreationState,
    text: string
  ): Promise<void> {
    if (text === '-') {
      // Безлимит - ставим большое число
      state.data.maxParticipants = 999;
    } else {
      const result = GameCreationValidator.validateNumber(text, 1, 1000);
      if (!result.success) {
        await ctx.reply('❌ Укажите число от 1 до 1000 или "-" для безлимита');
        return;
      }

      if (result.value! < state.data.minParticipants!) {
        await ctx.reply(
          `❌ Максимум (${result.value}) не может быть меньше минимума (${state.data.minParticipants})`
        );
        return;
      }

      state.data.maxParticipants = result.value;
    }

    state.step = 'cost';

    await ctx.reply(
      '💰 Введите стоимость участия или "-" для бесплатной тренировки:\n\n' +
        'Например: 500 или 0 или -'
    );
  }

  private async handleCostInput(
    ctx: Context,
    state: TrainingCreationState,
    text: string
  ): Promise<void> {
    if (text === '-') {
      state.data.cost = 0;
    } else {
      const result = GameCreationValidator.validateCost(text);
      if (!result.success) {
        await ctx.reply('❌ Укажите число (стоимость) или "-" для бесплатной тренировки');
        return;
      }
      state.data.cost = result.value;
    }

    state.step = 'notes';

    await ctx.reply(
      '📝 Добавьте заметки к тренировке или "-" для пропуска:\n\n' +
        'Например: "Приходите за 10 минут, с собой воду"'
    );
  }

  private async handleNotesInput(
    ctx: Context,
    state: TrainingCreationState,
    text: string
  ): Promise<void> {
    if (text !== '-') {
      const result = GameCreationValidator.validateNotes(text);
      if (!result.success) {
        await ctx.reply(result.error!);
        return;
      }
      state.data.notes = text;
    }

    state.step = 'confirm';
    await this.showConfirmation(ctx, state);
  }

  buildConfirmationMessage(state: TrainingCreationState): string {
    return GameMessageBuilder.buildConfirmationMessage(
      state.data.sportName!,
      state.data.gameDate!,
      state.data.locationName!,
      state.data.minParticipants!,
      state.data.maxParticipants!,
      state.data.cost,
      state.data.notes,
      '🏋️ ТРЕНИРОВКА'
    );
  }

  async showConfirmation(
    ctx: Context,
    state: TrainingCreationState
  ): Promise<void> {
    const message = this.buildConfirmationMessage(state);
    await ctx.reply(message, KeyboardBuilder.createGameConfirmationKeyboard(state.userId));
  }

  async createTraining(ctx: Context, userId: number): Promise<void> {
    const state = this.services.trainingCreationStates.get(userId);

    if (!state || state.step !== 'confirm') {
      await ctx.reply('❌ Ошибка создания тренировки. Попробуйте /newtraining снова.');
      return;
    }

    try {
      // Определить location_id
      let locationId: number;
      
      if (state.data.locationId) {
        // Локация уже выбрана из списка
        locationId = state.data.locationId;
      } else {
        // Создать новую локацию из текста
        const location = await this.services.locationService.findOrCreate(
          state.data.locationName!,
          state.data.sportId!,
          state.groupId
        );
        locationId = location.id;
      }

      // Данные для создания
      const gameData = {
        group_id: state.groupId,
        creator_id: state.userId,
        sport_id: state.data.sportId!,
        game_date: state.data.gameDate!,
        location_id: locationId,
        min_participants: state.data.minParticipants!,
        max_participants: state.data.maxParticipants!,
        cost: state.data.cost,
        notes: state.data.notes,
        type: GameType.TRAINING,
      };

      // Логируем данные
      console.log('Creating training with data:', JSON.stringify(gameData, null, 2));
      
      // Отправляем данные пользователю для отладки
      await ctx.telegram.sendMessage(
        ctx.from!.id,
        `🔍 DEBUG - Данные для создания:\n\n${JSON.stringify(gameData, null, 2)}`
      );

      // Создать тренировку (type = TRAINING)
      const training = await this.services.gameService.createGame(gameData);

      this.services.trainingCreationStates.delete(userId);

      const message = GameMessageBuilder.buildTrainingCard(training);
      await ctx.editMessageText('✅ Тренировка создана!');
      await ctx.reply(
        message,
        GameMessageBuilder.buildGameActionsKeyboard(training.id, 0, true)
      );
    } catch (error) {
      console.error('Error creating training:', error);
      const errorMessage = `❌ Ошибка создания тренировки:\n\n${error instanceof Error ? error.message : String(error)}\n\nStack:\n${error instanceof Error ? error.stack : 'N/A'}`;
      await ctx.reply('❌ Ошибка при создании тренировки. Детали отправлены в личку.');
      try {
        await ctx.telegram.sendMessage(ctx.from!.id, errorMessage);
      } catch (dmError) {
        console.error('Failed to send error DM:', dmError);
      }
    }
  }

  async cancelTraining(ctx: Context, userId: number): Promise<void> {
    this.services.trainingCreationStates.delete(userId);
    await ctx.editMessageText('❌ Создание тренировки отменено');
  }
}
