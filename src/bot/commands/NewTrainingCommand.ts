import { Context } from 'telegraf';
import { CommandHandler } from './base/CommandHandler';
import { NewGameCommandServices } from './NewGameCommand';
import { GameType } from '../../models/GameType';

export class NewTrainingCommand extends CommandHandler {
  constructor(protected services: NewGameCommandServices) {
    super(services);
  }

  get command(): string {
    return 'newtraining';
  }

  get description(): string {
    return 'Создать новую тренировку';
  }

  async execute(ctx: Context): Promise<void> {
    if (!ctx.from) {
      await ctx.reply('❌ Не удалось определить пользователя');
      return;
    }

    // Проверяем что команда вызвана в группе
    if (!ctx.chat || ctx.chat.type === 'private') {
      await ctx.reply('❌ Эта команда доступна только в групповых чатах.');
      return;
    }

    // Получаем группу
    const group = await this.services.groupService.getGroupByChatId(ctx.chat.id);
    if (!group) {
      await ctx.reply(
        '❌ Группа не найдена в базе данных.\n\n' +
          'Используйте /register для регистрации группы.'
      );
      return;
    }

    // Получаем пользователя из БД
    const user = await this.services.userService.getUserByTelegramId(ctx.from.id);
    if (!user) {
      await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
      return;
    }

    await this.services.creationFlow.start(ctx, GameType.TRAINING, group.id, user.id);
  }
}
