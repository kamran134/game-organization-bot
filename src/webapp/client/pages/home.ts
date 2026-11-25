import { show, hideBackButton, hideMainButton, type TelegramWebApp } from '../ui.js';
import type { Nav } from '../types.js';

interface HomeCtx {
  tg: TelegramWebApp;
  isAdmin: boolean;
}

/**
 * Renders the home screen: a list of sections, one per kind of activity.
 * Creating anything happens inside the matching section, never from here —
 * every section is "a list plus its own create button".
 */
export function renderHome(ctx: HomeCtx, nav: Nav): void {
  const { tg, isAdmin } = ctx;

  hideMainButton(tg);
  hideBackButton(tg);

  const manageSection = isAdmin
    ? '<button class="btn btn-outline btn-large" data-action="manage">⚙️ Управление</button>'
    : '';

  show(`
    <div class="page">
      <h2 class="page-title">📋 Организатор игр</h2>
      <div class="home-actions">
        <button class="btn btn-outline btn-large" data-action="sport">🏐 Спорт</button>
        <button class="btn btn-outline btn-large" data-action="mafia">🎭 Мафия</button>
        <button class="btn btn-outline btn-large" data-action="spy">🕵️ Шпион</button>
        <button class="btn btn-outline btn-large" data-action="santa">🎅 Тайный Санта</button>
        ${manageSection}
        <button class="btn btn-outline btn-large" data-action="profile">👤 Мой профиль</button>
      </div>
    </div>
  `);

  // Bound to the freshly rendered element (not the persistent #content), so listeners
  // never pile up across visits and never fire on other pages.
  document.querySelector('.home-actions')!.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!btn) return;

    const action = btn.dataset['action'];
    if (action === 'sport')   nav.goGamesList();
    if (action === 'mafia')   nav.goMafiaList();
    if (action === 'spy')     nav.goSpyList();
    if (action === 'santa')   nav.goSantaList();
    if (action === 'manage')  nav.goManage();
    if (action === 'profile') nav.goProfile();
  });
}
