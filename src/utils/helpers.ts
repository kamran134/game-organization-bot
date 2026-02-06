import crypto from 'crypto';
import { GameParticipant } from '../models/GameParticipant';

export function generateInviteCode(length: number = 8): string {
  return crypto.randomBytes(length).toString('hex').substring(0, length).toUpperCase();
}

export function formatDate(date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };
  return new Intl.DateTimeFormat('ru-RU', options).format(date);
}

type ParticipantWithUser = GameParticipant & {
  user?: {
    mention: string;
  };
};

export function formatParticipantsList(
  participants: ParticipantWithUser[],
  maxSlots: number
): string {
  let result = '';
  const inGame = participants.filter((p) => (p.position || 0) <= maxSlots);
  const waiting = participants.filter((p) => (p.position || 0) > maxSlots);

  if (inGame.length > 0) {
    result += '👥 Участники:\n';
    inGame.forEach((p) => {
      const name = p.guest_name || p.user?.mention || 'Unknown';
      const emoji = p.getStatusEmoji();
      result += `${p.position}. ${emoji} ${name}\n`;
    });
  }

  if (waiting.length > 0) {
    result += '\n⏳ Список ожидания:\n';
    waiting.forEach((p) => {
      const name = p.guest_name || p.user?.mention || 'Unknown';
      const emoji = p.getStatusEmoji();
      result += `${emoji} ${name}\n`;
    });
  }

  return result || 'Нет участников';
}

export function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}
