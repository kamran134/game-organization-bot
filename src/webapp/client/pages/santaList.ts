import { show, showLoader, setBackButton, hideMainButton, type TelegramWebApp } from '../ui.js';
import { apiFetch } from '../api.js';
import { escapeHtml, getErrorMessage, santaStatusLabel, formatSantaDate } from '../utils.js';
import type { Nav, SantaEventSummaryDto } from '../types.js';

interface SantaListCtx {
  tg: TelegramWebApp;
  groupId: string;
  isAdmin: boolean;
}

function renderEventCard(e: SantaEventSummaryDto): string {
  const meta = [
    `👥 ${e.participants_count}`,
    e.budget ? `💰 ${escapeHtml(e.budget)}` : '',
    e.exchange_date ? `📅 ${escapeHtml(formatSantaDate(e.exchange_date))}` : '',
  ].filter(Boolean).join(' · ');

  return `
    <button class="santa-event-card" data-event-id="${escapeHtml(String(e.id))}">
      <div class="santa-event-title">${escapeHtml(e.title)}${e.joined ? ' ✅' : ''}</div>
      <div class="santa-event-meta">
        <span class="santa-badge santa-badge-${escapeHtml(e.status)}">${escapeHtml(santaStatusLabel(e.status))}</span>
        <span>${meta}</span>
      </div>
    </button>
  `;
}

/**
 * Renders the Secret Santa events of the group: active first, finished below.
 */
export async function renderSantaList(ctx: SantaListCtx, nav: Nav): Promise<void> {
  const { tg, groupId, isAdmin } = ctx;

  hideMainButton(tg);
  setBackButton(tg, () => nav.goHome());
  showLoader();

  let events: SantaEventSummaryDto[];
  try {
    events = await apiFetch<SantaEventSummaryDto[]>(`/api/santa?group_id=${encodeURIComponent(groupId)}`);
  } catch (err) {
    show(`<div class="error">❌ ${escapeHtml(getErrorMessage(err))}</div>`);
    return;
  }

  const active = events.filter((e) => e.status !== 'finished');
  const finished = events.filter((e) => e.status === 'finished');

  const body = events.length === 0
    ? '<div class="empty">Пока нет ни одного события. Тайный Санта — отличный повод собраться! 🎅</div>'
    : `
      <div class="santa-list">${active.map(renderEventCard).join('')}</div>
      ${finished.length ? `<h3 class="santa-section-title">Завершённые</h3><div class="santa-list">${finished.map(renderEventCard).join('')}</div>` : ''}
    `;

  show(`
    <div class="page" id="santa-list-page">
      <h2 class="page-title">🎅 Тайный Санта</h2>
      ${isAdmin ? '<button class="btn btn-primary btn-large" data-action="create">➕ Создать</button>' : ''}
      ${body}
    </div>
  `);

  document.getElementById('santa-list-page')!.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    if (target.closest('[data-action="create"]')) {
      nav.goSantaCreate();
      return;
    }

    const card = target.closest<HTMLElement>('[data-event-id]');
    if (card) nav.goSantaEvent(parseInt(card.dataset['eventId']!, 10));
  });
}
