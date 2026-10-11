import { Context } from 'telegraf';
import { CommandHandler, CommandServices } from './base/CommandHandler';
import { CreationFlow } from '../flows/CreationFlow';
import { GameType } from '../../models/GameType';

export interface NewGameCommandServices extends CommandServices {
  creationFlow: CreationFlow;
}

export class NewGameCommand extends CommandHandler {
  constructor(protected services: NewGameCommandServices) {
    super(services);
  }

  get command(): string {
    return 'newgame';
  }

  async execute(ctx: Context): Promise<void> {
    // Работает только в группах
    if (!(await this.isGroupOnly(ctx))) return;

    const chatId = ctx.chat!.id;
    const group = await this.services.groupService.getGroupByChatId(chatId);

    if (!group) {
      await ctx.reply('❌ Группа не найдена. Добавьте бота в группу заново.');
      return;
    }

    const user = await this.services.userService.getUserByTelegramId(ctx.from!.id);
    if (!user) return;

    await this.services.creationFlow.start(ctx, GameType.GAME, group.id, user.id);
  }
}
