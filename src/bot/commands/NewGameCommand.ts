import { Context } from 'telegraf';
import { CommandHandler } from './base/CommandHandler';
import { KeyboardBuilder } from '../ui/KeyboardBuilder';

export class NewGameCommand extends CommandHandler {
  get command(): string {
    return 'newgame';
  }

  async execute(ctx: Context): Promise<void> {
    // Работает только в группах
    if (!this.isGroupOnly(ctx)) return;

    const chatId = ctx.chat!.id;
    const group = await this.services.groupService.getGroupByChatId(chatId);

    if (!group) {
      await ctx.reply('❌ Группа не найдена. Добавьте бота в группу заново.');
      return;
    }

    const user = await this.services.userService.getUserByTelegramId(ctx.from!.id);
    if (!user) return;

    // Загружаем список спортов из БД
    const sports = await this.services.sportService.getAllSports();

    // Начинаем процесс создания игры
    await ctx.reply(
      '🎮 Создание новой игры\n\n' +
      'Выберите вид спорта:',
      KeyboardBuilder.createSportSelectionKeyboard(sports)
    );

    // Сохраняем начальное состояние
    this.services.gameCreationStates.set(ctx.from!.id, {
      step: 'sport',
      groupId: group.id,
      userId: user.id,
      data: {},
    });
  }
}
