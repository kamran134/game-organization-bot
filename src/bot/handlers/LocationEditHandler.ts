import { Telegraf, Context } from 'telegraf';
import { LocationEditStateManager } from '../../utils/LocationEditState';
import { LocationEditFlow } from '../flows/LocationEditFlow';
import { LocationService } from '../../services/LocationService';
import { SportService } from '../../services/SportService';

interface LocationEditHandlerServices {
  locationService: LocationService;
  sportService: SportService;
  locationEditStates: LocationEditStateManager;
  locationEditFlow: LocationEditFlow;
}

export class LocationEditHandler {
  private bot: Telegraf;
  private services: LocationEditHandlerServices;

  constructor(bot: Telegraf, services: LocationEditHandlerServices) {
    this.bot = bot;
    this.services = services;
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Редактировать название
    this.bot.action(/^edit_location_name_(\d+)$/, async (ctx) => {
      const locationId = parseInt(ctx.match[1]);
      const state = this.services.locationEditStates.get(ctx.from!.id);

      if (!state || state.data.locationId !== locationId) {
        await ctx.answerCbQuery('❌ Сессия редактирования истекла');
        return;
      }

      await this.services.locationEditFlow.startNameEdit(ctx, state);
      await ctx.answerCbQuery();
    });

    // Редактировать ссылку на карту
    this.bot.action(/^edit_location_map_(\d+)$/, async (ctx) => {
      const locationId = parseInt(ctx.match[1]);
      const state = this.services.locationEditStates.get(ctx.from!.id);

      if (!state || state.data.locationId !== locationId) {
        await ctx.answerCbQuery('❌ Сессия редактирования истекла');
        return;
      }

      await this.services.locationEditFlow.startMapUrlEdit(ctx, state);
      await ctx.answerCbQuery();
    });

    // Редактировать виды спорта
    this.bot.action(/^edit_location_sports_(\d+)$/, async (ctx) => {
      const locationId = parseInt(ctx.match[1]);
      const state = this.services.locationEditStates.get(ctx.from!.id);

      if (!state || state.data.locationId !== locationId) {
        await ctx.answerCbQuery('❌ Сессия редактирования истекла');
        return;
      }

      await this.services.locationEditFlow.startSportsEdit(ctx, state);
      await ctx.answerCbQuery();
    });

    // Переключить вид спорта
    this.bot.action(/^toggle_location_sport_(\d+)_(\d+)$/, async (ctx) => {
      const locationId = parseInt(ctx.match[1]);
      const sportId = parseInt(ctx.match[2]);
      const state = this.services.locationEditStates.get(ctx.from!.id);

      if (!state || state.data.locationId !== locationId) {
        await ctx.answerCbQuery('❌ Сессия редактирования истекла');
        return;
      }

      await this.services.locationEditFlow.toggleSport(ctx, state, sportId);
    });

    // Сохранить виды спорта
    this.bot.action(/^save_location_sports_(\d+)$/, async (ctx) => {
      const locationId = parseInt(ctx.match[1]);
      const state = this.services.locationEditStates.get(ctx.from!.id);

      if (!state || state.data.locationId !== locationId) {
        await ctx.answerCbQuery('❌ Сессия редактирования истекла');
        return;
      }

      await this.services.locationEditFlow.saveSports(ctx, state);
    });

    // Отменить редактирование
    this.bot.action('cancel_edit_location', async (ctx) => {
      await this.services.locationEditFlow.handleCancellation(ctx);
    });

    // Текстовые сообщения в процессе редактирования
    this.bot.on('text', async (ctx: Context, next) => {
      const userId = ctx.from!.id;
      const state = this.services.locationEditStates.get(userId);

      if (!state) {
        return next();
      }

      switch (state.step) {
        case 'name':
          await this.services.locationEditFlow.handleNameInput(ctx, state);
          break;
        case 'map_url':
          await this.services.locationEditFlow.handleMapUrlInput(ctx, state);
          break;
        default:
          return next();
      }
    });
  }
}
