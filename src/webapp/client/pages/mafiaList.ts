import { show, showLoader, setBackButton, hideMainButton, type TelegramWebApp } from '../ui.js';
import { apiFetch } from '../api.js';
import { escapeHtml, getErrorMessage, mafiaStatusLabel, formatDate } from '../utils.js';
import type { Nav, MafiaEventSummaryDto } from '../types.js';

interface MafiaListCtx {
  tg: TelegramWebApp;
  groupId: string;
}

function renderEventCard(e: MafiaEventSummaryDto): string {
  const meta = [
    `👥 ${e.participants_count} / ${e.max_players}`,
    e.starts_at ? `📅 ${escapeHtml(formatDate(e.starts_at))}` : '',
    e.place ? `📍 ${escapeHtml(e.place)}` : '',
  ].filter(Boolean).join(' · ');

  return `
    <button class="santa-event-card" data-event-id="${escapeHtml(String(e.id))}">
      <div class="santa-event-title">${escapeHtml(e.title)}${e.joined ? ' ✅' : ''}${e.isHost ? ' 🎙' : ''}</div>
      <div class="santa-event-meta">
        <span class="santa-badge santa-badge-${escapeHtml(e.status)}">${escapeHtml(mafiaStatusLabel(e.status))}</span>
        <span>${meta}</span>
      </div>
    </button>
  `;
}

/**
 * Renders the Mafia evenings of the group: active first, finished below. Any member can create one.
 */
export async function renderMafiaList(ctx: MafiaListCtx, nav: Nav): Promise<void> {
  const { tg, groupId } = ctx;

  hideMainButton(tg);
  setBackButton(tg, () => nav.goHome());
  showLoader();

  let events: MafiaEventSummaryDto[];
  try {
    events = await apiFetch<MafiaEventSummaryDto[]>(`/api/mafia?group_id=${encodeURIComponent(groupId)}`);
  } catch (err) {
    show(`<div class="error">❌ ${escapeHtml(getErrorMessage(err))}</div>`);
    return;
  }

  const active = events.filter((e) => e.status !== 'finished');
  const finished = events.filter((e) => e.status === 'finished');

  const body = events.length === 0
    ? '<div class="empty">Пока нет ни одного вечера. Соберите компанию на мафию! 🎭</div>'
    : `
      <div class="santa-list">${active.map(renderEventCard).join('')}</div>
      ${finished.length ? `<h3 class="santa-section-title">Завершённые</h3><div class="santa-list">${finished.map(renderEventCard).join('')}</div>` : ''}
    `;

  show(`
    <div class="page" id="mafia-list-page">
      <h2 class="page-title">🎭 Мафия</h2>
      <button class="btn btn-primary btn-large" data-action="create">➕ Создать вечер</button>
      ${body}
    </div>
  `);

  document.getElementById('mafia-list-page')!.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    if (target.closest('[data-action="create"]')) {
      nav.goMafiaCreate();
      return;
    }

    const card = target.closest<HTMLElement>('[data-event-id]');
    if (card) nav.goMafiaEvent(parseInt(card.dataset['eventId']!, 10));
  });
}
