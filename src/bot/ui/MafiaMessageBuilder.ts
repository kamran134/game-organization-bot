import { MafiaEvent, MafiaStatus } from '../../models/MafiaEvent';
import { User } from '../../models/User';
import { escapeHtml, formatDate } from '../../utils/helpers';
import { webAppLink } from './webAppLink';

export type MafiaButton = { text: string; url: string } | { text: string; callback_data: string };

export interface MafiaKeyboard {
  inline_keyboard: MafiaButton[][];
}

/** Url button (web_app buttons do not work in group chats) that opens the event page. */
export function mafiaButton(text: string, eventId: number): MafiaKeyboard {
  return { inline_keyboard: [[urlButton(text, eventId)]] };
}

function urlButton(text: string, eventId: number): MafiaButton {
  return { text, url: webAppLink(`mafia_${eventId}`) };
}

/**
 * Live group card of a Mafia evening (HTML): posted on creation, re-posted by /mafia and edited after every
 * state change. Lists players by name but never mentions roles.
 */
export function formatMafiaCard(event: MafiaEvent, participants: User[]): { text: string; reply_markup: MafiaKeyboard } {
  const full = participants.length >= event.max_players;
  const lines = [`🎭 <b>Мафия: ${escapeHtml(event.title)}</b>`];
  if (event.starts_at) lines.push(`📅 ${escapeHtml(formatDate(new Date(event.starts_at)))}`);
  if (event.place) lines.push(`📍 ${escapeHtml(event.place)}`);
  if (event.host) lines.push(`🎙 Ведущий: ${escapeHtml(event.host.fullName)}`);
  if (event.description) lines.push(escapeHtml(event.description));
  lines.push('', `👥 Игроки: ${participants.length} / ${event.max_players}`);
  participants.forEach((p, i) => lines.push(`${i + 1}. ${escapeHtml(p.fullName)}`));
  lines.push('');

  switch (event.status) {
    case MafiaStatus.REGISTRATION: {
      lines.push(full ? '⛔ Мест нет' : 'Записывайтесь 👇');
      const row: MafiaButton[] = [];
      if (!full) row.push({ text: '✅ Записаться', callback_data: `mafia_join_${event.id}` });
      row.push({ text: '❌ Выйти', callback_data: `mafia_leave_${event.id}` });
      return {
        text: lines.join('\n'),
        reply_markup: {
          inline_keyboard: [
            row,
            [{ text: '🔒 Закрыть запись', callback_data: `mafia_close_${event.id}` }],
            [urlButton('🎭 Открыть', event.id)],
          ],
        },
      };
    }
    case MafiaStatus.CLOSED:
      lines.push('🔒 Запись закрыта');
      return { text: lines.join('\n'), reply_markup: { inline_keyboard: [[urlButton('🎭 Открыть', event.id)]] } };
    case MafiaStatus.DEALT:
      lines.push(`🎭 Роли розданы — партия №${event.round}`);
      return { text: lines.join('\n'), reply_markup: { inline_keyboard: [[urlButton('🎭 Моя карточка', event.id)]] } };
    default:
      lines.push('🏁 Вечер завершён');
      return { text: lines.join('\n'), reply_markup: { inline_keyboard: [] } };
  }
}
