import { show, showLoader, toast, setBackButton, hideMainButton, type TelegramWebApp } from '../ui.js';
import { apiFetch } from '../api.js';
import { escapeHtml, getErrorMessage, mafiaStatusLabel, santaPersonName, formatDate } from '../utils.js';
import { openMafiaCard } from '../mafiaCard.js';
import {
  MAFIA_MIN_PLAYERS,
  MAFIA_ROLE_NAME,
  MAFIA_ROLE_ORDER,
  mafiaRoleName,
  MAFIA_ROLE_TEAM,
  MAFIA_TEAM_COLOR,
  validateCounts,
} from '../mafiaRoles.js';
import type {
  MafiaDetailsDto,
  MafiaLayoutDto,
  MafiaLogDto,
  MafiaLogEntryDto,
  MafiaLogPhase,
  MafiaLogType,
  MafiaRole,
  MafiaRoleCounts,
  Nav,
} from '../types.js';

/** An open quick-action: waiting for the host to pick a player (or type a note). */
interface LogPicker {
  cycle: number;
  phase: MafiaLogPhase;
  type: MafiaLogType;
}

const LOG_TYPE_ICON: Record<MafiaLogType, string> = {
  kill: '🔪', heal: '💉', check: '🔍', block: '💔', lynch: '🗳', note: '📝',
};
const LOG_TYPE_LABEL: Record<MafiaLogType, string> = {
  kill: 'Убит', heal: 'Вылечен', check: 'Проверен', block: 'Заблокирован', lynch: 'Повешен', note: 'Заметка',
};
const LOG_PHASE_TYPES: Record<MafiaLogPhase, MafiaLogType[]> = {
  night: ['kill', 'heal', 'check', 'block', 'note'],
  day: ['lynch', 'note'],
};
/** Mirror of `LOG_TYPE_ROLES` in src/utils/mafiaLog.ts (the client cannot import server code); null = always available. */
const LOG_TYPE_ROLES: Record<MafiaLogType, MafiaRole[] | null> = {
  kill: ['mafia', 'don', 'maniac'],
  heal: ['doctor'],
  check: ['commissar', 'don'],
  block: ['lover'],
  lynch: null,
  note: null,
};
const LOG_NOTE_MAX = 500;

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

