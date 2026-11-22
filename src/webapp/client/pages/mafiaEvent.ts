import { show, showLoader, toast, setBackButton, hideMainButton, type TelegramWebApp } from '../ui.js';
import { apiFetch } from '../api.js';
import { escapeHtml, getErrorMessage, mafiaStatusLabel, santaPersonName, formatDate } from '../utils.js';
import { openMafiaCard } from '../mafiaCard.js';
import {
  MAFIA_MIN_PLAYERS,
  MAFIA_ROLE_NAME,
  MAFIA_ROLE_ORDER,
  MAFIA_ROLE_TEAM,
  MAFIA_TEAM_COLOR,
  validateCounts,
} from '../mafiaRoles.js';
import type { MafiaDetailsDto, MafiaLayoutDto, MafiaRole, MafiaRoleCounts, Nav } from '../types.js';

interface MafiaEventCtx {
  tg: TelegramWebApp;
  eventId: number;
}

function sumCounts(counts: MafiaRoleCounts): number {
  return MAFIA_ROLE_ORDER.reduce((acc, role) => acc + counts[role], 0);
}

/** Last deal's layout when it still fits the player count, otherwise the server's suggestion. */
function initialCounts(d: MafiaDetailsDto): MafiaRoleCounts | null {
  if (!d.canManage || !d.suggestedCounts) return null;
  const n = d.participants.length;
  if (d.rolesConfig && sumCounts(d.rolesConfig) === n) return { ...d.rolesConfig };
  return { ...d.suggestedCounts };
}

function renderHeader(d: MafiaDetailsDto): string {
  const { event } = d;
  const host = event.host ? santaPersonName(event.host) : '';
  return `
    <h2 class="page-title">🎭 ${escapeHtml(event.title)}</h2>
    <div class="santa-meta">
      <span class="santa-badge santa-badge-${escapeHtml(event.status)}">${escapeHtml(mafiaStatusLabel(event.status))}${event.status === 'dealt' ? ` · партия №${escapeHtml(event.round)}` : ''}</span>
      ${event.starts_at ? `<div>📅 ${escapeHtml(formatDate(event.starts_at))}</div>` : ''}
      ${event.place ? `<div>📍 ${escapeHtml(event.place)}</div>` : ''}
      ${host ? `<div>🎙 Ведущий: ${escapeHtml(host)}</div>` : ''}
      ${event.description ? `<div class="santa-description">${escapeHtml(event.description)}</div>` : ''}
    </div>
  `;
}

function renderPlayerActions(d: MafiaDetailsDto): string {
  const { event } = d;
  const parts: string[] = [];

  if (event.status === 'dealt' && d.myCard) {
    parts.push('<button class="btn btn-primary btn-large" data-action="show-card">🎭 Показать мою карточку</button>');
  }
  if (event.status === 'registration' && !d.isHost) {
    const full = d.participants.length >= event.max_players;
    if (d.joined) {
      parts.push('<button class="btn btn-secondary" data-action="leave">Выйти</button>');
    } else if (full) {
      parts.push('<div class="santa-hint">Мест нет</div>');
    } else {
      parts.push('<button class="btn btn-primary btn-large" data-action="join">✅ Записаться</button>');
    }
  }
  return parts.join('');
}

function renderParticipants(d: MafiaDetailsDto): string {
  const canRemove = d.canManage && (d.event.status === 'registration' || d.event.status === 'closed');
  const showSeats = d.event.status === 'dealt' && d.event.assign_seats;
  const list = showSeats
    ? [...d.participants].sort((a, b) => (a.seat ?? 999) - (b.seat ?? 999))
    : d.participants;

  const rows = list.map((p) => `
    <div class="member-row">
      ${showSeats && p.seat !== null ? `<span class="mafia-seat">№${escapeHtml(p.seat)}</span>` : ''}
      <span class="member-name">${escapeHtml(santaPersonName(p))}</span>
      ${p.username ? `<span class="member-hint">@${escapeHtml(p.username)}</span>` : ''}
      ${canRemove
        ? `<button class="btn-icon" data-action="remove-participant" data-user-id="${escapeHtml(String(p.user_id))}" title="Убрать из вечера">✕</button>`
        : ''}
    </div>
  `).join('');

  return `
    <h3 class="santa-section-title">Игроки (${d.participants.length} / ${d.event.max_players})</h3>
    ${rows || '<div class="empty">Пока никто не записался</div>'}
  `;
}

