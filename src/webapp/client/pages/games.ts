import {
  show,
  showLoader,
  toast,
  setBackButton,
  hideMainButton,
  type TelegramWebApp,
} from '../ui.js';
import { apiFetch } from '../api.js';
import { escapeHtml, formatDate, getErrorMessage } from '../utils.js';
import type { GameDto, ParticipantDto, Nav } from '../types.js';

interface GamesCtx {
  tg: TelegramWebApp;
  groupId: string;
  isAdmin: boolean;
}

function participantName(p: ParticipantDto): string {
  if (p.user) {
    const full = [p.user.first_name, p.user.last_name].filter(Boolean).join(' ');
    return p.user.username ? `@${p.user.username}` : full || '—';
  }
  return p.guest_name || 'Гость';
}

function renderParticipantsList(participants: ParticipantDto[] | undefined): string {
  if (!participants || participants.length === 0) {
    return '<div class="participants-empty">Пока никто не записался</div>';
  }
  const confirmed = participants.filter((p) => p.participation_status === 'confirmed');
  const maybe     = participants.filter((p) => p.participation_status === 'maybe');
  let html = '';
  if (confirmed.length) {
    html += `<div class="participants-group-title">✅ Точно идут:</div>`;
    html += confirmed.map((p, i) =>
      `<div class="participant-row">` +
        `<span class="participant-num">${i + 1}.</span>` +
        `<span class="participant-name">${escapeHtml(participantName(p))}</span>` +
      `</div>`
    ).join('');
  }
  if (maybe.length) {
    html += `<div class="participants-group-title">❓ Не точно:</div>`;
    html += maybe.map((p, i) =>
      `<div class="participant-row">` +
        `<span class="participant-num">${i + 1}.</span>` +
        `<span class="participant-name">${escapeHtml(participantName(p))}</span>` +
      `</div>`
    ).join('');
  }
  return html;
}

function myStatus(
  g: GameDto,
  myTelegramId: number,
): 'confirmed' | 'maybe' | null {
  if (!myTelegramId) return null;
  const me = (g.participants ?? []).find(
    (p) => Number(p.user?.telegram_id) === myTelegramId,
  );
  return me ? (me.participation_status as 'confirmed' | 'maybe') : null;
}

function renderCard(g: GameDto, myTelegramId: number, isAdmin: boolean): string {
  const confirmedCount = (g.participants ?? []).filter(
    (p) => p.participation_status === 'confirmed',
  ).length;
  const isFull        = confirmedCount >= g.max_participants;
  const typeLabel     = g.type === 'training' ? '🏃 Тренировка' : '🎮 Игра';
  const sportLabel    = g.sport
    ? `${escapeHtml(g.sport.emoji)} ${escapeHtml(g.sport.name)}`
    : '';
  const locationLabel = g.location ? escapeHtml(g.location.name) : '';
  const costLabel     = g.cost
    ? `💰 ${escapeHtml(String(g.cost))} ₼`
    : 'Бесплатно';
  const notes  = g.notes ? escapeHtml(g.notes) : '';
  const gid    = escapeHtml(String(g.id));
  const status = myStatus(g, myTelegramId);

  let actionButtons: string;
  if (status === 'confirmed') {
    actionButtons = `
      <div class="game-actions">
        <span class="btn btn-success btn-registered">✅ Вы записаны</span>
        <button class="btn btn-secondary" data-action="maybe" data-game-id="${gid}">❓ Не точно</button>
        <button class="btn btn-danger"    data-action="cancel" data-game-id="${gid}">❌ Отказаться</button>
      </div>`;
  } else if (status === 'maybe') {
    actionButtons = `
      <div class="game-actions">
        <span class="btn btn-maybe btn-registered">❓ Не точно</span>
        <button class="btn btn-primary"   data-action="register" data-game-id="${gid}">✅ Точно иду</button>
        <button class="btn btn-danger"    data-action="cancel"   data-game-id="${gid}">❌ Отказаться</button>
      </div>`;
  } else if (isFull) {
    actionButtons = `
      <div class="game-actions">
        <button class="btn btn-disabled" disabled>Нет мест</button>
      </div>`;
  } else {
    actionButtons = `
      <div class="game-actions">
        <button class="btn btn-primary"   data-action="register" data-game-id="${gid}">✅ Записаться</button>
        <button class="btn btn-secondary" data-action="maybe"    data-game-id="${gid}">❓ Не точно</button>
      </div>`;
  }

  return `
    <div class="game-card" data-game-id="${gid}">
      <div class="game-header">
        <span class="game-type">${typeLabel}</span>
        <span class="game-sport">${sportLabel}</span>
      </div>
      <div class="game-date">📅 ${formatDate(g.game_date)}</div>
      ${locationLabel ? `<div class="game-location">📍 ${locationLabel}</div>` : ''}
      <div class="game-meta">
        <span>👥 ${confirmedCount} / ${escapeHtml(String(g.max_participants))}</span>
        <span>${costLabel}</span>
      </div>
      ${notes ? `<div class="game-notes">${notes}</div>` : ''}
      ${actionButtons}
      <button class="btn btn-participants" data-action="toggle-participants" data-game-id="${gid}">
        👥 Участники (${confirmedCount})
      </button>
      <div class="participants-list hidden" id="participants-${gid}">
        ${renderParticipantsList(g.participants)}
      </div>
      ${isAdmin ? `
      <div class="game-admin-actions">
        <button class="btn btn-secondary" data-action="edit-game"   data-game-id="${gid}">✏️ Редактировать</button>
        <button class="btn btn-danger"    data-action="delete-game" data-game-id="${gid}">🗑 Удалить</button>
      </div>` : ''}
    </div>`;
}

