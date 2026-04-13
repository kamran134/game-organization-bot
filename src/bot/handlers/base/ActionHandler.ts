import { Context, Telegraf } from 'telegraf';
import { UserService } from '../../../services/UserService';
import { GroupService } from '../../../services/GroupService';
import { GameService } from '../../../services/GameService';
import { SportService } from '../../../services/SportService';
import { LocationService } from '../../../services/LocationService';
import { JokeService } from '../../../services/JokeService';
import { GameCreationStateManager } from '../../../utils/GameCreationState';
import { LocationEditStateManager } from '../../../utils/LocationEditState';
import { LocationEditFlow } from '../../flows/LocationEditFlow';

export interface ActionServices {
  userService: UserService;
  groupService: GroupService;
  gameService: GameService;
  sportService: SportService;
  locationService: LocationService;
  jokeService: JokeService;
  gameCreationStates: GameCreationStateManager;
  locationEditStates?: LocationEditStateManager;
  locationEditFlow?: LocationEditFlow;
}

export abstract class ActionHandler {
  protected services: ActionServices;

  constructor(services: ActionServices) {
    this.services = services;
  }

  abstract register(bot: Telegraf): void;

  protected isGroupChat(ctx: Context): boolean {
    return ctx.chat?.type !== 'private';
  }

  protected isPrivateChat(ctx: Context): boolean {
    return ctx.chat?.type === 'private';
  }

  /**
   * Returns true if the calling Telegram user is an admin in the given group.
   * Combines getUserByTelegramId + isUserAdmin in one call.
   */
  protected async checkAdmin(ctx: Context, groupId: number): Promise<boolean> {
    if (!ctx.from) return false;
    const user = await this.services.userService.getUserByTelegramId(ctx.from.id);
    if (!user) return false;
    return this.services.groupService.isUserAdmin(user.id, groupId);
  }
}
