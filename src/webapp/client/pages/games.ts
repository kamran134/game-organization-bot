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
import type { GameDto, Nav } from '../types.js';

interface GamesCtx {
  tg: TelegramWebApp;
  groupId: string;
}

/**
 * Renders the games list page.
 */
export async function renderGamesList(ctx: GamesCtx, nav: Nav): Promise<void> {
  const { tg, groupId } = ctx;

  showLoader();
  setBackButton(tg, nav.goHome);
  hideMainButton(tg);

  if (!groupId) {
    show('<div class="error">❌ group_id не указан</div>');
    return;
  }

  try {
    const games = await apiFetch<GameDto[]>(
      `/api/games?group_id=${encodeURIComponent(groupId)}`,
    );

    if (!games.length) {
      show(`
        <div class="page">
          <h2 class="page-title">📅 Расписание</h2>
          <div class="empty">Пока нет запланированных игр и тренировок.</div>
        </div>
      `);
      return;
    }

    const gameCards = games
      .map((g) => {
        const confirmedCount = (g.participants ?? []).filter(
          (p) => p.participation_status === 'confirmed',
        ).length;
        const isFull       = confirmedCount >= g.max_participants;
        const typeLabel    = g.type === 'training' ? '🏃 Тренировка' : '🎮 Игра';
        const sportLabel   = g.sport
          ? `${escapeHtml(g.sport.emoji)} ${escapeHtml(g.sport.name)}`
          : '';
        const locationLabel = g.location ? escapeHtml(g.location.name) : '';
        const costLabel    = g.cost
          ? `💰 ${escapeHtml(String(g.cost))} ₽`
          : 'Бесплатно';
        const notes = g.notes ? escapeHtml(g.notes) : '';

        return `
          <div class="game-card">
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
            <button
              class="btn ${isFull ? 'btn-disabled' : 'btn-primary'}"
              data-action="register"
              data-game-id="${escapeHtml(String(g.id))}"
              ${isFull ? 'disabled' : ''}
            >${isFull ? 'Нет мест' : 'Записаться'}</button>
          </div>
        `;
      })
      .join('');

    show(`
      <div class="page">
        <h2 class="page-title">📅 Расписание</h2>
        <div class="games-list" id="gamesList">${gameCards}</div>
      </div>
    `);

    document.getElementById('gamesList')!.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
        '[data-action="register"]',
      );
      if (!btn || btn.disabled) return;

      const gameId = btn.dataset['gameId']!;
      btn.disabled = true;
      btn.textContent = '…';

      try {
        await apiFetch(`/api/games/${encodeURIComponent(gameId)}/register`, {
          method: 'POST',
        });
        btn.textContent = '✅ Записан';
        btn.className = 'btn btn-success';
        toast('✅ Вы записаны!');
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Записаться';
        toast(getErrorMessage(err), true);
      }
    });
  } catch (err) {
    show(
      `<div class="error">❌ Ошибка загрузки: ${escapeHtml(getErrorMessage(err))}</div>`,
    );
  }
}
