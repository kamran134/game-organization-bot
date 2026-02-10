import { Context, Markup } from 'telegraf';
import { LocationService } from '../../services/LocationService';
import { GroupService } from '../../services/GroupService';
import { UserService } from '../../services/UserService';
import { LocationEditStateManager } from '../../utils/LocationEditState';
import { LocationEditFlow } from '../flows/LocationEditFlow';

interface EditLocationCommandServices {
  locationService: LocationService;
  groupService: GroupService;
  userService: UserService;
  locationEditStates: LocationEditStateManager;
  locationEditFlow: LocationEditFlow;
}

export class EditLocationCommand {
  protected services: EditLocationCommandServices;

  constructor(services: EditLocationCommandServices) {
    this.services = services;
  }

  get command(): string {
    return 'editlocation';
  }

  get description(): string {
    return 'Редактировать локацию (только для админов)';
  }

  get isGroupOnly(): boolean {
    return true;
  }

  get isPrivateOnly(): boolean {
    return false;
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

    // Проверяем права администратора
    const user = await this.services.userService.getUserByTelegramId(ctx.from!.id);
    if (!user) {
      await ctx.reply('❌ Ошибка: пользователь не найден.');
      return;
    }

    const isAdmin = await this.services.groupService.isUserAdmin(user.id, group.id);
    if (!isAdmin) {
      await ctx.reply('❌ Эта команда доступна только администраторам группы.');
      return;
    }

    // Получаем все локации группы
    const locations = await this.services.locationService.getByGroup(group.id);

    if (locations.length === 0) {
      await ctx.reply(
        '📍 В группе пока нет локаций.\n\n' +
        'Добавьте локацию командой /addlocation'
      );
      return;
    }

    // Формируем клавиатуру выбора локации
    const buttons = locations.map(location => {
      const sports = location.sportLocations?.map(sl => sl.sport.emoji).join('') || '';
      return [
        Markup.button.callback(
          `${sports} ${location.name}`,
          `start_edit_location_${location.id}`
        )
      ];
    });

    await ctx.reply(
      '✏️ Выберите локацию для редактирования:',
      Markup.inlineKeyboard(buttons)
    );
  }
}
