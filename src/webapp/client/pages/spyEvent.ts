import { show, showLoader, toast, setBackButton, hideMainButton, type TelegramWebApp } from '../ui.js';
import { apiFetch, ApiError } from '../api.js';
import { escapeHtml, spyStatusLabel, santaPersonName, formatDate } from '../utils.js';
import { getSpyErrorMessage, loadSpyMeta, readSpyForm, renderSpyFormFields, spyFormValuesOf } from '../spyForm.js';
import type {
  Nav,
  SpyCardDto,
  SpyDetailsDto,
  SpyMetaDto,
  SpyOutcome,
  SpyOutcomeReason,
  SpyRole,
  SpyRoundDto,
} from '../types.js';

interface SpyEventCtx {
  tg: TelegramWebApp;
  eventId: number;
}

const POLL_INTERVAL_MS = 5000;

const ROLE_NAME: Record<SpyRole, string> = {
  civilian: 'Мирный',
  spy: 'Шпион',
  double_agent: 'Двойной агент',
  mr_white: 'Мистер Белый',
};

/** Identifies the screen that is current: a timer of a screen that has been left stops itself. */
let currentScreen = 0;

function nameOf(d: SpyDetailsDto, userId: number | null): string {
  if (userId === null) return '—';
  const person = d.participants.find((p) => p.user_id === userId) ?? d.round?.players.find((p) => p.user_id === userId);
  return person ? santaPersonName(person) : '—';
}

function isRunning(round: SpyRoundDto | null): round is SpyRoundDto {
  return round !== null && round.status !== 'finished';
}

function renderHeader(d: SpyDetailsDto): string {
  const { event } = d;
  const host = event.host ? santaPersonName(event.host) : '';
  return `
    <h2 class="page-title">🕵️ ${escapeHtml(event.title)}</h2>
    <div class="santa-meta">
      <span class="santa-badge santa-badge-${escapeHtml(event.status)}">${escapeHtml(spyStatusLabel(event.status))}${event.round > 0 && event.status === 'in_progress' ? ` · партия №${escapeHtml(event.round)}` : ''}</span>
      ${event.starts_at ? `<div>📅 ${escapeHtml(formatDate(event.starts_at))}</div>` : ''}
      ${event.place ? `<div>📍 ${escapeHtml(event.place)}</div>` : ''}
      ${host ? `<div>🎙 Организатор: ${escapeHtml(host)}</div>` : ''}
      ${event.description ? `<div class="santa-description">${escapeHtml(event.description)}</div>` : ''}
    </div>
  `;
}

function renderJoinActions(d: SpyDetailsDto): string {
  const { event } = d;
  if (event.status !== 'registration') return '';

  const activeCount = d.participants.length;
  if (d.joined) return '<button class="btn btn-secondary" data-action="leave">Выйти</button>';
  if (activeCount >= event.max_players) return '<div class="santa-hint">Мест нет</div>';
  return '<button class="btn btn-primary btn-large" data-action="join">✅ Записаться</button>';
}

/** The caller's own card. The location stays hidden until the player holds the plate down. */
function renderCard(card: SpyCardDto): string {
  let title: string;
  let body: string;

  switch (card.role) {
    case 'spy':
      title = '🕵️ Вы шпион';
      body = `
        <div class="spy-card-text">Вы не знаете локацию. Задавайте вопросы, отвечайте расплывчато и пытайтесь понять, где все находятся.</div>
        ${card.hint ? `<div class="spy-card-hint">💡 Подсказка: локация из пакета «${escapeHtml(card.hint)}»</div>` : ''}`;
      break;
    case 'mr_white':
      // Mr. White believes they are a civilian: the real role is never named on the card
      title = '🙂 Вы мирный';
      body = '<div class="spy-card-text">Вы не помните, где вы. Слушайте других и отвечайте так, чтобы не выдать себя.</div>';
      break;
    case 'double_agent':
      title = '🎭 Вы двойной агент';
      body = `<div class="spy-card-text">Вы знаете локацию, но играете за шпионов: помогайте им, не выдавая себя.</div>${renderSecretLocation(card.location)}`;
      break;
    default:
      title = '🙂 Вы мирный';
      body = `<div class="spy-card-text">Вы знаете локацию. Докажите это, не называя её прямо.</div>${renderSecretLocation(card.location)}`;
  }

  return `
    <div class="spy-card">
      <div class="spy-card-title">${title}</div>
      ${body}
    </div>
  `;
}

