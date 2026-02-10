import { Markup, Telegraf } from 'telegraf';
import { ActionHandler, ActionServices } from './base/ActionHandler';
import { KeyboardBuilder } from '../ui/KeyboardBuilder';

export class GroupActionsHandler extends ActionHandler {
  constructor(services: ActionServices) {
    super(services);
  }

  register(bot: Telegraf): void {
    // Group menu
    bot.action(/group_(\d+)/, async (ctx) => {
      const groupId = parseInt(ctx.match[1]);
      const group = await this.services.groupService.getGroupById(groupId);
      
      if (!group) {
        await ctx.answerCbQuery('Группа не найдена');
        return;
      }

      const user = await this.services.userService.getUserByTelegramId(ctx.from!.id);
      const isAdmin = user ? await this.services.groupService.isUserAdmin(user.id, groupId) : false;

      const games = await this.services.gameService.getUpcomingGroupGames(groupId);
      const gamesText = games.length > 0 
        ? `\n\n🎮 Предстоящие игры: ${games.length}`
        : '\n\n📭 Пока нет запланированных игр';

      const keyboard = [
        [Markup.button.callback('🎮 Игры группы', `games_${groupId}`)],
        [Markup.button.callback('👥 Участники', `members_${groupId}`)],
      ];

      if (isAdmin) {
        keyboard.push([Markup.button.callback('➕ Создать игру', `create_game_${groupId}`)]);
        keyboard.push([Markup.button.callback('⚙️ Управление', `manage_${groupId}`)]);
      }

      keyboard.push([
        Markup.button.callback('👋 Покинуть группу', `leave_group_${groupId}`),
      ]);
      keyboard.push([Markup.button.callback('« Назад', 'my_groups')]);

      await ctx.editMessageText(
        `📁 ${group.name}\n` +
        `${group.description || ''}\n` +
        `👥 Участников: ${group.members?.length || 0}` +
        gamesText,
        Markup.inlineKeyboard(keyboard)
      );
      await ctx.answerCbQuery();
    });

    // Back to my groups
    bot.action('my_groups', async (ctx) => {
      const user = await this.services.userService.getUserByTelegramId(ctx.from!.id);
      if (!user) return;

      const groups = await this.services.groupService.getUserGroups(user.id);
      const keyboard = groups.map((group) => [
        Markup.button.callback(
          `${group.name} (${group.members?.length || 0} чел.)`,
          `group_${group.id}`
        ),
      ]);

      await ctx.editMessageText(
        `👥 Ваши группы (${groups.length}):\n\nВыберите группу:`,
        Markup.inlineKeyboard(keyboard)
      );
      await ctx.answerCbQuery();
    });

    // Show group members
    bot.action(/members_(\d+)/, async (ctx) => {
      const groupId = parseInt(ctx.match[1]);
      const members = await this.services.groupService.getGroupMembers(groupId);

      let text = '👥 Участники группы:\n\n';
      
      const admins = members.filter((m) => m.isAdmin());
      const regularMembers = members.filter((m) => !m.isAdmin());

      if (admins.length > 0) {
        text += '👑 Администраторы:\n';
        admins.forEach((m) => {
          text += `• ${m.user.mention}\n`;
        });
        text += '\n';
      }

      if (regularMembers.length > 0) {
        text += '👤 Участники:\n';
        regularMembers.forEach((m) => {
          text += `• ${m.user.mention}\n`;
        });
      }

      await ctx.editMessageText(
        text,
        Markup.inlineKeyboard([
          [Markup.button.callback('« Назад к группе', `group_${groupId}`)],
        ])
      );
      await ctx.answerCbQuery();
    });

    // Leave group
    bot.action(/leave_group_(\d+)/, async (ctx) => {
      const groupId = parseInt(ctx.match[1]);
      const user = await this.services.userService.getUserByTelegramId(ctx.from!.id);
      
      if (!user) {
        await ctx.answerCbQuery('Ошибка: пользователь не найден');
        return;
      }

      const group = await this.services.groupService.getGroupById(groupId);
      if (!group) {
        await ctx.answerCbQuery('Группа не найдена');
        return;
      }

      await this.services.groupService.removeMemberFromGroup(user.id, groupId);
      
      await ctx.editMessageText(
        `Вы покинули группу "${group.name}" 👋\n\n` +
        `Используйте /mygroups чтобы увидеть оставшиеся группы`
      );
      await ctx.answerCbQuery('Вы вышли из группы');
    });

    // Remove member (admin only)
    bot.action(/remove_member_(\d+)_(\d+)/, async (ctx) => {
      const groupId = parseInt(ctx.match[1]);
      const memberUserId = parseInt(ctx.match[2]);
      const admin = await this.services.userService.getUserByTelegramId(ctx.from!.id);
      
      if (!admin) {
        await ctx.answerCbQuery('Ошибка: пользователь не найден');
        return;
      }

      const isAdmin = await this.services.groupService.isUserAdmin(admin.id, groupId);
      if (!isAdmin) {
        await ctx.answerCbQuery('⛔ Только администраторы могут удалять участников');
        return;
      }

      await this.services.groupService.removeMemberFromGroup(memberUserId, groupId);
      
      // Refresh members list
      const members = await this.services.groupService.getGroupMembers(groupId);
      let text = '👥 Участники группы:\n\n';
      
      const admins = members.filter((m) => m.isAdmin());
      const regularMembers = members.filter((m) => !m.isAdmin());

      if (admins.length > 0) {
        text += '👑 Администраторы:\n';
        admins.forEach((m) => {
          text += `• ${m.user.mention}\n`;
        });
        text += '\n';
      }

      if (regularMembers.length > 0) {
        text += '👤 Участники:\n';
        regularMembers.forEach((m) => {
          text += `• ${m.user.mention} - `;
          text += Markup.button.callback('❌', `remove_member_${groupId}_${m.user.id}`).text;
          text += '\n';
        });
      }

      await ctx.editMessageText(text);
      await ctx.answerCbQuery('Участник удален из группы');
    });

    // Manage group (admin menu)
    bot.action(/manage_(\d+)/, async (ctx) => {
      const groupId = parseInt(ctx.match[1]);
      const user = await this.services.userService.getUserByTelegramId(ctx.from!.id);
      
      if (!user) return;

      const isAdmin = await this.services.groupService.isUserAdmin(user.id, groupId);
      if (!isAdmin) {
        await ctx.answerCbQuery('⛔ Только администраторы имеют доступ');
        return;
      }

      const group = await this.services.groupService.getGroupById(groupId);
      if (!group) return;

      await ctx.editMessageText(
        `⚙️ Управление группой "${group.name}"\n\n` +
        `Выберите действие:`,
        Markup.inlineKeyboard([
          [Markup.button.callback('👥 Управление участниками', `manage_members_${groupId}`)],
          [Markup.button.callback('« Назад к группе', `group_${groupId}`)],
        ])
      );
      await ctx.answerCbQuery();
    });

    // Manage members
    bot.action(/manage_members_(\d+)/, async (ctx) => {
      const groupId = parseInt(ctx.match[1]);
      const members = await this.services.groupService.getGroupMembers(groupId);

      let text = '👥 Управление участниками\n\n';
      
      const admins = members.filter((m) => m.isAdmin());
      const regularMembers = members.filter((m) => !m.isAdmin());

      if (admins.length > 0) {
        text += '👑 Администраторы:\n';
        admins.forEach((m) => {
          text += `• ${m.user.mention}\n`;
        });
        text += '\n';
      }

      if (regularMembers.length > 0) {
        text += '👤 Участники (нажмите ❌ для удаления):\n';
        regularMembers.forEach((m) => {
          text += `• ${m.user.mention}\n`;
        });
      }

      const keyboard = regularMembers.map((m) => [
        Markup.button.callback(
          `❌ ${m.user.mention}`,
          `remove_member_${groupId}_${m.user.id}`
        ),
      ]);

      keyboard.push([Markup.button.callback('« Назад', `manage_${groupId}`)]);

      await ctx.editMessageText(text, Markup.inlineKeyboard(keyboard));
      await ctx.answerCbQuery();
    });

    // Manage locations
    bot.action(/^manage_locations_(\d+)$/, async (ctx) => {
      const groupId = parseInt(ctx.match[1]);
      
      // Проверяем права
      const user = await this.services.userService.getUserByTelegramId(ctx.from!.id);
      if (!user) {
        await ctx.answerCbQuery('❌ Ошибка');
        return;
      }

      const isAdmin = await this.services.groupService.isUserAdmin(user.id, groupId);
      if (!isAdmin) {
        await ctx.answerCbQuery('❌ Только администраторы могут управлять локациями');
        return;
      }

      const locations = await this.services.locationService.getByGroup(groupId);
      
      if (locations.length === 0) {
        await ctx.editMessageText(
          '📍 В группе пока нет локаций.\n\n' +
          'Добавьте локацию командой /addlocation',
          Markup.inlineKeyboard([[Markup.button.callback('« Назад', `group_${groupId}`)]])
        );
        await ctx.answerCbQuery();
        return;
      }

      await ctx.editMessageText(
        '📍 Управление локациями\n\n' +
        'Нажмите 🗑 для удаления локации:',
        KeyboardBuilder.createLocationManagementKeyboard(locations, groupId)
      );
      await ctx.answerCbQuery();
    });

    // View location details
    bot.action(/^view_location_(\d+)$/, async (ctx) => {
      const locationId = parseInt(ctx.match[1]);
      const location = await this.services.locationService.getById(locationId);
      
      if (!location) {
        await ctx.answerCbQuery('❌ Локация не найдена');
        return;
      }

      // Проверяем права
      const user = await this.services.userService.getUserByTelegramId(ctx.from!.id);
      if (!user) {
        await ctx.answerCbQuery('❌ Ошибка');
        return;
      }

      const isAdmin = await this.services.groupService.isUserAdmin(user.id, location.group_id);
      if (!isAdmin) {
        await ctx.answerCbQuery('❌ Только администраторы могут просматривать детали локаций');
        return;
      }

      // Формируем список видов спорта
      const sports = location.sportLocations?.map(sl => `${sl.sport.emoji} ${sl.sport.name}`).join(', ') || 'Не указаны';

      await ctx.editMessageText(
        `📍 Локация: ${location.name}\n\n` +
        `🏃 Виды спорта: ${sports}\n` +
        (location.map_url ? `🗺 Карта: ${location.map_url}\n` : `🗺 Карта: не указана\n`) +
        `\nВыберите действие:`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✏️ Редактировать', `start_edit_location_${locationId}`)],
          [Markup.button.callback('« Назад к списку', `manage_locations_${location.group_id}`)]
        ])
      );
      await ctx.answerCbQuery();
    });

    // Start editing location (from view)
    bot.action(/^start_edit_location_(\d+)$/, async (ctx) => {
      const locationId = parseInt(ctx.match[1]);
      const location = await this.services.locationService.getById(locationId);
      
      if (!location) {
        await ctx.answerCbQuery('❌ Локация не найдена');
        return;
      }

      // Проверяем права
      const user = await this.services.userService.getUserByTelegramId(ctx.from!.id);
      if (!user) {
        await ctx.answerCbQuery('❌ Ошибка');
        return;
      }

      const isAdmin = await this.services.groupService.isUserAdmin(user.id, location.group_id);
      if (!isAdmin) {
        await ctx.answerCbQuery('❌ Только администраторы могут редактировать локации');
        return;
      }

      // Проверяем наличие сервисов редактирования
      if (!this.services.locationEditStates || !this.services.locationEditFlow) {
        await ctx.answerCbQuery('❌ Функция редактирования недоступна');
        return;
      }

      // Создаём состояние редактирования
      const state = {
        step: 'menu' as const,
        groupId: location.group_id,
        data: {
          locationId: location.id,
          locationName: location.name
        }
      };

      this.services.locationEditStates.set(ctx.from!.id, state);
      
      // Показываем меню редактирования
      await this.services.locationEditFlow.showEditMenu(ctx, state);
      await ctx.answerCbQuery();
    });

    // Delete location (confirmation request)
    bot.action(/^delete_location_(\d+)$/, async (ctx) => {
      const locationId = parseInt(ctx.match[1]);
      const location = await this.services.locationService.getById(locationId);
      
      if (!location) {
        await ctx.answerCbQuery('❌ Локация не найдена');
        return;
      }

      // Проверяем права
      const user = await this.services.userService.getUserByTelegramId(ctx.from!.id);
      if (!user) {
        await ctx.answerCbQuery('❌ Ошибка');
        return;
      }

      const isAdmin = await this.services.groupService.isUserAdmin(user.id, location.group_id);
      if (!isAdmin) {
        await ctx.answerCbQuery('❌ Только администраторы могут удалять локации');
        return;
      }

      // Формируем список видов спорта
      const sports = location.sportLocations?.map(sl => `${sl.sport.emoji} ${sl.sport.name}`).join(', ') || '';

      await ctx.answerCbQuery();
      await ctx.reply(
        `⚠️ Вы уверены, что хотите удалить эту локацию?\n\n` +
        `📍 ${location.name}\n` +
        `🏃 ${sports}\n` +
        (location.map_url ? `🗺 ${location.map_url}\n` : ''),
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Да, удалить', `confirm_delete_location_${locationId}_${location.group_id}`)],
          [Markup.button.callback('❌ Отмена', `cancel_delete_location_${location.group_id}`)]
        ])
      );
    });

    // Confirm delete location
    bot.action(/^confirm_delete_location_(\d+)_(\d+)$/, async (ctx) => {
      const locationId = parseInt(ctx.match[1]);
      const groupId = parseInt(ctx.match[2]);
      const location = await this.services.locationService.getById(locationId);
      
      if (!location) {
        await ctx.editMessageText('❌ Локация не найдена');
        return;
      }

      // Проверяем права
      const user = await this.services.userService.getUserByTelegramId(ctx.from!.id);
      if (!user) {
        await ctx.editMessageText('❌ Ошибка');
        return;
      }

      const isAdmin = await this.services.groupService.isUserAdmin(user.id, location.group_id);
      if (!isAdmin) {
        await ctx.editMessageText('❌ Только администраторы могут удалять локации');
        return;
      }

      try {
        await this.services.locationService.delete(locationId);

        await ctx.editMessageText(
          `✅ Локация успешно удалена\n\n` +
          `📍 ${location.name}`
        );
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Error deleting location:', error);
        await ctx.editMessageText('❌ Ошибка при удалении локации. Возможно, она используется в запланированных играх.');
        await ctx.answerCbQuery();
      }
    });

    // Cancel delete location
    bot.action(/^cancel_delete_location_(\d+)$/, async (ctx) => {
      const groupId = parseInt(ctx.match[1]);
      await ctx.editMessageText('❌ Удаление локации отменено');
      await ctx.answerCbQuery();
    });

    // Remove member (confirmation request)
    bot.action(/^remove_member_(\d+)_(\d+)$/, async (ctx) => {
      const groupId = parseInt(ctx.match[1]);
      const userId = parseInt(ctx.match[2]);
      
      // Проверяем права текущего пользователя
      const currentUser = await this.services.userService.getUserByTelegramId(ctx.from!.id);
      if (!currentUser) {
        await ctx.answerCbQuery('❌ Ошибка');
        return;
      }

      const isAdmin = await this.services.groupService.isUserAdmin(currentUser.id, groupId);
      if (!isAdmin) {
        await ctx.answerCbQuery('❌ Только администраторы могут удалять участников');
        return;
      }

      const userToRemove = await this.services.userService.getUserById(userId);
      if (!userToRemove) {
        await ctx.answerCbQuery('❌ Пользователь не найден');
        return;
      }

      await ctx.answerCbQuery();
      await ctx.reply(
        `⚠️ Вы уверены, что хотите удалить участника?\n\n` +
        `👤 ${userToRemove.mention}`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Да, удалить', `confirm_remove_member_${groupId}_${userId}`)],
          [Markup.button.callback('❌ Отмена', `cancel_remove_member_${groupId}`)]
        ])
      );
    });

    // Confirm remove member
    bot.action(/^confirm_remove_member_(\d+)_(\d+)$/, async (ctx) => {
      const groupId = parseInt(ctx.match[1]);
      const userId = parseInt(ctx.match[2]);
      
      // Проверяем права
      const currentUser = await this.services.userService.getUserByTelegramId(ctx.from!.id);
      if (!currentUser) {
        await ctx.editMessageText('❌ Ошибка');
        return;
      }

      const isAdmin = await this.services.groupService.isUserAdmin(currentUser.id, groupId);
      if (!isAdmin) {
        await ctx.editMessageText('❌ Только администраторы могут удалять участников');
        return;
      }

      const userToRemove = await this.services.userService.getUserById(userId);
      if (!userToRemove) {
        await ctx.editMessageText('❌ Пользователь не найден');
        return;
      }

      try {
        await this.services.groupService.removeMemberFromGroup(userId, groupId);

        await ctx.editMessageText(
          `✅ Участник успешно удалён из группы\n\n` +
          `👤 ${userToRemove.mention}`
        );
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Error removing member:', error);
        await ctx.editMessageText('❌ Ошибка при удалении участника');
        await ctx.answerCbQuery();
      }
    });

    // Cancel remove member
    bot.action(/^cancel_remove_member_(\d+)$/, async (ctx) => {
      await ctx.editMessageText('❌ Удаление участника отменено');
      await ctx.answerCbQuery();
    });
  }
}