function renderParticipants(d: MafiaDetailsDto, dead: ReadonlySet<number>): string {
  const canRemove = d.canManage && (d.event.status === 'registration' || d.event.status === 'closed');
  const showSeats = d.event.status === 'dealt' && d.event.assign_seats;
  const list = showSeats
    ? [...d.participants].sort((a, b) => (a.seat ?? 999) - (b.seat ?? 999))
    : d.participants;

  const rows = list.map((p) => `
    <div class="member-row${dead.has(p.user_id) ? ' mafia-dead' : ''}">
      ${showSeats && p.seat !== null ? `<span class="mafia-seat">№${escapeHtml(p.seat)}</span>` : ''}
      <span class="member-name">${dead.has(p.user_id) ? '💀 ' : ''}${escapeHtml(santaPersonName(p))}</span>
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

function renderLayoutSection(
  d: MafiaDetailsDto,
  open: boolean,
  layout: MafiaLayoutDto | null,
  dead: ReadonlySet<number>,
): string {
  if (!d.isHost || d.event.round === 0 || d.event.status !== 'dealt') return '';

  let body = '';
  if (open && layout) {
    const sorted = [...layout.players].sort((a, b) => d.event.assign_seats
      ? (a.seat ?? 999) - (b.seat ?? 999)
      : MAFIA_ROLE_ORDER.indexOf(a.role ?? 'civilian') - MAFIA_ROLE_ORDER.indexOf(b.role ?? 'civilian'));
    body = sorted.map((p) => {
      const role: MafiaRole | null = p.role;
      const badge = role
        ? `<span class="mafia-badge" style="background:${MAFIA_TEAM_COLOR[MAFIA_ROLE_TEAM[role]]}33;color:${MAFIA_TEAM_COLOR[MAFIA_ROLE_TEAM[role]]}">${escapeHtml(mafiaRoleName(role, p.gender))}</span>`
        : '';
      const isDead = dead.has(p.user_id);
      return `
        <div class="member-row${isDead ? ' mafia-dead' : ''}">
          ${p.seat !== null ? `<span class="mafia-seat">№${escapeHtml(p.seat)}</span>` : ''}
          <span class="member-name">${isDead ? '💀 ' : ''}${escapeHtml(santaPersonName(p))}</span>
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

function renderLogEntry(entry: MafiaLogEntryDto): string {
  const icon = LOG_TYPE_ICON[entry.type];
  let text: string;
  if (entry.type === 'note') {
    text = escapeHtml(entry.note ?? '');
  } else {
    const t = entry.target;
    const name = t
      ? santaPersonName({ first_name: t.first_name, last_name: t.last_name ?? undefined, username: t.username })
      : '—';
    text = `${escapeHtml(LOG_TYPE_LABEL[entry.type])} <b>${escapeHtml(name)}</b>`;
    if (entry.type === 'check' && entry.target_role) {
      const role = entry.target_role;
      text += ` — <span style="color:${MAFIA_TEAM_COLOR[MAFIA_ROLE_TEAM[role]]}">${escapeHtml(mafiaRoleName(role, t?.gender))}</span>`;
    } else if (entry.note) {
      text += ` — ${escapeHtml(entry.note)}`;
    }
  }
  return `
    <div class="mafia-log-entry">
      <span>${icon}</span>
      <span class="mafia-log-entry-text">${text}</span>
      <button class="btn-icon" data-action="log-delete" data-entry-id="${escapeHtml(String(entry.id))}" title="Удалить запись">✕</button>
    </div>`;
}

/** Client twin of `canActAtNight` in src/utils/mafiaLog.ts. */
function canActAtNight(
  lastNight: Partial<Record<MafiaRole, number | null>>,
  type: MafiaLogType,
  cycle: number,
): boolean {
  const roles = LOG_TYPE_ROLES[type];
  if (roles === null) return true;
  return roles.some((role) => {
    const bound = lastNight[role];
    return bound !== undefined && (bound === null || cycle <= bound);
  });
}

function renderLogPicker(d: MafiaDetailsDto, log: MafiaLogDto, picker: LogPicker): string {
  const title = `${LOG_TYPE_ICON[picker.type]} ${LOG_TYPE_LABEL[picker.type]}`;
  if (picker.type === 'note') {
    return `
      <div class="mafia-log-picker">
        <div class="mafia-log-picker-title">${title}</div>
        <textarea id="mafia-log-note" class="field mafia-log-note" maxlength="${LOG_NOTE_MAX}" placeholder="Текст заметки"></textarea>
        <button class="btn btn-primary" data-action="log-save-note">Сохранить</button>
        <button class="btn btn-secondary" data-action="log-cancel">Отмена</button>
      </div>`;
  }
  const targets = new Set(log.state.alive);
  // A heal is recorded after the kill, so the victim of this very cycle is already dead but still savable.
  const killedNow = new Set<number>();
  if (picker.type === 'heal') {
    for (const e of log.entries) {
      if (e.type === 'kill' && e.cycle === picker.cycle && e.target_user_id != null) {
        killedNow.add(e.target_user_id);
        targets.add(e.target_user_id);
      }
    }
  }
  const buttons = d.participants
    .filter((p) => targets.has(p.user_id))
    .map((p) => `<button class="mafia-log-action" data-action="log-pick" data-user-id="${escapeHtml(String(p.user_id))}">${killedNow.has(p.user_id) ? '🔪 ' : ''}${p.seat !== null && d.event.assign_seats ? `№${escapeHtml(p.seat)} ` : ''}${escapeHtml(santaPersonName(p))}</button>`)
    .join('');
  return `
    <div class="mafia-log-picker">
      <div class="mafia-log-picker-title">${title} — кто?</div>
      <div class="mafia-log-actions">${buttons || '<span class="santa-hint">Живых игроков нет</span>'}</div>
      <button class="btn btn-secondary" data-action="log-cancel">Отмена</button>
    </div>`;
}

const OUTCOME_TITLE: Record<'town' | 'mafia' | 'solo', string> = {
  town: '🏆 Победили мирные',
  mafia: '🏆 Победила мафия',
  solo: '🏆 Победил маньяк',
};

function renderLogSection(
  d: MafiaDetailsDto,
  log: MafiaLogDto | null,
  localCycles: number,
  picker: LogPicker | null,
): string {
  if (!log || !d.isHost || d.event.status !== 'dealt') return '';
  const { counts, outcome } = log.state;
  const maxCycle = log.entries.reduce((acc, e) => Math.max(acc, e.cycle), 1);
  const cycles = Math.max(maxCycle, localCycles);

  const stateParts = [`Живых ${counts.alive}`, `🔴 Мафия ${counts.mafia}`, `🔵 Мирные ${counts.town}`];
  if (counts.solo > 0) stateParts.push(`🟣 Одиночки ${counts.solo}`);
  const outcomeTitle = outcome ? OUTCOME_TITLE[outcome] : null;
  const outcomeBanner = outcomeTitle
    ? `<div class="mafia-log-outcome">
        <div class="mafia-log-outcome-title">${outcomeTitle}</div>
        <div class="santa-hint">Партия №${escapeHtml(String(d.event.round))} закончена. Раздайте роли заново для новой партии или завершите вечер.</div>
      </div>`
    : '';

  const phases: MafiaLogPhase[] = ['night', 'day'];
  const blocks: string[] = [];
  for (let cycle = 1; cycle <= cycles; cycle++) {
    const phaseBlocks = phases.map((phase) => {
      const entries = log.entries.filter((e) => e.cycle === cycle && e.phase === phase);
      const actions = LOG_PHASE_TYPES[phase]
        // A decided game keeps only the note: the host may comment but not continue the game.
        .filter((type) => outcome === null || type === 'note')
        .filter((type) => phase === 'day' || canActAtNight(log.state.rolesLastNight, type, cycle))
        .map((type) =>
        `<button class="mafia-log-action" data-action="log-start" data-cycle="${cycle}" data-phase="${phase}" data-type="${type}">${LOG_TYPE_ICON[type]} ${LOG_TYPE_LABEL[type]}</button>`,
      ).join('');
      const open = picker && picker.cycle === cycle && picker.phase === phase
        ? renderLogPicker(d, log, picker)
        : '';
      return `
        <div class="mafia-log-phase">${phase === 'night' ? '🌙 Ночь' : '☀️ День'} ${cycle}</div>
        <div class="mafia-log-actions">${actions}</div>
        ${open}
        ${entries.map(renderLogEntry).join('')}`;
    }).join('');
    blocks.push(`<div class="mafia-log-cycle">${phaseBlocks}</div>`);
  }

  return `
    <div class="mafia-log">
      <h3 class="santa-section-title">📓 Журнал</h3>
      <div class="mafia-log-state">${stateParts.join(' · ')}</div>
      ${outcomeBanner}
      ${blocks.join('')}
      ${outcome === null ? '<button class="btn btn-outline" data-action="log-add-cycle">+ Круг</button>' : ''}
    </div>`;
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
  // Host log: loaded only for the host of a dealt evening; null means "no panel"
  let log: MafiaLogDto | null = null;
  let logCycles = 1;
  let logPicker: LogPicker | null = null;

  /** Loads the host log; a failure must not break the page, it just renders without the panel. */
  async function loadLog(): Promise<void> {
    logCycles = 1;
    logPicker = null;
    log = null;
    if (!details.isHost || details.event.status !== 'dealt') return;
    try {
      log = await apiFetch<MafiaLogDto>(`${url}/log`);
    } catch (err) {
      toast(getErrorMessage(err), true);
    }
  }

  function render(): void {
    const dead: ReadonlySet<number> = new Set(log?.state.dead ?? []);
    show(`
      <div class="page" id="mafia-event-page">
        ${renderHeader(details)}
        ${renderPlayerActions(details)}
        ${renderParticipants(details, dead)}
        ${renderLayoutSection(details, layoutOpen, layout, dead)}
        ${renderLogSection(details, log, logCycles, logPicker)}
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
    await loadLog();
    render();
  }

  /** Sends a log mutation; the response is already the fresh log, so no full reload is needed. */
  async function mutateLog(btn: HTMLButtonElement, request: () => Promise<MafiaLogDto>): Promise<void> {
    btn.disabled = true;
    try {
      log = await request();
      logPicker = null;
      render();
    } catch (err) {
      btn.disabled = false;
      toast(getErrorMessage(err), true);
    }
  }

  function postLog(btn: HTMLButtonElement, picker: LogPicker, extra: { target_user_id?: number; note?: string }): Promise<void> {
    const body = { cycle: picker.cycle, phase: picker.phase, type: picker.type, ...extra };
    return mutateLog(btn, () => apiFetch<MafiaLogDto>(`${url}/log`, { method: 'POST', body: JSON.stringify(body) }));
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

      if (action === 'log-start') {
        logPicker = {
          cycle: Number(btn.dataset['cycle']),
          phase: btn.dataset['phase'] as MafiaLogPhase,
          type: btn.dataset['type'] as MafiaLogType,
        };
        render();
        return;
      }

      if (action === 'log-cancel') {
        logPicker = null;
        render();
        return;
      }

      if (action === 'log-add-cycle') {
        const maxCycle = (log?.entries ?? []).reduce((acc, en) => Math.max(acc, en.cycle), 1);
        logCycles = Math.max(maxCycle, logCycles) + 1;
        render();
        return;
      }

      if (action === 'log-pick') {
        if (!logPicker) return;
        await postLog(btn, logPicker, { target_user_id: Number(btn.dataset['userId']) });
        return;
      }

      if (action === 'log-save-note') {
        if (!logPicker) return;
        const field = document.getElementById('mafia-log-note') as HTMLTextAreaElement | null;
        const note = (field?.value ?? '').trim();
        if (!note) {
          toast('Введите текст заметки', true);
          return;
        }
        await postLog(btn, logPicker, { note });
        return;
      }

      if (action === 'log-delete') {
        const entryId = btn.dataset['entryId']!;
        await mutateLog(btn, () => apiFetch<MafiaLogDto>(`${url}/log/${encodeURIComponent(entryId)}`, { method: 'DELETE' }));
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

  await loadLog();
  render();
}
