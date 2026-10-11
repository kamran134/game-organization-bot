/** Minimal Telegram surface needed for the membership fallback (satisfied by telegraf's Telegram). */
export interface ChatMemberLookup {
  getChatMember(chatId: number | string, userId: number): Promise<{ status: string; is_member?: boolean }>;
}

export interface GroupAccessSource {
  isUserMember(userId: number, groupId: number): Promise<boolean>;
  getTelegramChatId(groupId: number): Promise<number | string | null>;
}

export interface AccessUser {
  id: number;
  telegram_id: number | string;
}

export type GroupAccessChecker = (user: AccessUser, groupId: number) => Promise<boolean>;

/**
 * Builds the read-access check for group-scoped data.
 *
 * An active group_members row grants access. Otherwise the user may simply not have
 * touched the bot yet (membership is created lazily), so fall back to asking Telegram
 * whether they are in the group's chat. Never writes; any Telegram error means "no".
 */
export function createGroupAccessChecker(source: GroupAccessSource, telegram: ChatMemberLookup): GroupAccessChecker {
  return async (user, groupId) => {
    if (await source.isUserMember(user.id, groupId)) return true;

    const chatId = await source.getTelegramChatId(groupId);
    if (chatId === null || chatId === undefined) return false;

    try {
      const member = await telegram.getChatMember(chatId, Number(user.telegram_id));
      switch (member.status) {
        case 'creator':
        case 'administrator':
        case 'member':
          return true;
        case 'restricted':
          return member.is_member === true;
        default:
          return false;
      }
    } catch {
      return false;
    }
  };
}
