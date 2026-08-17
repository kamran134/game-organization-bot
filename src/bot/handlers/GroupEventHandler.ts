import { Telegraf, Context } from 'telegraf';
import type { Chat } from 'telegraf/types';
import { UserService } from '../../services/UserService';
import { GroupService } from '../../services/GroupService';

export interface GroupEventServices {
  userService: UserService;
  groupService: GroupService;
}

export class GroupEventHandler {
  constructor(private services: GroupEventServices) {}

  register(bot: Telegraf) {
    // Handle bot being added to or removed from groups
    bot.on('my_chat_member', async (ctx) => {
      const { chat, new_chat_member } = ctx.myChatMember;

      // Проверяем, что это бот и его добавили в группу
      if (new_chat_member.user.id === ctx.botInfo.id) {
        if (new_chat_member.status === 'member' || new_chat_member.status === 'administrator') {
          // Бота добавили в группу
          await this.handleBotAddedToGroup(ctx, chat);
        } else if (new_chat_member.status === 'left' || new_chat_member.status === 'kicked') {
          // Бота удалили из группы
          await this.handleBotRemovedFromGroup(ctx, chat);
        }
      }
    });

    // Отслеживаем изменение статуса обычных участников чата (не бота):
    // вышел/удалён из группы → помечаем неактивным; вернулся → реактивируем.
    // Требует, чтобы бот был администратором группы.
    bot.on('chat_member', async (ctx) => {
      const { chat, new_chat_member } = ctx.chatMember;

      if (new_chat_member.user.id === ctx.botInfo.id || new_chat_member.user.is_bot) {
        return;
      }

      await this.handleChatMemberStatusChange(chat, new_chat_member);
    });
  }

  private async handleChatMemberStatusChange(
    chat: Chat,
    newChatMember: { user: { id: number }; status: string }
  ) {
    const group = await this.services.groupService.getGroupByChatId(chat.id);
    if (!group) return;

    const user = await this.services.userService.getUserByTelegramId(newChatMember.user.id);
    if (!user) return;

    if (newChatMember.status === 'left' || newChatMember.status === 'kicked') {
      await this.services.groupService.removeMemberFromGroup(user.id, group.id);
      console.log(`Member ${user.id} deactivated in group ${group.name} (status: ${newChatMember.status})`);
    } else if (
      newChatMember.status === 'member' ||
      newChatMember.status === 'administrator' ||
      newChatMember.status === 'creator'
    ) {
      try {
        await this.services.groupService.addMemberToGroup(user.id, group.id);
      } catch {
        // Уже активный участник — ничего не делаем
      }
    }
  }

  private async handleBotAddedToGroup(ctx: Context, chat: Chat) {
    if (chat.type === 'private') return; // Игнорируем ЛС

    const chatId = chat.id;
    const chatTitle = 'title' in chat ? chat.title : 'Unnamed Group';

    // Проверяем, есть ли уже эта группа в БД
    let group = await this.services.groupService.getGroupByChatId(chatId);

    if (!group) {
      // Создаём новую группу
      const creator = ctx.from
        ? await this.services.userService.findOrCreateUser(ctx.from)
        : undefined;
      group = await this.services.groupService.createGroupFromTelegramChat(
        chatId,
        chatTitle,
        creator?.id
      );

      await ctx.reply(
        `👋 Привет! Я бот для организации игр.\n\n` +
          `Группа "${chatTitle}" зарегистрирована!\n\n` +
          `Доступные команды:\n` +
          `/newgame - Создать новую игру\n` +
          `/games - Список предстоящих игр\n` +
          `/help - Помощь`
      );
    }
  }

  private async handleBotRemovedFromGroup(ctx: Context, chat: Chat) {
    const chatId = chat.id;
    const group = await this.services.groupService.getGroupByChatId(chatId);

    if (group) {
      // Можно пометить группу как неактивную или удалить
      console.log(`Bot removed from group: ${group.name} (${chatId})`);
    }
  }
}
