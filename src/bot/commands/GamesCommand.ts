import { Context } from 'telegraf';
import { CommandHandler } from './base/CommandHandler';
import { GamesView } from '../ui/GamesView';

export class GamesCommand extends CommandHandler {
  get command(): string {
    return 'games';
  }

  async execute(ctx: Context): Promise<void> {
    if (!this.isGroupOnly(ctx)) return;

    const chatId = ctx.chat!.id;
    const group = await this.services.groupService.getGroupByChatId(chatId);

    if (!group) {
      await ctx.reply('❌ Группа не найдена.');
      return;
    }

    await GamesView.show(ctx, this.services, group.id, 'all', 'reply');
  }
}


