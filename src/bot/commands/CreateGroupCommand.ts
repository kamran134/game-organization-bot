import { Context } from 'telegraf';
import { CommandHandler } from './base/CommandHandler';

interface GroupCreationState {
  step: 'name';
  userId: number;
}

export class CreateGroupCommand extends CommandHandler {
  private pendingUsers = new Map<number, GroupCreationState>();

  get command(): string {
    return 'creategroup';
  }

  async execute(ctx: Context): Promise<void> {
    if (!ctx.from) return;

    const user = await this.services.userService.getUserByTelegramId(ctx.from.id);
    if (!user) {
      await ctx.reply('❌ Сначала зарегистрируйтесь: /register');
      return;
    }

    this.pendingUsers.set(ctx.from.id, { step: 'name', userId: user.id });

    await ctx.reply(
      '📝 Введите название новой группы:\n\n' +
      'Например: "Футбол по пятницам" или "Волейбол Центральный"',
      { reply_markup: { force_reply: true, selective: true } }
    );
  }

  hasPendingState(telegramId: number): boolean {
    return this.pendingUsers.has(telegramId);
  }

  async handleTextInput(ctx: Context, telegramId: number, text: string): Promise<void> {
    const state = this.pendingUsers.get(telegramId);
    if (!state) return;

    this.pendingUsers.delete(telegramId);

    const name = text.trim();
    if (name.length < 3) {
      await ctx.reply('❌ Название должно быть не менее 3 символов. Начните заново: /creategroup');
      return;
    }
    if (name.length > 100) {
      await ctx.reply('❌ Название слишком длинное (максимум 100 символов). Начните заново: /creategroup');
      return;
    }

    try {
      const group = await this.services.groupService.createGroup(name, state.userId, false);
      await ctx.reply(
        `✅ Группа создана!\n\n` +
        `📛 Название: ${group.name}\n` +
        `🆔 ID: ${group.id}\n\n` +
        `Чтобы привязать группу к Telegram-чату, добавьте бота в нужный групповой чат — ` +
        `он автоматически зарегистрирует чат.`
      );
    } catch (error) {
      console.error('Error creating group:', error);
      await ctx.reply('❌ Ошибка при создании группы. Попробуйте позже.');
    }
  }
}
