import { Context } from 'telegraf';
import { CommandHandler, CommandServices } from './base/CommandHandler';

export class StartCommand extends CommandHandler {
  constructor(services: CommandServices) {
    super(services);
  }

  get command(): string {
    return 'start';
  }

  async execute(ctx: Context): Promise<void> {
    const user = await this.services.userService.getUserByTelegramId(ctx.from!.id);
    
    // Если команда в группе
    if (ctx.chat?.type !== 'private') {
      await ctx.reply(
        `👋 Привет! Используйте /newgame для создания игры или /games для просмотра списка игр.`
      );
      return;
    }

    // В личных сообщениях
    await ctx.reply(
      `Привет, ${user?.first_name || 'друг'}! 🎮⚽🏐\n\n` +
      `Я помогу организовать игры!\n\n` +
      `Добавьте меня в вашу Telegram группу, чтобы начать создавать игры.\n\n` +
      `Команды в группе:\n` +
      `/newgame - Создать новую игру\n` +
      `/games - Список игр\n\n` +
      `Команды в личке:\n` +
      `/mygroups - Мои группы\n` +
      `/help - Помощь`
    );
  }
}
