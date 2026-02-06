import { Markup, Telegraf } from 'telegraf';
import { ActionHandler, ActionServices } from './base/ActionHandler';

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
  }
}
