import { Context } from 'telegraf';
import { CommandHandler } from './base/CommandHandler';

export class CreateGroupCommand extends CommandHandler {
  get command(): string {
    return 'creategroup';
  }

  async execute(ctx: Context): Promise<void> {
    await ctx.reply(
      'Введите название новой группы:\n\n' +
      'Например: "Футбол по пятницам" или "Волейбол Центральный"\n\n' +
      '(Функция создания группы будет реализована в следующей версии)'
    );
  }
}
