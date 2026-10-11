import { Context } from 'telegraf';
import { CommandHandler } from './base/CommandHandler';
import { StateManager } from '../../utils/StateManager';
import { KeyboardBuilder } from '../ui/KeyboardBuilder';

export class NewGameCommand extends CommandHandler {
  get command(): string {
    return 'newgame';
  }

  async execute(ctx: Context): Promise<void> {
    // Работает только в группах
    if (!(await this.isGroupOnly(ctx))) return;

    const chatId = ctx.chat!.id;
    const group = await this.services.groupService.getGroupByChatId(chatId);

    if (!group) {
      await ctx.reply('❌ Группа не найдена. Добавьте бота в группу заново.');
      return;
    }

    const user = await this.services.userService.getUserByTelegramId(ctx.from!.id);
    if (!user) return;

    await this.startStepFlow(ctx, group.id, user.id);
  }

  async startStepFlow(ctx: Context, groupId: number, userId: number): Promise<void> {
    const sports = await this.services.sportService.getSportsForGroup(groupId);

    // One wizard per user: a stale training/location state must not keep eating text input
    StateManager.clearUser(ctx.from!.id);

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
