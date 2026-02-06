import { Context } from 'telegraf';
import { UserService } from '../../../services/UserService';
import { GroupService } from '../../../services/GroupService';
import { GameService } from '../../../services/GameService';
import { SportService } from '../../../services/SportService';
import { GameCreationStateManager } from '../../../utils/GameCreationState';

/**
 * Контейнер зависимостей для команд
 */
export interface CommandServices {
  userService: UserService;
  groupService: GroupService;
  gameService: GameService;
  sportService: SportService;
  gameCreationStates: GameCreationStateManager;
}

/**
 * Базовый класс для всех команд бота
 */
export abstract class CommandHandler {
  constructor(protected services: CommandServices) {}

  /**
   * Имя команды (без слэша)
   */
  abstract get command(): string;

  /**
   * Выполнить команду
   */
  abstract execute(ctx: Context): Promise<void>;

  /**
   * Проверка: команда работает только в группах
   */
  protected isGroupOnly(ctx: Context): boolean {
    if (ctx.chat?.type === 'private') {
      ctx.reply('❌ Эта команда работает только в группах.');
      return false;
    }
    return true;
  }

  /**
   * Проверка: команда работает только в личке
   */
  protected isPrivateOnly(ctx: Context): boolean {
    if (ctx.chat?.type !== 'private') {
      ctx.reply('❌ Эта команда работает только в личных сообщениях.');
      return false;
    }
    return true;
  }
}
