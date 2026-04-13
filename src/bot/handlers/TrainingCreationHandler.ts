import { BotHandler } from './base/BotHandler';
import { TrainingCreationStateManager } from '../../utils/TrainingCreationState';
import { TrainingCreationFlow } from '../flows/TrainingCreationFlow';
import { LocationService } from '../../services/LocationService';
import { SportService } from '../../services/SportService';

interface TrainingCreationHandlerServices {
  trainingCreationStates: TrainingCreationStateManager;
  trainingCreationFlow: TrainingCreationFlow;
  locationService: LocationService;
  sportService: SportService;
}

export class TrainingCreationHandler extends BotHandler {
  private services: TrainingCreationHandlerServices;

  constructor(services: TrainingCreationHandlerServices) {
    super();
    this.services = services;
  }

  protected registerHandlers(): void {
    // Выбор вида спорта для тренировки
    this.bot.action(/^sport_(\d+)$/, async (ctx, next) => {
      const sportId = parseInt(ctx.match[1]);
      const userId = ctx.from!.id;

      const state = this.services.trainingCreationStates.get(userId);
      
      // Если нет состояния тренировки - пропускаем (это может быть создание игры)
      if (!state || state.step !== 'sport') {
        return next();
      }

      const sport = await this.services.sportService.getSportById(sportId);

      if (!sport) {
        await ctx.answerCbQuery('❌ Вид спорта не найден');
        return;
      }

      state.data.sportId = sportId;
      state.data.sportName = sport.name;
      state.step = 'date';

      await ctx.editMessageText(
        `✅ Вид спорта: ${sport.emoji} ${sport.name}\n\n` +
        `� БЫСТРЫЙ СПОСОБ (одной строкой через /):\n` +
        `📝 дата время / мин / макс ("-" = безлимит) / стоимость ("-" = бесплатно) / заметки / локация\n\n` +
        `Пример:\n` +
        `10.02 18:00 / 3 / - / - / Кроссфит / Зал\n` +
        `Или короче: 10.02 18:00 / 5 / 15 / 0 / - / Спортзал\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📋 ПОШАГОВЫЙ СПОСОБ:\n` +
        `📅 Введите дату и время тренировки\n\n` +
        `Формат: ДД.ММ ЧЧ:ММ\n` +
        `Примеры: 15.02 18:00 или 15.02.2026 18:00`
      );
      await ctx.answerCbQuery();
    });

    // Выбор локации
    this.bot.action(/^location_(\d+)$/, async (ctx, next) => {
      const locationId = parseInt(ctx.match[1]);
      const userId = ctx.from!.id;

      const state = this.services.trainingCreationStates.get(userId);

      if (!state || state.step !== 'location') {
        return next();
      }

      if (state) {
        const location = await this.services.locationService.getById(locationId);

        if (!location) {
          await ctx.answerCbQuery('❌ Локация не найдена');
          return;
        }

        state.data.locationId = locationId;
        state.data.locationName = location.name;
        this.services.trainingCreationStates.set(userId, state);

        // Если данные уже заполнены (быстрый формат) - сразу показываем подтверждение
        if (state.data.minParticipants !== undefined && state.data.maxParticipants !== undefined) {
          state.step = 'confirm';
          this.services.trainingCreationStates.set(userId, state);
          
          const message = await this.services.trainingCreationFlow.buildConfirmationMessage(state);
          await ctx.editMessageText(
            message,
            { reply_markup: { inline_keyboard: [[
              { text: '✅ Создать', callback_data: `confirm_training_${userId}` },
              { text: '❌ Отмена', callback_data: `cancel_training_${userId}` }
            ]] }}
          );
        } else {
          // Иначе продолжаем пошаговый режим
          state.step = 'min_participants';
          this.services.trainingCreationStates.set(userId, state);
          await ctx.editMessageText(
            `✅ Место: ${location.name}\n\n` +
            `👥 Введите минимальное количество участников:\n\n` +
            `Например: 5`
          );
        }
        await ctx.answerCbQuery();
      }
    });

    // Кастомная локация
    this.bot.action('location_custom', async (ctx, next) => {
      const userId = ctx.from!.id;
      const state = this.services.trainingCreationStates.get(userId);

      if (!state || state.step !== 'location') {
        return next();
      }

      if (state) {
        await ctx.editMessageText(
          `📍 Введите место проведения тренировки:\n\n` +
          `Например: "Стадион Центральный" или "ул. Ленина, 15"`
        );
        await ctx.answerCbQuery();
      }
    });

    // Подтверждение создания
    this.bot.action(/^confirm_training_(\d+)$/, async (ctx) => {
      const userId = parseInt(ctx.match[1]);
      
      const state = this.services.trainingCreationStates.get(userId);
      if (!state) {
        await ctx.answerCbQuery('❌ Сессия создания истекла');
        return;
      }
      
      if (ctx.from!.id !== userId) {
        await ctx.answerCbQuery('❌ Это не ваша тренировка');
        return;
      }

      await this.services.trainingCreationFlow.createTraining(ctx, userId);
    });

    // Отмена создания
    this.bot.action(/^cancel_training_(\d+)$/, async (ctx) => {
      const userId = parseInt(ctx.match[1]);
      
      const state = this.services.trainingCreationStates.get(userId);
      if (!state) {
        await ctx.answerCbQuery();
        return;
      }
      
      if (ctx.from!.id !== userId) {
        await ctx.answerCbQuery('❌ Это не ваша тренировка');
        return;
      }

      await this.services.trainingCreationFlow.cancelTraining(ctx, userId);
      await ctx.answerCbQuery();
    });
  }
}
