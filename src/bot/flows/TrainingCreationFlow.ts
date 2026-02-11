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

    await this.handleTrainingCreationStep(ctx, state);
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

  private async showConfirmation(
    ctx: Context,
    state: TrainingCreationState
  ): Promise<void> {
    const message = GameMessageBuilder.buildConfirmationMessage(
      state.data.sportName!,
      state.data.gameDate!,
      state.data.locationName!,
      state.data.minParticipants!,
      state.data.maxParticipants!,
      state.data.cost,
      state.data.notes,
      '🏋️ ТРЕНИРОВКА' // Префикс для тренировок
    );

    await ctx.reply(message, KeyboardBuilder.createGameConfirmationKeyboard(state.userId));
  }

  async createTraining(ctx: Context, userId: number): Promise<void> {
    const state = this.services.trainingCreationStates.get(userId);

    if (!state || state.step !== 'confirm') {
      await ctx.reply('❌ Ошибка создания тренировки. Попробуйте /newtraining снова.');
      return;
    }

    try {
      // Найти или создать локацию
      const location = await this.services.locationService.findOrCreate(
        state.data.locationName!,
        state.data.sportId!,
        state.groupId
      );

      // Создать тренировку (type = TRAINING)
      const training = await this.services.gameService.createGame({
        group_id: state.groupId,
        creator_id: userId,
        sport_id: state.data.sportId!,
        game_date: state.data.gameDate!,
        location_id: location.id,
        min_participants: state.data.minParticipants!,
        max_participants: state.data.maxParticipants!,
        cost: state.data.cost,
        notes: state.data.notes,
        type: GameType.TRAINING, // Указываем тип TRAINING
      });

      this.services.trainingCreationStates.delete(userId);

      const message = GameMessageBuilder.buildTrainingCard(training);
      await ctx.editMessageText('✅ Тренировка создана!');
      await ctx.reply(
        message,
        GameMessageBuilder.buildGameActionsKeyboard(training.id, 0, true)
      );
    } catch (error) {
      console.error('Error creating training:', error);
      await ctx.reply('❌ Ошибка при создании тренировки. Попробуйте позже.');
    }
  }

  async cancelTraining(ctx: Context, userId: number): Promise<void> {
    this.services.trainingCreationStates.delete(userId);
    await ctx.editMessageText('❌ Создание тренировки отменено');
  }
}
