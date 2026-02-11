import { Context } from 'telegraf';
import { CommandHandler } from './base/CommandHandler';
import { CommandServices } from './base/CommandHandler';
// import { GameService } from '../../services/GameService';
// import { SportService } from '../../services/SportService';
// import { GroupService } from '../../services/GroupService';
import { LocationService } from '../../services/LocationService';
import { TrainingCreationStateManager } from '../../utils/TrainingCreationState';
import { KeyboardBuilder } from '../ui/KeyboardBuilder';

export interface NewTrainingCommandServices extends CommandServices {
  locationService: LocationService;
  trainingCreationStates: TrainingCreationStateManager;
}

export class NewTrainingCommand extends CommandHandler {
  protected trainingStates: TrainingCreationStateManager;

  constructor(services: NewTrainingCommandServices) {
    super(services);
    this.trainingStates = services.trainingCreationStates;
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

    // Получаем виды спорта
    const sports = await this.services.sportService.getAllSports();

    if (sports.length === 0) {
      await ctx.reply('❌ В системе нет доступных видов спорта.');
      return;
    }

    // Инициализируем состояние создания тренировки
    this.trainingStates.set(ctx.from.id, {
      step: 'sport',
      groupId: group.id,
      userId: ctx.from.id,
      data: {},
    });

    // Показываем выбор вида спорта
    const keyboard = KeyboardBuilder.createSportSelectionKeyboard(sports);
    await ctx.reply(
      '🏋️ **Создание тренировки**\n\n' +
        'Выберите вид спорта:',
      keyboard
    );
  }
}
