import { SantaEvent, SantaStatus } from '../../models/SantaEvent';
import { User } from '../../models/User';
import { escapeHtml } from '../../utils/helpers';
import { webAppLink } from './webAppLink';

export interface SantaKeyboard {
  inline_keyboard: Array<Array<{ text: string; url: string }>>;
}

/** Url button (web_app buttons do not work in group chats) that opens the event page. */
export function santaButton(text: string, eventId: number): SantaKeyboard {
  return { inline_keyboard: [[{ text, url: webAppLink(`santa_${eventId}`) }]] };
}

/** 'YYYY-MM-DD' → 'DD.MM.YYYY'. */
export function formatSantaDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}

/**
 * Group announcement of a Santa event (HTML): posted on creation and re-posted by /santa.
 * Names participants but never wishlists or pairs.
 */
export function formatSantaCard(event: SantaEvent, participants: User[]): { text: string; reply_markup: SantaKeyboard } {
  const lines = [`🎅 <b>Тайный Санта: ${escapeHtml(event.title)}</b>`];
  if (event.budget) lines.push(`💰 Бюджет: ${escapeHtml(event.budget)}`);
  if (event.exchange_date) lines.push(`📅 Обмен подарками: ${formatSantaDate(event.exchange_date)}`);
  if (event.description) lines.push(escapeHtml(event.description));
  lines.push('');

  if (event.status === SantaStatus.REGISTRATION) {
    lines.push(
      participants.length > 0
        ? `👥 Участники (${participants.length}): ${participants.map((p) => escapeHtml(p.fullName)).join(', ')}`
        : '👥 Пока никто не записался',
      '',
      'Записывайтесь и пишите пожелания в приложении 👇',
    );
    return { text: lines.join('\n'), reply_markup: santaButton('🎅 Участвовать', event.id) };
  }

  if (event.status === SantaStatus.DRAWN) {
    lines.push(`🎁 Пары распределены (участников: ${participants.length}). Откройте приложение, чтобы узнать, кому вы дарите.`);
    return { text: lines.join('\n'), reply_markup: santaButton('🎁 Узнать, кому дарю', event.id) };
  }

  lines.push('🏁 Событие завершено');
  return { text: lines.join('\n'), reply_markup: santaButton('🎅 Открыть', event.id) };
}
