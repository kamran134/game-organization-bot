import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { CommandHandler } from './base/CommandHandler';

export class AppCommand extends CommandHandler {
  get command(): string {
    return 'app';
  }

  get description(): string {
    return 'Открыть веб-приложение';
  }

  async execute(ctx: Context): Promise<void> {
    if (!this.isGroupOnly(ctx)) return;

    const webappUrl = process.env.WEBAPP_URL;
    if (!webappUrl) {
      await ctx.reply('❌ Веб-приложение не настроено.');
      return;
    }

    const chatId = ctx.chat!.id;
    const group = await this.services.groupService.getGroupByChatId(chatId);

    if (!group) {
      await ctx.reply('❌ Группа не найдена. Используйте /register для регистрации.');
      return;
    }

    const url = `${webappUrl}?group_id=${group.id}`;

    await ctx.reply(
      '📱 Веб-приложение группы',
      Markup.inlineKeyboard([
        [Markup.button.webApp('🌐 Открыть', url)],
      ])
    );
  }
}
