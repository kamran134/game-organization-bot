import { GameType } from '../../models/GameType';
import { CreationStateManager } from '../../utils/CreationState';
import { CreationFlow } from '../flows/CreationFlow';
import { BotHandler } from './base/BotHandler';

interface CreationHandlerServices {
  creationStates: CreationStateManager;
  creationFlow: CreationFlow;
}

const TYPE_BY_PREFIX: Record<string, GameType> = {
  game: GameType.GAME,
  training: GameType.TRAINING,
};

/** Button callbacks of the game/training creation wizard. Callbacks of anyone else's wizard fall through via next(). */
export class CreationHandler extends BotHandler {
  constructor(private readonly services: CreationHandlerServices) {
    super();
  }

  protected registerHandlers(): void {
    const { creationStates, creationFlow } = this.services;

    this.bot.action(/^sport_(\d+)$/, async (ctx, next) => {
      const state = creationStates.get(ctx.from!.id);
      if (!state || state.step !== 'sport') return next();
      await creationFlow.selectSport(ctx, state, parseInt(ctx.match[1]));
    });

    this.bot.action(/^location_(\d+)$/, async (ctx, next) => {
      const state = creationStates.get(ctx.from!.id);
      if (!state || state.step !== 'location') return next();
      await creationFlow.selectLocation(ctx, state, parseInt(ctx.match[1]));
    });

    this.bot.action('location_custom', async (ctx, next) => {
      const state = creationStates.get(ctx.from!.id);
      if (!state || state.step !== 'location') return next();
      await creationFlow.requestCustomLocation(ctx, state);
    });

    // The prefix keeps the callback data of already sent confirmation messages valid
    this.bot.action(/^confirm_(game|training)_(\d+)$/, async (ctx) => {
      await creationFlow.confirm(ctx, TYPE_BY_PREFIX[ctx.match[1]], parseInt(ctx.match[2]));
    });

    this.bot.action(/^cancel_(game|training)_(\d+)$/, async (ctx) => {
      await creationFlow.cancel(ctx, TYPE_BY_PREFIX[ctx.match[1]], parseInt(ctx.match[2]));
    });
  }
}
