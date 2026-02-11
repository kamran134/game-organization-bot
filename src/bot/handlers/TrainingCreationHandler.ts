import { Telegraf } from 'telegraf';
import { TrainingCreationStateManager } from '../../utils/TrainingCreationState';
import { TrainingCreationFlow } from '../flows/TrainingCreationFlow';
import { Database } from '../../database/Database';

interface TrainingCreationHandlerServices {
  trainingCreationStates: TrainingCreationStateManager;
  trainingCreationFlow: TrainingCreationFlow;
}

export class TrainingCreationHandler {
  private bot: Telegraf;
  private services: TrainingCreationHandlerServices;

  constructor(bot: Telegraf, services: TrainingCreationHandlerServices) {
    this.bot = bot;
    this.services = services;
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Выбор вида спорта для тренировки
    this.bot.action(/^sport_(\d+)$/, async (ctx, next) => {
      const sportId = parseInt(ctx.match[1]);
      const userId = ctx.from!.id;

      const state = this.services.trainingCreationStates.get(userId);
      
      // Если нет состояния тренировки - пропускаем (это может быть создание игры)
      if (!state || state.step !== 'sport') {
        return next();
      }

      const { SportService } = await import('../../services/SportService');
      const db = Database.getInstance();
      const sportService = new SportService(db);
      const sport = await sportService.getSportById(sportId);

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
        const { LocationService } = await import('../../services/LocationService');
        const locationService = new LocationService();
        const location = await locationService.getById(locationId);

        if (!location) {
          await ctx.answerCbQuery('❌ Локация не найдена');
          return;
        }

        state.data.locationId = locationId;
        state.data.locationName = location.name;

        // Если данные уже заполнены (быстрый формат) - сразу показываем подтверждение
        if (state.data.minParticipants !== undefined && state.data.maxParticipants !== undefined) {
          state.step = 'confirm';
          await this.services.trainingCreationFlow.showConfirmation(ctx, state);
        } else {
          // Иначе продолжаем пошаговый режим
          state.step = 'min_participants';
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
    this.bot.action(/^confirm_game_(\d+)$/, async (ctx, next) => {
      const userId = parseInt(ctx.match[1]);
      
      const state = this.services.trainingCreationStates.get(userId);
      if (!state) {
        return next();
      }
      
      if (ctx.from!.id !== userId) {
        await ctx.answerCbQuery('❌ Это не ваша тренировка');
        return;
      }

      await this.services.trainingCreationFlow.createTraining(ctx, userId);
    });

    // Отмена создания
    this.bot.action(/^cancel_game_(\d+)$/, async (ctx, next) => {
      const userId = parseInt(ctx.match[1]);
      
      const state = this.services.trainingCreationStates.get(userId);
      if (!state) {
        return next();
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
