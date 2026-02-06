import { GameParticipant, ParticipationStatus } from '../../models/GameParticipant';

/**
 * Форматирование даты для отображения
 */
export function formatDate(date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };
  return new Date(date).toLocaleDateString('ru-RU', options);
}

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
  const confirmed = participants.filter(p => p.participation_status === 'confirmed');
  const maybe = participants.filter(p => p.participation_status === 'maybe');

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
  }

  if (confirmed.length === 0 && maybe.length === 0) {
    text = 'Пока никто не записался';
  }

  return text;
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