function renderSecretLocation(location: string | null): string {
  if (!location) return '';
  return `
    <div class="spy-hold" data-hold>
      <span class="spy-hold-label">👁 Держите, чтобы посмотреть локацию</span>
      <span class="spy-hold-value hidden">📍 ${escapeHtml(location)}</span>
    </div>`;
}

function renderTurn(d: SpyDetailsDto, round: SpyRoundDto): string {
  const card = d.myCard;
  const mine = card?.is_my_turn === true;
  const deadline = round.deadline
    ? `<div class="spy-deadline">⏱ <span data-deadline="${escapeHtml(round.deadline)}"></span></div>`
    : '';

  let action = '';
  if (mine) {
    action = '<button class="btn btn-primary btn-large" data-action="next">✅ Я сказал</button>';
  } else if (d.canManage) {
    action = '<button class="btn btn-secondary" data-action="next-force">⏭ Передать ход за игрока</button>';
  }

  return `
    <div class="spy-turn">
      <div class="santa-card-label">Круг ${escapeHtml(round.cycle)}</div>
      <div class="spy-turn-name">${mine ? '🎤 Ваш ход' : `🎤 Говорит: ${escapeHtml(nameOf(d, round.current_user_id))}`}</div>
      ${deadline}
      ${action}
    </div>
  `;
}

function renderVoting(d: SpyDetailsDto, round: SpyRoundDto, myId: number): string {
  const state = d.votingState;
  if (!state) return '';

  const countOf = new Map(state.counts.map((c) => [c.user_id, c.votes]));
  const alive = round.players.filter((p) => !p.is_eliminated).map((p) => p.user_id);
  const candidates = (state.candidate_ids ?? alive).filter((id) => id !== myId);
  const iVote = d.myCard !== null && alive.includes(myId);
  const voted = state.voter_ids.map((id) => escapeHtml(nameOf(d, id))).join(', ');

  const buttons = iVote
    ? candidates.map((id) => `
        <button class="mafia-log-action" data-action="vote" data-user-id="${escapeHtml(String(id))}">
          ${escapeHtml(nameOf(d, id))}${countOf.has(id) ? ` · ${escapeHtml(countOf.get(id))}` : ''}
        </button>`).join('')
    : '';
  const score = iVote
    ? ''
    : candidates.map((id) => `<div>${escapeHtml(nameOf(d, id))}: ${escapeHtml(countOf.get(id) ?? 0)}</div>`).join('');

  return `
    <div class="spy-voting">
      <h3 class="santa-section-title">🗳 Голосование</h3>
      ${state.ballot > 1 ? '<div class="spy-banner">⚖️ Ничья! Второй тур: голосуем только за лидеров.</div>' : ''}
      ${iVote ? '<div class="santa-hint">Кто шпион? Выберите игрока.</div>' : '<div class="santa-hint">Вы наблюдаете за голосованием.</div>'}
      <div class="mafia-log-actions">${buttons}</div>
      ${score}
      <div class="santa-hint">Проголосовали (${state.voter_ids.length}): ${voted || 'пока никто'}</div>
    </div>
  `;
}

function renderGuess(d: SpyDetailsDto, round: SpyRoundDto, myId: number): string {
  if (d.myCard?.role !== 'spy') return '';
  if (round.players.some((p) => p.user_id === myId && p.is_eliminated)) return '';

  return `
    <div class="spy-guess">
      <h3 class="santa-section-title">🎯 Угадать локацию</h3>
      <input type="text" id="spy-guess-input" class="input" maxlength="200" placeholder="Где мы находимся?" autocomplete="off" />
      <button class="btn btn-primary" data-action="guess">Угадать локацию</button>
      <div class="santa-hint">Ошибка стоит партии. Пробуйте, только когда уверены.</div>
    </div>
  `;
}

const OUTCOME_TITLE: Record<SpyOutcome, string> = {
  town: '🙂 Победили мирные',
  spies: '🕵️ Победили шпионы',
  aborted: '⛔ Партия прервана',
};

const OUTCOME_REASON: Record<SpyOutcomeReason, string> = {
  vote_hit: 'Шпиона вычислили голосованием.',
  vote_miss: 'Голосование указало не на шпиона.',
  guess_correct: 'Шпион угадал локацию.',
  guess_wrong: 'Шпион назвал не ту локацию.',
  manual: 'Партию прервал организатор.',
};

