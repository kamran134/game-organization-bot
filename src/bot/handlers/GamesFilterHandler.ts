import { Telegraf, Context } from 'telegraf';
import { GamesView, GamesFilter } from '../ui/GamesView';

interface HandlerServices {
  gameService: any;
  groupService: any;
  userService: any;
}

export class GamesFilterHandler {
  constructor(
    private bot: Telegraf,
    private services: HandlerServices
  ) {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    this.bot.action(/^filter_(games|trainings|all)_(\d+)$/, this.handleFilter.bind(this));
  }

  private async handleFilter(ctx: Context): Promise<void> {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

    const match = ctx.callbackQuery.data.match(/^filter_(games|trainings|all)_(\d+)$/);
    if (!match) return;

    const [, filterType, groupIdStr] = match;
    const groupId = parseInt(groupIdStr);

    await ctx.answerCbQuery();
    await GamesView.show(ctx, this.services, groupId, filterType as GamesFilter, 'edit');
  }
}



