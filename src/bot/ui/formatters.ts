import { GameParticipant, ParticipationStatus } from '../../models/GameParticipant';
import { User } from '../../models/User';
import { GroupMember } from '../../models/GroupMember';
import { escapeHtml } from '../../utils/helpers';
import { groupByTeam, teamLabel } from '../../utils/gameTeams';

// Single source of truth for date formatting lives in helpers.ts
export { formatDate } from '../../utils/helpers';

/** Имя участника: пользователь или гость. */
export function participantName(p: GameParticipant): string {
  return p.user
    ? [p.user.first_name, p.user.last_name].filter(Boolean).join(' ')
    : p.guest_name || 'Гость';
}

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
      text += `${idx + 1}. ${participantName(p)}\n`;
    });
    text += '\n';
  }

  if (maybe.length > 0) {
    text += '❓ Возможно придут:\n';
    maybe.forEach((p, idx) => {
      text += `${idx + 1}. ${participantName(p)}\n`;
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

const NO_TEAM_LABEL = '⚪ Без команды';

/** Titled name groups in display order: non-empty teams first, then the players without a team. */
function teamGroups(
  participants: GameParticipant[],
  teamCount: number,
  escape: (s: string) => string,
): Array<{ title: string; names: string[] }> {
  const players = participants.filter(
    (p) => p.participation_status === ParticipationStatus.CONFIRMED || p.participation_status === ParticipationStatus.GUEST,
  );
  const { teams, unassigned } = groupByTeam(players, (p) => p.team, teamCount);
  const groups = teams.map((members, i) => ({ title: teamLabel(i + 1), names: members.map((p) => escape(participantName(p))) }));
  groups.push({ title: NO_TEAM_LABEL, names: unassigned.map((p) => escape(participantName(p))) });
  return groups.filter((g) => g.names.length > 0);
}

/** Компактно, для карточки игры: по строке на команду, имена через запятую. */
export function formatTeamsInline(
  participants: GameParticipant[],
  teamCount: number,
  escape: (s: string) => string,
): string {
  return teamGroups(participants, teamCount, escape)
    .map((g) => `${g.title}: ${g.names.join(', ')}`)
    .join('\n');
}

/** Нумерованный список по командам — для сообщения «составы» в чат. */
export function formatTeamsList(
  participants: GameParticipant[],
  teamCount: number,
  escape: (s: string) => string,
): string {
  return teamGroups(participants, teamCount, escape)
    .map((g) => `${g.title}:\n${g.names.map((name, i) => `${i + 1}. ${name}`).join('\n')}`)
    .join('\n\n');
}
