import { Database } from '../database/Database';
import { Group } from '../models/Group';
import { GroupMember, GroupRole } from '../models/GroupMember';
import { generateInviteCode } from '../utils/helpers';

export class GroupService {
  private db: Database;

  constructor(database: Database) {
    this.db = database;
  }

  async createGroup(name: string, creatorId: number, isPrivate: boolean = false): Promise<Group> {
    const groupRepo = this.db.getRepository(Group);
    const memberRepo = this.db.getRepository(GroupMember);

    const group = groupRepo.create({
      name,
      creator_id: creatorId,
      is_private: isPrivate,
      invite_code: isPrivate ? generateInviteCode() : undefined,
    });

    await groupRepo.save(group);

    // Add creator as admin
    const member = memberRepo.create({
      user_id: creatorId,
      group_id: group.id,
      role: GroupRole.ADMIN,
    });
    await memberRepo.save(member);

    console.log(`Group created: ${group.name} by user ${creatorId}`);
    return group;
  }

  async getGroupById(groupId: number): Promise<Group | null> {
    const groupRepo = this.db.getRepository(Group);
    return groupRepo.findOne({
      where: { id: groupId },
      relations: ['members', 'members.user', 'creator'],
    });
  }

  /** Lightweight lookup of the linked Telegram chat (no relations loaded). */
  async getTelegramChatId(groupId: number): Promise<number | string | null> {
    const groupRepo = this.db.getRepository(Group);
    const group = await groupRepo.findOne({ where: { id: groupId }, select: { id: true, telegram_chat_id: true } });
    return group?.telegram_chat_id ?? null;
  }

  async getUserGroups(userId: number): Promise<Group[]> {
    const memberRepo = this.db.getRepository(GroupMember);
    const memberships = await memberRepo.find({
      where: { user_id: userId, is_active: true },
      relations: ['group', 'group.members'],
    });

    return memberships.map((m) => ({
      ...m.group,
      members: m.group.members?.filter((gm) => gm.is_active) ?? [],
    }));
  }

  async addMemberToGroup(userId: number, groupId: number, role: GroupRole = GroupRole.MEMBER): Promise<void> {
    const memberRepo = this.db.getRepository(GroupMember);

    const existing = await memberRepo.findOne({
      where: { user_id: userId, group_id: groupId },
    });

    if (existing) {
      if (existing.is_active) {
        throw new Error('User is already a member of this group');
      }
      // Пользователь ранее покинул/был удалён из группы — реактивируем запись
      existing.is_active = true;
      await memberRepo.save(existing);
      return;
    }

    const member = memberRepo.create({
      user_id: userId,
      group_id: groupId,
      role: role,
    });

    await memberRepo.save(member);
  }

  async isUserMember(userId: number, groupId: number): Promise<boolean> {
    const memberRepo = this.db.getRepository(GroupMember);
    const member = await memberRepo.findOne({
      where: { user_id: userId, group_id: groupId, is_active: true },
    });

    return !!member;
  }

  /** Помечает участника неактивным (не удаляет запись — нужна для истории/бухгалтерии). */
  async removeMemberFromGroup(userId: number, groupId: number): Promise<void> {
    const memberRepo = this.db.getRepository(GroupMember);
    await memberRepo.update({ user_id: userId, group_id: groupId }, { is_active: false });
  }

  async isUserAdmin(userId: number, groupId: number): Promise<boolean> {
    const memberRepo = this.db.getRepository(GroupMember);
    const member = await memberRepo.findOne({
      where: { user_id: userId, group_id: groupId, is_active: true },
    });

    return member?.role === GroupRole.ADMIN;
  }

  async promoteToAdmin(userId: number, groupId: number): Promise<void> {
    const memberRepo = this.db.getRepository(GroupMember);
    await memberRepo.update(
      { user_id: userId, group_id: groupId },
      { role: GroupRole.ADMIN }
    );
  }

  async getGroupMembers(groupId: number): Promise<GroupMember[]> {
    const memberRepo = this.db.getRepository(GroupMember);
    return memberRepo.find({
      where: { group_id: groupId, is_active: true },
      relations: ['user'],
      order: { role: 'ASC', joined_at: 'ASC' },
    });
  }

  async getGroupByChatId(chatId: number): Promise<Group | null> {
    const groupRepo = this.db.getRepository(Group);
    return groupRepo.findOne({
      where: { telegram_chat_id: chatId },
      relations: ['members', 'members.user', 'creator'],
    });
  }

  async createGroupFromTelegramChat(
    chatId: number,
    chatTitle: string,
    creatorId?: number
  ): Promise<Group> {
    const groupRepo = this.db.getRepository(Group);

    const group = groupRepo.create({
      name: chatTitle,
      telegram_chat_id: chatId,
      creator_id: creatorId,
      is_private: false,
    });

    await groupRepo.save(group);

    if (creatorId) {
      const memberRepo = this.db.getRepository(GroupMember);
      const member = memberRepo.create({
        user_id: creatorId,
        group_id: group.id,
        role: GroupRole.ADMIN,
      });
      await memberRepo.save(member);
    }

    console.log(`Group created from Telegram chat: ${chatTitle} (${chatId})`);
    return group;
  }

  async syncChatMembers(groupId: number, memberIds: number[]): Promise<void> {
    // Добавить новых участников, которых нет в БД
    for (const userId of memberIds) {
      try {
        await this.addMemberToGroup(userId, groupId);
      } catch (error) {
        // Игнорируем если уже есть
      }
    }
  }
}
