import { Telegraf, Context } from 'telegraf';
import { LocationManagementFlow } from '../flows/LocationManagementFlow';
import { LocationCreationStateManager } from '../../utils/LocationCreationState';

interface LocationHandlerServices {
  locationManagementFlow: LocationManagementFlow;
  locationCreationStates: LocationCreationStateManager;
}

export class LocationCreationHandler {
  private bot: Telegraf;
  private services: LocationHandlerServices;

  constructor(bot: Telegraf, services: LocationHandlerServices) {
    this.bot = bot;
    this.services = services;
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Обработка выбора вида спорта для локации
    this.bot.action(/^location_sport_(\d+)$/, async (ctx) => {
      const sportId = parseInt(ctx.match[1], 10);
      const userId = ctx.from!.id;
      const state = this.services.locationCreationStates.get(userId);

      if (!state || state.step !== 'sport') {
        await ctx.answerCbQuery('❌ Сессия создания локации не найдена или истекла');
        return;
      }

      await ctx.answerCbQuery();
      await this.services.locationManagementFlow.handleSportSelection(ctx, state, sportId);
    });

    // Обработка выбора существующей локации
    this.bot.action(/^select_existing_location_(\d+)$/, async (ctx) => {
      const locationId = parseInt(ctx.match[1], 10);
      const userId = ctx.from!.id;
      const state = this.services.locationCreationStates.get(userId);

      if (!state || state.step !== 'location_selection') {
        await ctx.answerCbQuery('❌ Сессия создания локации не найдена или истекла');
        return;
      }

      await ctx.answerCbQuery();
      await this.services.locationManagementFlow.handleExistingLocationSelection(ctx, state, locationId);
    });

    // Обработка кнопки "Создать новую локацию"
    this.bot.action('create_new_location', async (ctx) => {
      const userId = ctx.from!.id;
      const state = this.services.locationCreationStates.get(userId);

      if (!state || state.step !== 'location_selection') {
        await ctx.answerCbQuery('❌ Сессия создания локации не найдена или истекла');
        return;
      }

      await ctx.answerCbQuery();
      await this.services.locationManagementFlow.handleNewLocationRequest(ctx, state);
    });

    // Обработка подтверждения создания локации
    this.bot.action('confirm_location', async (ctx) => {
      const userId = ctx.from!.id;
      const state = this.services.locationCreationStates.get(userId);

      if (!state || state.step !== 'confirmation') {
        await ctx.answerCbQuery('❌ Состояние создания локации не найдено');
        return;
      }

      await ctx.answerCbQuery();
      await this.services.locationManagementFlow.handleConfirmation(ctx, state);
    });

    // Обработка отмены создания локации
    this.bot.action('cancel_location', async (ctx) => {
      // const userId = ctx.from!.id;
      await ctx.answerCbQuery();
      await this.services.locationManagementFlow.handleCancellation(ctx);
    });

    // Обработка текстовых сообщений в процессе создания локации
    this.bot.on('text', async (ctx: Context, next) => {
      const userId = ctx.from!.id;
      const state = this.services.locationCreationStates.get(userId);

      if (!state) {
        return next();
      }

      switch (state.step) {
        case 'name':
          await this.services.locationManagementFlow.handleNameInput(ctx, state);
          break;
        case 'map_url':
          await this.services.locationManagementFlow.handleMapUrlInput(ctx, state);
          break;
        default:
          return next();
      }
    });
  }
}
