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
    this.bot.action(/^sport_(\d+)$/, async (ctx) => {
      const sportId = parseInt(ctx.match[1]);
      const userId = ctx.from!.id;

      const state = this.services.trainingCreationStates.get(userId);
      
      // Проверяем активное состояние тренировки (не игры)
      if (state && state.step === 'sport') {
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
          `📅 Введите дату и время тренировки:\n\n` +
          `Формат: ДД.ММ ЧЧ:ММ\n` +
          `Например: 15.02 18:00 или 15.02.2026 18:00`
        );
        await ctx.answerCbQuery();
      }
    });

    // Выбор локации
    this.bot.action(/^location_(\d+)$/, async (ctx) => {
      const locationId = parseInt(ctx.match[1]);
      const userId = ctx.from!.id;

      const state = this.services.trainingCreationStates.get(userId);

      if (state && state.step === 'location') {
        const { LocationService } = await import('../../services/LocationService');
        const locationService = new LocationService();
        const location = await locationService.getById(locationId);

        if (!location) {
          await ctx.answerCbQuery('❌ Локация не найдена');
          return;
        }

        state.data.locationId = locationId;
        state.data.locationName = location.name;
        state.step = 'min_participants';

        await ctx.editMessageText(
          `✅ Место: ${location.name}\n\n` +
          `👥 Введите минимальное количество участников:\n\n` +
          `Например: 5`
        );
        await ctx.answerCbQuery();
      }
    });

    // Кастомная локация
    this.bot.action('location_custom', async (ctx) => {
      const userId = ctx.from!.id;
      const state = this.services.trainingCreationStates.get(userId);

      if (state && state.step === 'location') {
        await ctx.editMessageText(
          `📍 Введите место проведения тренировки:\n\n` +
          `Например: "Стадион Центральный" или "ул. Ленина, 15"`
        );
        await ctx.answerCbQuery();
      }
    });

    // Подтверждение создания
    this.bot.action(/^confirm_game_(\d+)$/, async (ctx) => {
      const userId = parseInt(ctx.match[1]);
      
      if (ctx.from!.id !== userId) {
        await ctx.answerCbQuery('❌ Это не ваша тренировка');
        return;
      }

      await this.services.trainingCreationFlow.createTraining(ctx, userId);
    });

    // Отмена создания
    this.bot.action(/^cancel_game_(\d+)$/, async (ctx) => {
      const userId = parseInt(ctx.match[1]);
      
      if (ctx.from!.id !== userId) {
        await ctx.answerCbQuery('❌ Это не ваша тренировка');
        return;
      }

      await this.services.trainingCreationFlow.cancelTraining(ctx, userId);
      await ctx.answerCbQuery();
    });
  }
}
