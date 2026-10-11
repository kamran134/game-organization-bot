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

/** Makes a URL safe inside a legacy Markdown link target: a raw ")" would end the link early. */
export function escapeMarkdownUrl(url: string): string {
  return url.replace(/\)/g, '%29');
}

/** Escapes special characters for Telegram MarkdownV2. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

/**
 * Экранирование для parse_mode: 'HTML' в Telegram.
 * Telegram требует экранировать только эти три символа.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Cuts a string that has no usable break points into pieces of at most `limit` chars, never splitting a surrogate pair. */
function hardCut(text: string, limit: number): string[] {
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = limit;
    const lastCode = rest.charCodeAt(cut - 1);
    if (lastCode >= 0xd800 && lastCode <= 0xdbff && cut > 1) cut -= 1;
    pieces.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.length > 0) pieces.push(rest);
  return pieces;
}

/** Greedily packs `parts` into chunks of at most `limit` chars, joined with `separator`. Oversized parts are passed to `splitLarge`. */
function packParts(
  parts: string[],
  separator: string,
  limit: number,
  splitLarge: (part: string) => string[],
): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const part of parts) {
    if (part.length > limit) {
      if (current) chunks.push(current);
      current = '';
      chunks.push(...splitLarge(part));
      continue;
    }
    if (current === '') {
      current = part;
    } else if (current.length + separator.length + part.length <= limit) {
      current += separator + part;
    } else {
      chunks.push(current);
      current = part;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Splits a long message into chunks of at most `limit` chars (Telegram caps messages at 4096).
 * Breaks on blank lines first, then on single newlines, and hard-cuts only as a last resort.
 * Chunks are never empty or whitespace-only.
 */
export function splitMessage(text: string, limit: number = 4096): string[] {
  if (text.length <= limit) return text.trim() === '' ? [] : [text];

  const chunks = packParts(text.split('\n\n'), '\n\n', limit, (paragraph) =>
    packParts(paragraph.split('\n'), '\n', limit, (line) => hardCut(line, limit)),
  );
  return chunks.filter((chunk) => chunk.trim() !== '');
}

/** Returns 'YYYY-MM' for the current month in UTC. */
export function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Validates that a string matches 'YYYY-MM'. */
export function isValidMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
