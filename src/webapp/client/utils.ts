import { ApiError } from './api.js';

/**
 * Escapes a value for safe insertion into innerHTML.
 * Prevents XSS when rendering server-supplied data.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formats an ISO date string for Russian locale display.
 */
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Server error strings that should be shown to the user in Russian. */
const KNOWN_ERRORS: Record<string, string> = {
  'Forbidden': 'Нет доступа к этой группе',
  'Registration locked': 'Запись закрыта',
  'Admin only': 'Только для администраторов',
  'You are not a member of this group': 'Вы не участник этой группы',
  'Cannot remove an admin': 'Нельзя удалить администратора',
  'Game cancelled': 'Игра отменена',
  'Game completed': 'Игра уже завершена',
  'Game not active': 'Игра уже не активна',
};

/**
 * Extracts a human-readable message from an unknown error value.
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const known = KNOWN_ERRORS[err.message];
    if (known) return known;
    if (err instanceof ApiError && err.status === 403) return 'Нет доступа к этой группе';
    return err.message;
  }
  if (typeof err === 'string') return err;
  return 'Неизвестная ошибка';
}
