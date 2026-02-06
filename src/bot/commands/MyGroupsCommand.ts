import { Context, Markup } from 'telegraf';
import { CommandHandler } from './base/CommandHandler';

export class MyGroupsCommand extends CommandHandler {
  get command(): string {
    return 'mygroups';
  }

  async execute(ctx: Context): Promise<void> {
    const user = await this.services.userService.getUserByTelegramId(ctx.from!.id);
    if (!user) return;

    const groups = await this.services.groupService.getUserGroups(user.id);

    if (groups.length === 0) {
      await ctx.reply(
        'У вас пока нет групп.\n\nСоздайте новую: /creategroup'
      );
      return;
    }

    const keyboard = groups.map((group) => [
      Markup.button.callback(
        `${group.name} (${group.members?.length || 0} чел.)`,
        `group_${group.id}`
      ),
    ]);

    await ctx.reply(
      `👥 Ваши группы (${groups.length}):\n\nВыберите группу:`,
      Markup.inlineKeyboard(keyboard)
    );
  }
}
