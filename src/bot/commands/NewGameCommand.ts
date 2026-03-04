import { Context } from 'telegraf';
import { Markup } from 'telegraf';
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

    const webappUrl = process.env.WEBAPP_URL;

    if (webappUrl) {
      const url = `${webappUrl}?action=create_game&group_id=${group.id}`;
      await ctx.reply(
        '🎮 Создание новой игры\n\nОткройте форму или воспользуйтесь пошаговым созданием:',
        Markup.inlineKeyboard([
          [Markup.button.webApp('📝 Открыть форму', url)],
          [Markup.button.callback('⌨️ Создать пошагово', `newgame_steps_${group.id}_${user.id}`)],
        ])
      );
      return;
    }

    // Fallback: пошаговое создание
    await this.startStepFlow(ctx, group.id, user.id);
  }

  async startStepFlow(ctx: Context, groupId: number, userId: number): Promise<void> {
    const sports = await this.services.sportService.getAllSports();

    await ctx.reply(
      '🎮 Создание новой игры\n\n' +
      'Выберите вид спорта:',
      KeyboardBuilder.createSportSelectionKeyboard(sports)
    );

    this.services.gameCreationStates.set(ctx.from!.id, {
      step: 'sport',
      groupId,
      userId,
      data: {},
    });
  }
}