function renderReveal(d: SpyDetailsDto, round: SpyRoundDto): string {
  const rows = round.players.map((p) => `
    <div class="member-row">
      <span class="member-name">${escapeHtml(santaPersonName(p))}</span>
      <span class="mafia-badge spy-role-${escapeHtml(p.role ?? 'civilian')}">${escapeHtml(ROLE_NAME[p.role ?? 'civilian'])}</span>
    </div>`).join('');
  const guessLine = round.guess
    ? `<div class="santa-hint">Ответ шпиона${round.guessed_by !== null && round.guessed_by !== undefined ? ` (${escapeHtml(nameOf(d, round.guessed_by))})` : ''}: «${escapeHtml(round.guess)}»</div>`
    : '';

  return `
    <div class="spy-reveal">
      <h3 class="santa-section-title">Партия №${escapeHtml(round.number)} завершена</h3>
      <div class="spy-outcome">${escapeHtml(round.outcome ? OUTCOME_TITLE[round.outcome] : 'Партия завершена')}</div>
      ${round.outcome_reason ? `<div class="santa-hint">${escapeHtml(OUTCOME_REASON[round.outcome_reason])}</div>` : ''}
      ${round.location_name ? `<div class="spy-location">📍 Локация: <b>${escapeHtml(round.location_name)}</b></div>` : ''}
      ${guessLine}
      ${rows}
    </div>
  `;
}

function renderParticipants(d: SpyDetailsDto): string {
  const round = isRunning(d.round) ? d.round : null;
  const eliminated = new Set(round?.players.filter((p) => p.is_eliminated).map((p) => p.user_id) ?? []);
  const editable = d.canManage && (d.event.status === 'registration' || d.event.status === 'closed');
  const canToggle = d.canManage && d.event.status !== 'finished' && round === null;
  // Manual elimination is the manager's call while a round is on, and only for the players dealt into it
  const playing = new Set(round?.players.map((p) => p.user_id) ?? []);
  const canEliminate = d.canManage && d.event.status === 'in_progress' && round !== null;

  const rows = d.participants.map((p) => `
    <div class="member-row${!p.is_active || eliminated.has(p.user_id) ? ' mafia-dead' : ''}">
      <span class="member-name">${eliminated.has(p.user_id) ? '💀 ' : ''}${escapeHtml(santaPersonName(p))}${p.is_active ? '' : ' · не играет'}</span>
      ${p.username ? `<span class="member-hint">@${escapeHtml(p.username)}</span>` : ''}
      ${canToggle
        ? `<button class="btn-icon" data-action="toggle-active" data-user-id="${escapeHtml(String(p.user_id))}" data-active="${p.is_active ? '1' : '0'}" title="${p.is_active ? 'Исключить из следующей партии' : 'Вернуть в игру'}">${p.is_active ? '💤' : '▶️'}</button>`
        : ''}
      ${canEliminate && playing.has(p.user_id)
        ? `<button class="mafia-log-action" data-action="eliminate" data-user-id="${escapeHtml(String(p.user_id))}" data-eliminated="${eliminated.has(p.user_id) ? '1' : '0'}">${eliminated.has(p.user_id) ? 'Вернуть в партию' : 'Вывести из партии'}</button>`
        : ''}
      ${editable
        ? `<button class="btn-icon" data-action="remove-participant" data-user-id="${escapeHtml(String(p.user_id))}" title="Убрать из вечера">✕</button>`
        : ''}
    </div>
  `).join('');

  return `
    <h3 class="santa-section-title">Игроки (${d.participants.length} / ${d.event.max_players})</h3>
    ${rows || '<div class="empty">Пока никто не записался</div>'}
  `;
}

/** What the manage panel needs from GET /api/spy/meta; `error` is set when the request failed. */
interface SpyMetaState {
  meta: SpyMetaDto | null;
  error: string | null;
}

