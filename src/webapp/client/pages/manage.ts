import { show, setBackButton, hideMainButton, type TelegramWebApp } from '../ui.js';
import type { Nav } from '../types.js';

interface ManageCtx {
  tg: TelegramWebApp;
  isAdmin: boolean;
}

/**
 * Renders the admin "Управление" section: the housekeeping screens that are not
 * tied to a single kind of activity (locations, activity types, members).
 * Non-admins only ever reach it by a stale link, so it says so instead of redirecting.
 */
export function renderManage(ctx: ManageCtx, nav: Nav): void {
  const { tg, isAdmin } = ctx;

  hideMainButton(tg);
  setBackButton(tg, () => nav.goHome());

  if (!isAdmin) {
    show(`
      <div class="page">
        <h2 class="page-title">⚙️ Управление</h2>
        <div class="empty">Доступно только администраторам</div>
      </div>
    `);
    return;
  }

  show(`
    <div class="page">
      <h2 class="page-title">⚙️ Управление</h2>
      <div class="home-actions">
        <button class="btn btn-outline btn-large" data-action="create-location">📍 Добавить площадку</button>
        <button class="btn btn-outline btn-large" data-action="sports">🏅 Виды активности</button>
        <button class="btn btn-outline btn-large" data-action="members">👥 Участники</button>
      </div>
    </div>
  `);

  document.querySelector('.home-actions')!.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!btn) return;

    const action = btn.dataset['action'];
    if (action === 'create-location') nav.goCreateLocation();
    if (action === 'sports')          nav.goSports();
    if (action === 'members')         nav.goMembers();
  });
}
