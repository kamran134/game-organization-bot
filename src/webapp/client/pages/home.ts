import { show, hideBackButton, hideMainButton, type TelegramWebApp } from '../ui.js';
import type { Nav } from '../types.js';

interface HomeCtx {
  tg: TelegramWebApp;
  isAdmin: boolean;
}

/**
 * Renders the home screen.
 */
export function renderHome(ctx: HomeCtx, nav: Nav): void {
  const { tg, isAdmin } = ctx;

  hideMainButton(tg);
  hideBackButton(tg);

  const adminButtons = isAdmin
    ? `
      <button class="btn btn-primary btn-large" data-action="create-game">🎮 Создать игру</button>
      <button class="btn btn-secondary btn-large" data-action="create-training">🏃 Создать тренировку</button>
    `
    : '';

  show(`
    <div class="page">
      <h2 class="page-title">📋 Организатор игр</h2>
      <div class="home-actions">
        ${adminButtons}
        <button class="btn btn-outline btn-large" data-action="list-games">📅 Расписание</button>
      </div>
    </div>
  `);

  document.getElementById('content')!.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!btn) return;

    const action = btn.dataset['action'];
    if (action === 'create-game')     nav.goCreateForm('game');
    if (action === 'create-training') nav.goCreateForm('training');
    if (action === 'list-games')      nav.goGamesList();
  });
}