function renderEditor(d: MafiaDetailsDto, counts: MafiaRoleCounts): string {
  const n = d.participants.length;
  const error = validateCounts(counts, n);
  const rows = MAFIA_ROLE_ORDER.map((role) => `
    <div class="mafia-role-row">
      <span class="mafia-role-name" style="color:${MAFIA_TEAM_COLOR[MAFIA_ROLE_TEAM[role]]}">${escapeHtml(MAFIA_ROLE_NAME[role])}</span>
      <button class="btn-icon" data-action="dec" data-role="${role}" ${counts[role] <= 0 ? 'disabled' : ''}>−</button>
      <span class="mafia-role-count">${counts[role]}</span>
      <button class="btn-icon" data-action="inc" data-role="${role}">+</button>
    </div>
  `).join('');

  return `
    ${rows}
    <div class="${error ? 'mafia-sum-bad' : 'santa-hint'}">Ролей: ${sumCounts(counts)} из ${n}${error ? ` — ${escapeHtml(error)}` : ''}</div>
  `;
}

function renderManagePanel(d: MafiaDetailsDto, counts: MafiaRoleCounts | null): string {
  if (!d.canManage || d.event.status === 'finished') return '';
  const { event } = d;
  const n = d.participants.length;
  const parts: string[] = ['<h3 class="santa-section-title">Управление</h3>'];

  if (counts && n >= MAFIA_MIN_PLAYERS) {
    const ok = validateCounts(counts, n) === null;
    const label = event.status === 'dealt' ? `🎲 Раздать заново — партия №${event.round + 1}` : '🎲 Раздать роли';
    parts.push('<div id="mafia-editor" class="mafia-editor">' + renderEditor(d, counts) + '</div>');
    parts.push(`<button class="btn ${ok ? 'btn-primary' : 'btn-disabled'}" data-action="deal" ${ok ? '' : 'disabled'}>${label}</button>`);
  } else {
    parts.push(`<div class="santa-hint">Для раздачи нужно минимум ${MAFIA_MIN_PLAYERS} игрока</div>`);
  }

  if (event.status === 'registration' && n >= MAFIA_MIN_PLAYERS) {
    parts.push('<button class="btn btn-secondary" data-action="close">🔒 Закрыть запись</button>');
  }
  if (event.status === 'closed' || event.status === 'dealt') {
    parts.push('<button class="btn btn-secondary" data-action="reopen">Открыть запись</button>');
  }
  parts.push('<button class="btn btn-primary" data-action="finish">🏁 Завершить</button>');
  parts.push('<button class="btn btn-danger" data-action="delete">Удалить вечер</button>');

  return `<div class="santa-admin">${parts.join('')}</div>`;
}

function renderLayoutSection(d: MafiaDetailsDto, open: boolean, layout: MafiaLayoutDto | null): string {
  if (!d.isHost || d.event.round === 0 || d.event.status !== 'dealt') return '';

  let body = '';
  if (open && layout) {
    const sorted = [...layout.players].sort((a, b) => d.event.assign_seats
      ? (a.seat ?? 999) - (b.seat ?? 999)
      : MAFIA_ROLE_ORDER.indexOf(a.role ?? 'civilian') - MAFIA_ROLE_ORDER.indexOf(b.role ?? 'civilian'));
    body = sorted.map((p) => {
      const role: MafiaRole | null = p.role;
      const badge = role
        ? `<span class="mafia-badge" style="background:${MAFIA_TEAM_COLOR[MAFIA_ROLE_TEAM[role]]}33;color:${MAFIA_TEAM_COLOR[MAFIA_ROLE_TEAM[role]]}">${escapeHtml(MAFIA_ROLE_NAME[role])}</span>`
        : '';
      return `
        <div class="member-row">
          ${p.seat !== null ? `<span class="mafia-seat">№${escapeHtml(p.seat)}</span>` : ''}
          <span class="member-name">${escapeHtml(santaPersonName(p))}</span>
          ${badge}
        </div>`;
    }).join('');
  }

  return `
    <div class="mafia-layout">
      <button class="btn btn-outline" data-action="toggle-layout">${open ? 'Скрыть раскладку' : 'Показать раскладку'}</button>
      ${body}
    </div>
  `;
}

/**
 * Renders a Mafia evening: status, sign-up, own role card, participants and the host's management panel.
 */
