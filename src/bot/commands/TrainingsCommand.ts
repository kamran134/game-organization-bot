import { Context } from 'telegraf';
import { CommandHandler } from './base/CommandHandler';
// import { GameService } from '../../services/GameService';
import { GameType } from '../../models/GameType';
import { GameMessageBuilder } from '../ui/GameMessageBuilder';
import { KeyboardBuilder } from '../ui/KeyboardBuilder';

export class TrainingsCommand extends CommandHandler {
  get command(): string {
    return 'trainings';
  }

  get description(): string {
    return 'Показать список тренировок';
  }

  async execute(ctx: Context): Promise<void> {
    // Проверяем что команда вызвана в группе
    if (!ctx.chat || ctx.chat.type === 'private') {
      await ctx.reply('❌ Эта команда доступна только в групповых чатах.');
      return;
    }

    // Получаем группу
    const group = await this.services.groupService.getGroupByChatId(ctx.chat.id);
    
    if (!group) {
      await ctx.reply('❌ Группа не найдена в базе данных.');
      return;
    }

    // Получаем все предстоящие события
    const allGames = await this.services.gameService.getUpcomingGroupGames(group.id);
    
    // Фильтруем только тренировки
    const trainings = allGames.filter(game => game.type === GameType.TRAINING);

    if (trainings.length === 0) {
      await ctx.reply(
        '🏋️ Предстоящих тренировок нет.\n\n' +
        'Создайте тренировку командой /newtraining'
      );
      return;
    }

    // Проверяем права админа
    let isAdmin = false;
    if (ctx.from) {
      const user = await this.services.userService.getUserByTelegramId(ctx.from.id);
      if (user) {
        isAdmin = await this.services.groupService.isUserAdmin(user.id, group.id);
      }
    }

    // Отправляем карточки тренировок
    for (const training of trainings) {
      const confirmedCount = training.participants?.filter(p => p.participation_status === 'confirmed').length || 0;
      const maybeCount = training.participants?.filter(p => p.participation_status === 'maybe').length || 0;
      
      const message = GameMessageBuilder.buildTrainingCard(training);
      const keyboard = KeyboardBuilder.createGameActionsKeyboard(training.id, confirmedCount, isAdmin, maybeCount);

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
        ...keyboard,
      });
    }
  }
}
