import { show, showLoader, toast, setBackButton, hideMainButton, type TelegramWebApp } from '../ui.js';
import { apiFetch } from '../api.js';
import { escapeHtml, getErrorMessage, santaStatusLabel, santaPersonName, formatSantaDate } from '../utils.js';
import type { Nav, SantaDetailsDto, SantaPersonDto } from '../types.js';

interface SantaEventCtx {
  tg: TelegramWebApp;
  eventId: number;
}

const MIN_PARTICIPANTS = 3;

function personLabel(p: SantaPersonDto): string {
  const name = escapeHtml(santaPersonName(p));
  return p.username && santaPersonName(p) !== p.username ? `${name} (@${escapeHtml(p.username)})` : name;
}

function renderHeader(d: SantaDetailsDto): string {
  const { event } = d;
  return `
    <h2 class="page-title">🎅 ${escapeHtml(event.title)}</h2>
    <div class="santa-meta">
      <span class="santa-badge santa-badge-${escapeHtml(event.status)}">${escapeHtml(santaStatusLabel(event.status))}</span>
      ${event.budget ? `<div>💰 Бюджет: ${escapeHtml(event.budget)}</div>` : ''}
      ${event.exchange_date ? `<div>📅 Обмен подарками: ${escapeHtml(formatSantaDate(event.exchange_date))}</div>` : ''}
      ${event.description ? `<div class="santa-description">${escapeHtml(event.description)}</div>` : ''}
    </div>
  `;
}

function renderAssignment(d: SantaDetailsDto): string {
  if (d.assignment) {
    const wish = d.assignment.wishlist
      ? `<div class="santa-wishlist">${escapeHtml(d.assignment.wishlist)}</div>`
      : '<div class="santa-wishlist santa-hint">пока не указаны</div>';
    return `
      <div class="santa-card">
        <div class="santa-card-title">🎁 Вы дарите: ${personLabel(d.assignment.receiver)}</div>
        <div class="santa-card-label">Пожелания:</div>
        ${wish}
      </div>
    `;
  }
  if (d.event.status !== 'registration' && !d.me.joined) {
    return '<div class="empty">Жеребьёвка уже прошла</div>';
  }
  return '';
}

function renderWishlistForm(d: SantaDetailsDto): string {
  const status = d.event.status;
  const joined = d.me.joined;
  const textarea = `
    <textarea id="santa-wishlist" class="input textarea" rows="3" maxlength="1000"
      placeholder="Что бы вы хотели получить?">${escapeHtml(d.me.wishlist ?? '')}</textarea>`;

  if (status === 'registration' && !joined) {
    return `
      <div class="field">
        <label class="label">Ваши пожелания (необязательно)</label>
        ${textarea}
      </div>
      <button class="btn btn-primary btn-large" data-action="join">🎅 Участвую</button>
    `;
  }
  if (status === 'registration') {
    return `
      <div class="field">
        <label class="label">Ваши пожелания</label>
        ${textarea}
      </div>
      <button class="btn btn-primary" data-action="save-wishlist">Сохранить пожелания</button>
      <button class="btn btn-secondary" data-action="leave">Выйти</button>
    `;
  }
  if (status === 'drawn' && joined) {
    return `
      <div class="field">
        <label class="label">Ваши пожелания</label>
        ${textarea}
        <div class="santa-hint">Ваш Санта увидит изменения</div>
      </div>
      <button class="btn btn-primary" data-action="save-wishlist">Сохранить пожелания</button>
    `;
  }
  return '';
}

function renderParticipants(d: SantaDetailsDto): string {
  const canRemove = d.isAdmin && d.event.status === 'registration';
  const rows = d.participants.map((p) => `
    <div class="member-row">
      <span class="member-name">${escapeHtml(santaPersonName(p))}</span>
      ${p.username ? `<span class="member-hint">@${escapeHtml(p.username)}</span>` : ''}
      ${canRemove
        ? `<button class="btn-icon" data-action="remove-participant" data-user-id="${escapeHtml(String(p.user_id))}" title="Убрать из события">🗑️</button>`
        : ''}
    </div>
  `).join('');

  return `
    <h3 class="santa-section-title">Участники (${d.participants.length})</h3>
    ${rows || '<div class="empty">Пока никто не записался</div>'}
  `;
}

