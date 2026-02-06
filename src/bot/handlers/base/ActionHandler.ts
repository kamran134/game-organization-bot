import { Context, Telegraf } from 'telegraf';
import { UserService } from '../../../services/UserService';
import { GroupService } from '../../../services/GroupService';
import { GameService } from '../../../services/GameService';
import { SportService } from '../../../services/SportService';
import { LocationService } from '../../../services/LocationService';
import { GameCreationStateManager } from '../../../utils/GameCreationState';

export interface ActionServices {
  userService: UserService;
  groupService: GroupService;
  gameService: GameService;
  sportService: SportService;
  locationService: LocationService;
  gameCreationStates: GameCreationStateManager;
}

export abstract class ActionHandler {
  protected services: ActionServices;

  constructor(services: ActionServices) {
    this.services = services;
  }

  /**
   * Регистрирует обработчик действий на экземпляре бота
   */
  abstract register(bot: Telegraf): void;

  /**
   * Проверяет, что контекст - это групповой чат
   */
  protected isGroupChat(ctx: Context): boolean {
    return ctx.chat?.type !== 'private';
  }

  /**
   * Проверяет, что контекст - это приватный чат
   */
  protected isPrivateChat(ctx: Context): boolean {
    return ctx.chat?.type === 'private';
  }
}
