import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { CommandHandler } from './base/CommandHandler';
import { webAppLink } from '../ui/webAppLink';

export class SantaCommand extends CommandHandler {
  get command(): string {
    return 'santa';
  }

  get description(): string {
    return 'Тайный Санта группы';
  }

  async execute(ctx: Context): Promise<void> {
    if (!(await this.isGroupOnly(ctx))) return;

    const group = await this.services.groupService.getGroupByChatId(ctx.chat!.id);
    if (!group) {
      await ctx.reply('❌ Группа не найдена. Используйте /register для регистрации.');
      return;
    }

    // Url button: web_app buttons do not work in group chats
    await ctx.reply(
      '🎅 Тайный Санта группы',
      Markup.inlineKeyboard([[Markup.button.url('🎅 Открыть', webAppLink(`santas_${group.id}`))]]),
    );
  }
}