/**
 * Renders the games list page.
 */
export async function renderGamesList(ctx: GamesCtx, nav: Nav): Promise<void> {
  const { tg, groupId, isAdmin } = ctx;
  const myTelegramId = tg.initDataUnsafe?.user?.id ?? 0;

  showLoader();
  setBackButton(tg, nav.goHome);
  hideMainButton(tg);

  if (!groupId) {
    show('<div class="error">❌ group_id не указан</div>');
    return;
  }

  let games: GameDto[] = [];

  function renderList(): void {
    if (!games.length) {
      show(`
        <div class="page">
          <h2 class="page-title">📅 Расписание</h2>
          <div class="empty">Пока нет запланированных игр и тренировок.</div>
        </div>
      `);
      return;
    }

    const gameCards = games.map((g) => renderCard(g, myTelegramId, isAdmin)).join('');
    show(`
      <div class="page">
        <h2 class="page-title">📅 Расписание</h2>
        <div class="games-list" id="gamesList">${gameCards}</div>
      </div>
    `);

    document.getElementById('gamesList')!.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
      if (!btn || btn.disabled) return;

      const action = btn.dataset['action']!;
      const gameId = btn.dataset['gameId']!;
      const origText = btn.textContent;
      
      // Toggle participants list — no API call needed
      if (action === 'toggle-participants') {
        const panel = document.getElementById(`participants-${gameId}`)!;
        const nowHidden = panel.classList.toggle('hidden');
        const count = btn.textContent!.match(/\((\d+)\)/)?.[1] ?? '';
        btn.textContent = nowHidden ? `👥 Участники (${count})` : `👥 Участники (${count}) ▲`;
        return;
      }

      btn.disabled = true;
      btn.textContent = '…';

      try {
        if (action === 'register') {
          await apiFetch(`/api/games/${encodeURIComponent(gameId)}/register`, {
            method: 'POST',
            body: JSON.stringify({ status: 'confirmed' }),
          });
          toast('✅ Вы записаны!');
        } else if (action === 'maybe') {
          await apiFetch(`/api/games/${encodeURIComponent(gameId)}/register`, {
            method: 'POST',
            body: JSON.stringify({ status: 'maybe' }),
          });
          toast('❓ Отмечено "Не точно"');
        } else if (action === 'cancel') {
          await apiFetch(`/api/games/${encodeURIComponent(gameId)}/register`, {
            method: 'DELETE',
          });
          toast('❌ Вы отказались от игры');
        } else if (action === 'edit-game') {
          nav.goEditGame(parseInt(gameId));
          return;
        } else if (action === 'delete-game') {
          if (!window.confirm('Удалить эту игру?')) {
            btn.disabled = false;
            btn.textContent = origText;
            return;
          }
          await apiFetch(`/api/games/${encodeURIComponent(gameId)}`, { method: 'DELETE' });
          toast('🗑 Игра удалена');
        }

        // Reload data and re-render
        games = await apiFetch<GameDto[]>(
          `/api/games?group_id=${encodeURIComponent(groupId)}`,
        );
        renderList();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = origText;
        toast(getErrorMessage(err), true);
      }
    });
  }

  try {
    games = await apiFetch<GameDto[]>(
      `/api/games?group_id=${encodeURIComponent(groupId)}`,
    );
    renderList();
  } catch (err) {
    show(
      `<div class="error">❌ Ошибка загрузки: ${escapeHtml(getErrorMessage(err))}</div>`,
    );
  }
}
