import { Context } from 'telegraf';
import { UserService } from '../../services/UserService';
import { GroupService } from '../../services/GroupService';
import { LocationCreationStateManager } from '../../utils/LocationCreationState';
import { GameCreationStateManager } from '../../utils/GameCreationState';
import { SportService } from '../../services/SportService';
import { StateManager } from '../../utils/StateManager';
import { KeyboardBuilder } from '../ui/KeyboardBuilder';

interface AddLocationCommandServices {
  userService: UserService;
  groupService: GroupService;
  sportService: SportService;
  locationCreationStates: LocationCreationStateManager;
  gameCreationStates: GameCreationStateManager;
}

export class AddLocationCommand {
  protected services: AddLocationCommandServices;

  constructor(services: AddLocationCommandServices) {
    this.services = services;
  }

  get command(): string {
    return 'addlocation';
  }

  get description(): string {
    return 'Добавить локацию для группы (только для админов)';
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

    const userId = ctx.from!.id;

    // Получаем или создаём пользователя
    const user = await this.services.userService.findOrCreateUser({
      id: userId,
      username: ctx.from!.username,
      first_name: ctx.from!.first_name,
      last_name: ctx.from!.last_name,
    });

    // Получаем группу
    const group = await this.services.groupService.getGroupByChatId(ctx.chat.id);
    if (!group) {
      await ctx.reply('❌ Группа не найдена в базе данных. Сначала используйте /register для регистрации группы.');
      return;
    }

    // Проверяем что пользователь - админ группы
    const isAdmin = await this.services.groupService.isUserAdmin(user.id, group.id);
    if (!isAdmin) {
      await ctx.reply('❌ Только администраторы группы могут добавлять локации.');
      return;
    }

    // One wizard per user: drop any other pending creation/edit state
    StateManager.clearUser(userId);
    
    // Начинаем процесс создания локации
    this.services.locationCreationStates.set(userId, {
      step: 'sport',
      groupId: group.id,
      userId: user.id,
      data: {},
    });

    const sports = await this.services.sportService.getSportsForGroup(group.id);
    await ctx.reply(
      '📍 Создание новой локации\n\n' +
      '🏃 Сначала выберите вид спорта:',
      KeyboardBuilder.createLocationSportSelectionKeyboard(sports)
    );
  }
}
