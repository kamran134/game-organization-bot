import { GameParticipant } from '../../models/GameParticipant';
import { User } from '../../models/User';
import { GroupMember } from '../../models/GroupMember';
import { escapeHtml } from '../../utils/helpers';

// Single source of truth for date formatting lives in helpers.ts
export { formatDate } from '../../utils/helpers';

/**
 * Форматирование списка участников с группировкой по статусу
 */
export function formatParticipantsList(participants: GameParticipant[]): string {
  const sorted = [...participants].sort((a, b) => a.joined_at.getTime() - b.joined_at.getTime());
  const confirmed = sorted.filter(p => p.participation_status === 'confirmed');
  const maybe     = sorted.filter(p => p.participation_status === 'maybe');
  const guests    = sorted.filter(p => p.participation_status === 'guest');

  let text = '';

  if (confirmed.length > 0) {
    text += '✅ Точно идут:\n';
    confirmed.forEach((p, idx) => {
      const name = p.user
        ? [p.user.first_name, p.user.last_name].filter(Boolean).join(' ')
        : p.guest_name || 'Гость';
      text += `${idx + 1}. ${name}\n`;
    });
    text += '\n';
  }

  if (maybe.length > 0) {
    text += '❓ Возможно придут:\n';
    maybe.forEach((p, idx) => {
      const name = p.user
        ? [p.user.first_name, p.user.last_name].filter(Boolean).join(' ')
        : p.guest_name || 'Гость';
      text += `${idx + 1}. ${name}\n`;
    });
    text += '\n';
  }

  if (guests.length > 0) {
    text += '👤 Гости:\n';
    guests.forEach((p, idx) => {
      text += `${idx + 1}. ${p.guest_name || 'Гость'}\n`;
    });
    text += '\n';
  }

  if (confirmed.length === 0 && maybe.length === 0 && guests.length === 0) {
    text = 'Пока никто не записался';
  } else {
    const parts: string[] = [];
    if (confirmed.length > 0) parts.push(`${confirmed.length} точно`);
    if (maybe.length > 0)     parts.push(`${maybe.length} под вопросом`);
    if (guests.length > 0)    parts.push(`${guests.length} гост${guests.length === 1 ? 'ь' : guests.length < 5 ? 'я' : 'ей'}`);
    const total = confirmed.length + maybe.length + guests.length;
    text += `📊 Всего: ${total} (${parts.join(', ')})`;
  }

  return text.trimEnd();
}

/**
 * Упоминание пользователя для рассылки в группу.
 *
 * Если у человека есть @username — пингуем им. Если нет (или он ещё не подтянулся)
 * — инлайн-меншен `tg://user?id=`, который работает по telegram_id и не требует
 * username вовсе. За счёт этого в пинг попадают ВСЕ участники, а не только те,
 * у кого username заполнен.
 *
 * Требует parse_mode: 'HTML' у сообщения.
 */
export function formatMention(user: Pick<User, 'telegram_id' | 'username' | 'first_name' | 'last_name'>): string {
  if (user.username) {
    return `@${user.username}`;
  }

  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Игрок';
  return `<a href="tg://user?id=${user.telegram_id}">${escapeHtml(name)}</a>`;
}

/**
 * Строка упоминаний всех участников группы для уведомления о новой игре/тренировке.
 * Возвращает пустую строку, если упоминать некого.
 */
export function formatMembersMentions(members: GroupMember[]): string {
  return members
    .filter((m) => m.user)
    .map((m) => formatMention(m.user))
    .join(' ');
}