function renderManagePanel(d: SpyDetailsDto, settingsOpen: boolean, metaState: SpyMetaState): string {
  if (!d.canManage || d.event.status === 'finished') return '';
  const { event } = d;
  const round = d.round;
  const activeCount = d.participants.filter((p) => p.is_active).length;
  const parts: string[] = ['<h3 class="santa-section-title">Управление</h3>'];

  const roundOpen = isRunning(round);
  if (!roundOpen) {
    const minPlayers = metaState.meta?.limits.min_players ?? null;
    // Without the limits the server decides: it refuses a round with too few players
    if (minPlayers === null || activeCount >= minPlayers) {
      parts.push(`<button class="btn btn-primary" data-action="start-round">${event.round === 0 ? '▶️ Начать партию' : `🎲 Ещё партия (№${event.round + 1})`}</button>`);
    } else {
      parts.push(`<div class="santa-hint">Для партии нужно минимум ${minPlayers} активных игрока</div>`);
    }
  } else {
    if (round.status === 'in_progress') parts.push('<button class="btn btn-primary" data-action="open-voting">🗳 Голосование</button>');
    parts.push('<button class="btn btn-secondary" data-action="abort-round">⛔ Прервать партию</button>');
  }

  if (event.status === 'registration') parts.push('<button class="btn btn-secondary" data-action="close">🔒 Закрыть набор</button>');
  if (event.status === 'closed') parts.push('<button class="btn btn-secondary" data-action="reopen">Открыть набор</button>');

  if (event.status === 'registration' || event.status === 'closed') {
    parts.push(`<button class="btn btn-outline" data-action="toggle-settings">${settingsOpen ? 'Скрыть настройки' : '⚙️ Настройки'}</button>`);
    if (settingsOpen && metaState.meta) {
      parts.push(`
        <form id="spySettingsForm" class="form">
          ${renderSpyFormFields(spyFormValuesOf(event), metaState.meta, d.suggestedSpyCount)}
          <button type="submit" class="btn btn-primary">Сохранить</button>
        </form>`);
    } else if (settingsOpen) {
      parts.push(`
        <div class="error">❌ ${escapeHtml(metaState.error ?? 'Не удалось загрузить настройки')}</div>
        <button class="btn btn-secondary" data-action="reload-meta">Повторить</button>`);
    }
  }

  parts.push('<button class="btn btn-primary" data-action="finish">🏁 Завершить вечер</button>');
  parts.push('<button class="btn btn-danger" data-action="delete">Удалить вечер</button>');

  return `<div class="santa-admin">${parts.join('')}</div>`;
}

