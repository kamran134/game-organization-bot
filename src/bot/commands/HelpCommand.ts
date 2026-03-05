import { Context } from 'telegraf';
import { CommandHandler } from './base/CommandHandler';

export class HelpCommand extends CommandHandler {
  get command(): string {
    return 'help';
  }

  async execute(ctx: Context): Promise<void> {
    await ctx.reply(
      `📖 Помощь\n\n` +
      `🏃 Основные команды:\n` +
      `/mygroups - Список моих групп\n` +
      `/creategroup - Создать новую группу\n` +
      `/register - Присоединиться к группе\n` +
      `/wiki - Полная документация\n\n` +
      `⚽ Работа с играми:\n` +
      `/newgame - Создать новую игру\n` +
      `/games - Список предстоящих игр\n` +
      `/players - Список участников игры\n` +
      `• Записаться - кнопка под объявлением\n` +
      `• Посмотреть участников - в карточке игры\n\n` +
      `🏋️ Работа с тренировками:\n` +
      `/newtraining - Создать новую тренировку\n` +
      `/trainings - Список предстоящих тренировок\n` +
      `• Макс. участники и стоимость - опционально\n` +
      `• Безлимит участников - введите "-"\n\n` +
      `📍 Локации (для админов):\n` +
      `/addlocation - Добавить локацию\n` +
      `/editlocation - Редактировать локацию\n` +
      `/locations - Список всех локаций\n\n` +
      `👥 Группы:\n` +
      `• Можно быть в нескольких группах\n` +
      `• Админы управляют играми и участниками\n` +
      `• Приглашайте друзей по ссылке`
    );
  }
}
