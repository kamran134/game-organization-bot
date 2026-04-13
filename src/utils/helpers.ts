import crypto from 'crypto';

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

/** Escapes special characters for Telegram Markdown v1 (legacy parse_mode: 'Markdown'). */
export function escapeMarkdownV1(text: string): string {
  return text.replace(/[_*`[]/g, '\\$&');
}

/** Escapes special characters for Telegram MarkdownV2. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}
