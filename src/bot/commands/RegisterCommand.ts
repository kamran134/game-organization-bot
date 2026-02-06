import { Context } from 'telegraf';
import { CommandHandler } from './base/CommandHandler';

export class RegisterCommand extends CommandHandler {
  get command(): string {
    return 'register';
  }

  async execute(ctx: Context): Promise<void> {
    // Команда работает только в группах
    if (!this.isGroupOnly(ctx)) return;

    const chatId = ctx.chat!.id;
    const group = await this.services.groupService.getGroupByChatId(chatId);

    if (!group) {
      await ctx.reply(
        '❌ Группа не найдена в системе.\n\n' +
        'Пожалуйста, добавьте бота в группу заново.'
      );
      return;
    }

    // Пользователь уже создан через middleware
    const user = await this.services.userService.getUserByTelegramId(ctx.from!.id);
    if (!user) {
      await ctx.reply('❌ Ошибка регистрации. Попробуйте снова.');
      return;
    }

    try {
      await this.services.groupService.addMemberToGroup(user.id, group.id);
      await ctx.reply(
        `✅ Вы зарегистрированы в группе "${group.name}"!\n\n` +
        `Теперь вы можете записываться на игры.`
      );
    } catch (error) {
      const err = error as Error;
      if (err.message.includes('already a member')) {
        await ctx.reply(
          `ℹ️ Вы уже зарегистрированы в этой группе.`
        );
      } else {
        await ctx.reply('❌ Ошибка при регистрации. Попробуйте позже.');
      }
    }
  }
}
