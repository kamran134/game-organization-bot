import { GameParticipant, ParticipationStatus } from '../../models/GameParticipant';

// Single source of truth for date formatting lives in helpers.ts
export { formatDate } from '../../utils/helpers';

/**
 * Форматирование статуса игры с emoji
 */
export function formatGameStatus(status: string): string {
  const statusMap: Record<string, string> = {
    planned: '📅 Запланирована',
    active: '🟢 Активна',
    completed: '✅ Завершена',
    cancelled: '❌ Отменена',
  };
  return statusMap[status] || status;
}

/**
 * Форматирование имени участника с его статусом
 */
export function formatParticipantName(participant: GameParticipant): string {
  const statusEmoji: Record<ParticipationStatus, string> = {
    confirmed: '✅',
    maybe: '❓',
    guest: '👤',
  };

  const emoji = statusEmoji[participant.participation_status] || '';
  const name = participant.user 
    ? (participant.user.username ? `@${participant.user.username}` : participant.user.first_name)
    : participant.guest_name || 'Гость';

  return `${emoji} ${name}`;
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
      const name = p.user
        ? (p.user.username ? `@${p.user.username}` : p.user.first_name)
        : p.guest_name || 'Гость';
      text += `${idx + 1}. ${name}\n`;
    });
    text += '\n';
  }

  if (maybe.length > 0) {
    text += '❓ Возможно придут:\n';
    maybe.forEach((p, idx) => {
      const name = p.user
        ? (p.user.username ? `@${p.user.username}` : p.user.first_name)
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
 * Форматирование числа участников
 */
export function formatParticipantsCount(
  confirmedCount: number,
  maybeCount: number,
  min: number,
  max: number
): string {
  // const total = confirmedCount + maybeCount;
  return `${confirmedCount}/${max} (ещё ${maybeCount} под вопросом)`;
}