function renderAdminActions(d: SantaDetailsDto): string {
  if (!d.isAdmin) return '';
  const status = d.event.status;
  const parts: string[] = [];

  if (status === 'registration') {
    const enough = d.participants.length >= MIN_PARTICIPANTS;
    parts.push(
      `<button class="btn ${enough ? 'btn-primary' : 'btn-disabled'}" data-action="draw" ${enough ? '' : 'disabled'}>🎲 Провести жеребьёвку</button>`,
    );
    if (!enough) parts.push(`<div class="santa-hint">Для жеребьёвки нужно минимум ${MIN_PARTICIPANTS} участника</div>`);
  }
  if (status === 'drawn') {
    parts.push('<button class="btn btn-secondary" data-action="reset">🔄 Перетянуть заново</button>');
    parts.push('<button class="btn btn-primary" data-action="finish">🏁 Завершить</button>');
  }
  parts.push('<button class="btn btn-danger" data-action="delete">Удалить событие</button>');

  return `<div class="santa-admin">${parts.join('')}</div>`;
}

/**
 * Renders a Secret Santa event: status, own wishlist and recipient, participants and admin actions.
 */
export async function renderSantaEvent(ctx: SantaEventCtx, nav: Nav): Promise<void> {
  const { tg, eventId } = ctx;

  hideMainButton(tg);
  setBackButton(tg, () => nav.goSantaList());
  showLoader();

  const url = `/api/santa/${encodeURIComponent(String(eventId))}`;

  let details: SantaDetailsDto;
  try {
    details = await apiFetch<SantaDetailsDto>(url);
  } catch (err) {
    show(`<div class="error">❌ ${escapeHtml(getErrorMessage(err))}</div>`);
    return;
  }

  function render(): void {
    show(`
      <div class="page" id="santa-event-page">
        ${renderHeader(details)}
        ${renderAssignment(details)}
        ${renderWishlistForm(details)}
        ${renderParticipants(details)}
        ${renderAdminActions(details)}
      </div>
    `);
    attachHandlers();
  }

  async function reload(): Promise<void> {
    details = await apiFetch<SantaDetailsDto>(url);
    render();
  }

  function readWishlist(): string {
    const el = document.getElementById('santa-wishlist') as HTMLTextAreaElement | null;
    return el ? el.value.trim() : '';
  }

  /** Runs a mutation with the button disabled; on success shows the toast and refreshes the page. */
  async function run(btn: HTMLButtonElement, request: () => Promise<unknown>, successMsg: string): Promise<void> {
    btn.disabled = true;
    try {
      await request();
      toast(successMsg);
      await reload();
    } catch (err) {
      btn.disabled = false;
      toast(getErrorMessage(err), true);
    }
  }

  function attachHandlers(): void {
    document.getElementById('santa-event-page')!.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
      if (!btn || btn.disabled) return;

      const action = btn.dataset['action'];

      if (action === 'join') {
        await run(btn, () => apiFetch(`${url}/join`, {
          method: 'POST',
          body: JSON.stringify({ wishlist: readWishlist() }),
        }), '✅ Вы участвуете!');
        return;
      }

      if (action === 'save-wishlist') {
        await run(btn, () => apiFetch(`${url}/wishlist`, {
          method: 'PUT',
          body: JSON.stringify({ wishlist: readWishlist() }),
        }), '✅ Пожелания сохранены');
        return;
      }

      if (action === 'leave') {
        if (!window.confirm('Выйти из события?')) return;
        await run(btn, () => apiFetch(`${url}/join`, { method: 'DELETE' }), 'Вы вышли из события');
        return;
      }

      if (action === 'remove-participant') {
        const userId = btn.dataset['userId']!;
        const person = details.participants.find((p) => String(p.user_id) === userId);
        const name = person ? santaPersonName(person) : 'участника';
        if (!window.confirm(`Убрать ${name} из события?`)) return;
        await run(btn, () => apiFetch(`${url}/participants/${encodeURIComponent(userId)}`, { method: 'DELETE' }), 'Участник убран');
        return;
      }

      if (action === 'draw') {
        if (!window.confirm('Провести жеребьёвку? После неё новые участники записаться не смогут.')) return;
        await run(btn, () => apiFetch(`${url}/draw`, { method: 'POST' }), '🎲 Пары распределены');
        return;
      }

      if (action === 'reset') {
        if (!window.confirm('Все пары будут распределены заново')) return;
        await run(btn, () => apiFetch(`${url}/reset`, { method: 'POST' }), '🔄 Жеребьёвка отменена');
        return;
      }

      if (action === 'finish') {
        if (!window.confirm('Завершить событие?')) return;
        await run(btn, () => apiFetch(`${url}/finish`, { method: 'POST' }), '🏁 Событие завершено');
        return;
      }

      if (action === 'delete') {
        if (!window.confirm('Удалить событие целиком? Это действие нельзя отменить.')) return;
        btn.disabled = true;
        try {
          await apiFetch(url, { method: 'DELETE' });
          toast('Событие удалено');
          nav.goSantaList();
        } catch (err) {
          btn.disabled = false;
          toast(getErrorMessage(err), true);
        }
      }
    });
  }

  render();
}