/** Formats the time left until `deadlineIso`; null once it has passed. */
function timeLeft(deadlineIso: string): string | null {
  const ms = new Date(deadlineIso).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return null;
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function tickDeadlines(): void {
  document.querySelectorAll<HTMLElement>('[data-deadline]').forEach((el) => {
    el.textContent = timeLeft(el.dataset['deadline']!) ?? 'время вышло';
  });
}

/**
 * Renders a Spy evening: the roster, the caller's own role card (location hidden until held), the
 * turn, the vote, the spy's guess, the reveal of a finished round and the manager's controls.
 * The screen refreshes itself while the evening is on, since the other players move the game.
 */
export async function renderSpyEvent(ctx: SpyEventCtx, nav: Nav): Promise<void> {
  const { tg, eventId } = ctx;
  const screen = ++currentScreen;

  hideMainButton(tg);
  setBackButton(tg, () => nav.goSpyList());
  showLoader();

  const url = `/api/spy/${encodeURIComponent(String(eventId))}`;

  let details: SpyDetailsDto;
  try {
    details = await apiFetch<SpyDetailsDto>(url);
  } catch (err) {
    show(`<div class="error">❌ ${escapeHtml(getSpyErrorMessage(err))}</div>`);
    return;
  }

  const myId = details.me.userId;

  // Packs and limits only matter for the settings panel and the start hint: a failure must not block the screen
  const metaState: SpyMetaState = { meta: null, error: null };
  async function loadMeta(): Promise<void> {
    try {
      metaState.meta = await loadSpyMeta();
      metaState.error = null;
    } catch (err) {
      metaState.error = getSpyErrorMessage(err);
    }
  }
  await loadMeta();

  let settingsOpen = false;
  let holding = false;

  const alive = (): boolean => screen === currentScreen && document.getElementById('spy-event-page') !== null;

  function render(): void {
    const round = details.round;
    const running = isRunning(round);
    const inGame = details.event.status === 'in_progress';

    const cardBlock = inGame && details.myCard && running ? renderCard(details.myCard) : '';
    const turnBlock = inGame && round && round.status === 'in_progress' ? renderTurn(details, round) : '';
    const voteBlock = inGame && round && round.status === 'voting' ? renderVoting(details, round, myId) : '';
    const guessBlock = inGame && round && running ? renderGuess(details, round, myId) : '';
    const revealBlock = inGame && round && round.status === 'finished' ? renderReveal(details, round) : '';

    show(`
      <div class="page" id="spy-event-page">
        ${renderHeader(details)}
        ${renderJoinActions(details)}
        ${cardBlock}
        ${turnBlock}
        ${voteBlock}
        ${guessBlock}
        ${revealBlock}
        ${renderParticipants(details)}
        <div class="spy-links">
          <button class="btn btn-outline" data-action="go-locations">📍 Локации</button>
          <button class="btn btn-outline" data-action="go-stats">📊 Статистика</button>
        </div>
        ${renderManagePanel(details, settingsOpen, metaState)}
      </div>
    `);
    attachHandlers();
    tickDeadlines();
  }

  async function reload(): Promise<void> {
    details = await apiFetch<SpyDetailsDto>(url);
    render();
  }

  /** Runs a mutation with the button disabled; on success shows the toast and refreshes the page. */
  async function run(btn: HTMLButtonElement, request: () => Promise<unknown>, successMsg: string | null): Promise<void> {
    btn.disabled = true;
    try {
      await request();
      if (successMsg) toast(successMsg);
      await reload();
    } catch (err) {
      btn.disabled = false;
      toast(getSpyErrorMessage(err), true);
    }
  }

  const post = (path: string, body?: unknown): Promise<unknown> =>
    apiFetch(`${url}${path}`, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

  function attachHold(): void {
    const plate = document.querySelector<HTMLElement>('[data-hold]');
    if (!plate) return;
    const label = plate.querySelector<HTMLElement>('.spy-hold-label')!;
    const value = plate.querySelector<HTMLElement>('.spy-hold-value')!;

    const reveal = (e: Event): void => {
      e.preventDefault();
      holding = true;
      label.classList.add('hidden');
      value.classList.remove('hidden');
    };
    const conceal = (): void => {
      holding = false;
      label.classList.remove('hidden');
      value.classList.add('hidden');
    };

    plate.addEventListener('mousedown', reveal);
    plate.addEventListener('touchstart', reveal, { passive: false });
    for (const type of ['mouseup', 'mouseleave', 'touchend', 'touchcancel']) plate.addEventListener(type, conceal);
    plate.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function attachHandlers(): void {
    attachHold();

    const settingsForm = document.getElementById('spySettingsForm') as HTMLFormElement | null;
    settingsForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const parsed = readSpyForm(settingsForm, metaState.meta!.limits);
      if (!parsed.ok) {
        toast(parsed.error, true);
        return;
      }
      const submit = settingsForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      submit.disabled = true;
      try {
        await apiFetch(url, { method: 'PATCH', body: JSON.stringify(parsed.body) });
        settingsOpen = false;
        toast('✅ Настройки сохранены');
        await reload();
      } catch (err) {
        submit.disabled = false;
        toast(getSpyErrorMessage(err), true);
      }
    });

    document.getElementById('spy-event-page')!.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
      if (!btn || btn.disabled) return;

      const action = btn.dataset['action'];
      const userId = btn.dataset['userId'];

      switch (action) {
        case 'go-locations': nav.goSpyLocations(); return;
        case 'go-stats': nav.goSpyStats(); return;

        case 'toggle-settings':
          settingsOpen = !settingsOpen;
          render();
          return;

        case 'reload-meta':
          btn.disabled = true;
          await loadMeta();
          render();
          return;

        case 'join':
          await run(btn, () => post('/join'), '✅ Вы записаны');
          return;

        case 'leave':
          if (!window.confirm('Выйти из вечера?')) return;
          await run(btn, async () => {
            try {
              await apiFetch(`${url}/join`, { method: 'DELETE' });
            } catch (err) {
              // The server refuses to leave once registration is over; the raw message is English
              if (err instanceof ApiError && err.status === 409 && details.event.status !== 'registration') {
                throw new Error('Выйти можно только пока идёт запись');
              }
              throw err;
            }
          }, 'Вы вышли');
          return;

        case 'remove-participant': {
          const person = details.participants.find((p) => String(p.user_id) === userId);
          if (!window.confirm(`Убрать ${person ? santaPersonName(person) : 'игрока'} из вечера?`)) return;
          await run(btn, () => apiFetch(`${url}/participants/${encodeURIComponent(userId!)}`, { method: 'DELETE' }), 'Игрок убран');
          return;
        }

        case 'toggle-active': {
          const next = btn.dataset['active'] !== '1';
          await run(
            btn,
            () => apiFetch(`${url}/participants/${encodeURIComponent(userId!)}`, { method: 'PATCH', body: JSON.stringify({ is_active: next }) }),
            null,
          );
          return;
        }

        case 'eliminate': {
          const person = details.participants.find((p) => String(p.user_id) === userId);
          const name = person ? santaPersonName(person) : 'игрока';
          const eliminate = btn.dataset['eliminated'] !== '1';
          const question = eliminate
            ? `Вывести ${name} из партии? Если шпионов не останется, победят мирные.`
            : `Вернуть ${name} в партию?`;
          if (!window.confirm(question)) return;
          btn.disabled = true;
          try {
            const res = await apiFetch<{ finished: boolean }>(`${url}/rounds/current/eliminate`, {
              method: 'POST',
              body: JSON.stringify({ user_id: Number(userId), eliminated: eliminate }),
            });
            // A finished round shows its reveal on the reloaded screen
            if (res.finished) toast('🏁 Партия завершена');
            await reload();
          } catch (err) {
            btn.disabled = false;
            toast(getSpyErrorMessage(err), true);
          }
          return;
        }

        case 'next':
          await run(btn, () => post('/rounds/current/next', {}), null);
          return;

        case 'next-force':
          if (!window.confirm('Передать ход следующему игроку?')) return;
          await run(btn, () => post('/rounds/current/next', { force: true }), null);
          return;

        case 'vote':
          await run(btn, () => post('/rounds/current/vote', { target_id: Number(userId) }), '🗳 Голос принят');
          return;

        case 'guess': {
          const input = document.getElementById('spy-guess-input') as HTMLInputElement;
          const guess = input.value.trim();
          if (!guess) {
            toast('Введите название локации', true);
            return;
          }
          btn.disabled = true;
          try {
            const res = await apiFetch<{ result: string }>(`${url}/rounds/current/guess`, {
              method: 'POST',
              body: JSON.stringify({ guess }),
            });
            if (res.result === 'close') {
              // The round goes on: keep the screen and the typed text
              btn.disabled = false;
              toast('Почти! Попробуйте назвать точнее');
              return;
            }
            await reload();
          } catch (err) {
            btn.disabled = false;
            toast(getSpyErrorMessage(err), true);
          }
          return;
        }

        case 'start-round': {
          const again = details.event.round > 0;
          const msg = again
            ? `Начать партию №${details.event.round + 1}? Роли раздадутся заново.`
            : 'Начать партию? Каждый игрок получит роль и сообщение в личку.';
          if (!window.confirm(msg)) return;
          await run(btn, () => post('/rounds'), '🎲 Партия началась');
          return;
        }

        case 'open-voting':
          await run(btn, () => post('/rounds/current/voting'), '🗳 Голосование открыто');
          return;

        case 'abort-round':
          if (!window.confirm('Прервать партию без результата?')) return;
          await run(btn, () => post('/rounds/current/abort'), 'Партия прервана');
          return;

        case 'close':
          await run(btn, () => post('/close'), '🔒 Набор закрыт');
          return;

        case 'reopen':
          await run(btn, () => post('/reopen'), 'Набор открыт');
          return;

        case 'finish':
          if (!window.confirm('Завершить вечер?')) return;
          await run(btn, () => post('/finish'), '🏁 Вечер завершён');
          return;

        case 'delete':
          if (!window.confirm('Удалить вечер целиком? Это действие нельзя отменить.')) return;
          btn.disabled = true;
          try {
            await apiFetch(url, { method: 'DELETE' });
            toast('Вечер удалён');
            nav.goSpyList();
          } catch (err) {
            btn.disabled = false;
            toast(getSpyErrorMessage(err), true);
          }
          return;
      }
    });
  }

  /** True while the user is in the middle of something a refresh would wipe. */
  function busy(): boolean {
    const guess = document.getElementById('spy-guess-input') as HTMLInputElement | null;
    const typing = guess !== null && (guess === document.activeElement || guess.value !== '');
    return holding || typing || settingsOpen;
  }

  async function poll(): Promise<void> {
    if (!alive()) {
      clearInterval(pollTimer);
      clearInterval(tickTimer);
      return;
    }
    if (busy()) return;
    try {
      const fresh = await apiFetch<SpyDetailsDto>(url);
      if (!alive() || busy()) return;
      if (JSON.stringify(fresh) !== JSON.stringify(details)) {
        details = fresh;
        render();
      }
    } catch (err) {
      // A transient failure just waits for the next tick; a gone or forbidden evening ends the screen
      if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
        clearInterval(pollTimer);
        clearInterval(tickTimer);
        show(`<div class="error">❌ ${escapeHtml(getSpyErrorMessage(err))}</div>`);
      }
    }
  }

  render();
  const pollTimer = setInterval(() => { void poll(); }, POLL_INTERVAL_MS);
  const tickTimer = setInterval(() => { if (alive()) tickDeadlines(); }, 1000);
}
