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

  async getUserGroups(userId: number): Promise<Group[]> {
    const memberRepo = this.db.getRepository(GroupMember);
    const memberships = await memberRepo.find({
      where: { user_id: userId },
      relations: ['group', 'group.members'],
    });

    return memberships.map((m) => m.group);
  }

  async addMemberToGroup(userId: number, groupId: number, role: GroupRole = GroupRole.MEMBER): Promise<void> {
    const memberRepo = this.db.getRepository(GroupMember);

    const existing = await memberRepo.findOne({
      where: { user_id: userId, group_id: groupId },
    });

    if (existing) {
      throw new Error('User is already a member of this group');
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
      where: { user_id: userId, group_id: groupId },
    });

    return !!member;
  }

  async removeMemberFromGroup(userId: number, groupId: number): Promise<void> {
    const memberRepo = this.db.getRepository(GroupMember);
    await memberRepo.delete({ user_id: userId, group_id: groupId });
  }

  async isUserAdmin(userId: number, groupId: number): Promise<boolean> {
    const memberRepo = this.db.getRepository(GroupMember);
    const member = await memberRepo.findOne({
      where: { user_id: userId, group_id: groupId },
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
      where: { group_id: groupId },
      relations: ['user'],
      order: { role: 'ASC', joined_at: 'ASC' },
    });
  }

  async getGroupByInviteCode(inviteCode: string): Promise<Group | null> {
    const groupRepo = this.db.getRepository(Group);
    return groupRepo.findOne({ where: { invite_code: inviteCode } });
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