export async function renderMafiaEvent(ctx: MafiaEventCtx, nav: Nav): Promise<void> {
  const { tg, eventId } = ctx;

  hideMainButton(tg);
  setBackButton(tg, () => nav.goMafiaList());
  showLoader();

  const url = `/api/mafia/${encodeURIComponent(String(eventId))}`;

  let details: MafiaDetailsDto;
  try {
    details = await apiFetch<MafiaDetailsDto>(url);
  } catch (err) {
    show(`<div class="error">❌ ${escapeHtml(getErrorMessage(err))}</div>`);
    return;
  }

  let counts = initialCounts(details);
  // The layout stays collapsed on every page load and after every change
  let layoutOpen = false;
  let layout: MafiaLayoutDto | null = null;

  function render(): void {
    show(`
      <div class="page" id="mafia-event-page">
        ${renderHeader(details)}
        ${renderPlayerActions(details)}
        ${renderParticipants(details)}
        ${renderLayoutSection(details, layoutOpen, layout)}
        ${renderManagePanel(details, counts)}
      </div>
    `);
    attachHandlers();
  }

  async function reload(): Promise<void> {
    details = await apiFetch<MafiaDetailsDto>(url);
    counts = initialCounts(details);
    layoutOpen = false;
    layout = null;
    render();
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

  function refreshEditor(): void {
    if (!counts) return;
    const editor = document.getElementById('mafia-editor');
    if (editor) editor.innerHTML = renderEditor(details, counts);
    const dealBtn = document.querySelector<HTMLButtonElement>('[data-action="deal"]');
    if (dealBtn) {
      const ok = validateCounts(counts, details.participants.length) === null;
      dealBtn.disabled = !ok;
      dealBtn.classList.toggle('btn-primary', ok);
      dealBtn.classList.toggle('btn-disabled', !ok);
    }
  }

  function attachHandlers(): void {
    document.getElementById('mafia-event-page')!.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
      if (!btn || btn.disabled) return;

      const action = btn.dataset['action'];

      if (action === 'inc' || action === 'dec') {
        const role = btn.dataset['role'] as MafiaRole;
        if (counts) counts[role] = Math.max(0, counts[role] + (action === 'inc' ? 1 : -1));
        refreshEditor();
        return;
      }

      if (action === 'show-card') {
        if (details.myCard) openMafiaCard(details.myCard);
        return;
      }

      if (action === 'toggle-layout') {
        if (layoutOpen) {
          layoutOpen = false;
          render();
          return;
        }
        btn.disabled = true;
        try {
          layout = await apiFetch<MafiaLayoutDto>(`${url}/layout`);
          layoutOpen = true;
        } catch (err) {
          toast(getErrorMessage(err), true);
        }
        render();
        return;
      }

      if (action === 'join') {
        await run(btn, () => apiFetch(`${url}/join`, { method: 'POST' }), '✅ Вы записаны');
        return;
      }

      if (action === 'leave') {
        if (!window.confirm('Выйти из вечера?')) return;
        await run(btn, () => apiFetch(`${url}/join`, { method: 'DELETE' }), 'Вы вышли');
        return;
      }

      if (action === 'remove-participant') {
        const userId = btn.dataset['userId']!;
        const person = details.participants.find((p) => String(p.user_id) === userId);
        const name = person ? santaPersonName(person) : 'игрока';
        if (!window.confirm(`Убрать ${name} из вечера?`)) return;
        await run(btn, () => apiFetch(`${url}/participants/${encodeURIComponent(userId)}`, { method: 'DELETE' }), 'Игрок убран');
        return;
      }

      if (action === 'deal') {
        const redeal = details.event.status === 'dealt';
        const msg = redeal
          ? `Раздать роли заново? Начнётся партия №${details.event.round + 1}, прежние карточки перестанут действовать.`
          : 'Раздать роли? Каждый игрок получит карточку и сообщение в личку.';
        if (!window.confirm(msg)) return;
        await run(btn, () => apiFetch(`${url}/deal`, { method: 'POST', body: JSON.stringify({ counts }) }), '🎲 Роли розданы');
        return;
      }

      if (action === 'close') {
        await run(btn, () => apiFetch(`${url}/close`, { method: 'POST' }), '🔒 Запись закрыта');
        return;
      }

      if (action === 'reopen') {
        const msg = details.event.status === 'dealt'
          ? 'Открыть запись? Розданные роли будут сброшены.'
          : 'Открыть запись снова?';
        if (!window.confirm(msg)) return;
        await run(btn, () => apiFetch(`${url}/reopen`, { method: 'POST' }), 'Запись открыта');
        return;
      }

      if (action === 'finish') {
        if (!window.confirm('Завершить вечер?')) return;
        await run(btn, () => apiFetch(`${url}/finish`, { method: 'POST' }), '🏁 Вечер завершён');
        return;
      }

      if (action === 'delete') {
        if (!window.confirm('Удалить вечер целиком? Это действие нельзя отменить.')) return;
        btn.disabled = true;
        try {
          await apiFetch(url, { method: 'DELETE' });
          toast('Вечер удалён');
          nav.goMafiaList();
        } catch (err) {
          btn.disabled = false;
          toast(getErrorMessage(err), true);
        }
      }
    });
  }

  render();
}
