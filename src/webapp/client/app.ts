/**
 * app.ts — Main entry point for the Telegram Mini App.
 *
 * Responsibilities:
 *  - Initialise the Telegram WebApp SDK
 *  - Apply theme CSS variables
 *  - Store initData for authenticated API calls
 *  - Resolve groupId from start_param or URL fallback
 *  - Wire navigation (router) and kick off init()
 *
 * Navigation design: every page function receives a `nav` object so that
 * pages never import each other directly — no circular dependencies.
 */

import { setInitData, apiFetch } from './api.js';
import { show } from './ui.js';
import { renderHome } from './pages/home.js';
import { renderGamesList } from './pages/games.js';
import { renderCreateForm } from './pages/create.js';
import { renderEditGame } from './pages/edit.js';
import type { GameType, Nav, UserRoleDto } from './types.js';

// ─── Telegram SDK ─────────────────────────────────────────────────────────────

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// ─── Theme ────────────────────────────────────────────────────────────────────

const root = document.documentElement;
const theme = tg.themeParams ?? {};
const themeMap: Record<string, string | undefined> = {
  '--tg-bg':        theme.bg_color,
  '--tg-text':      theme.text_color,
  '--tg-hint':      theme.hint_color,
  '--tg-link':      theme.link_color,
  '--tg-btn':       theme.button_color,
  '--tg-btn-text':  theme.button_text_color,
  '--tg-secondary': theme.secondary_bg_color,
};
for (const [prop, val] of Object.entries(themeMap)) {
  if (val) root.style.setProperty(prop, val);
}

// ─── Auth header ──────────────────────────────────────────────────────────────

setInitData(tg.initData);

// ─── Group ID resolution ──────────────────────────────────────────────────────
// Priority: tg.initDataUnsafe.start_param ("group_42") → URL ?group_id=42

const startParam = tg.initDataUnsafe?.start_param ?? '';
const urlParams  = new URLSearchParams(window.location.search);
const groupId    = startParam.startsWith('group_')
  ? startParam.replace('group_', '')
  : (urlParams.get('group_id') ?? '');

// ─── Navigation ───────────────────────────────────────────────────────────────

let _isAdmin = false;

/**
 * Central navigation object passed to all pages.
 * Pages call nav.goXxx() instead of importing each other directly.
 */
const nav: Nav = {
  goHome() {
    renderHome({ tg, isAdmin: _isAdmin }, nav);
  },
  goGamesList() {
    renderGamesList({ tg, groupId, isAdmin: _isAdmin }, nav);
  },
  goCreateForm(type: GameType) {
    renderCreateForm({ tg, groupId, type }, nav);
  },
  goEditGame(gameId: number) {
    renderEditGame({ tg, groupId, gameId }, nav);
  },
};

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  if (!groupId) {
    show('<div class="error">❌ Откройте приложение из чата группы через команду /app</div>');
    return;
  }

  // Resolve admin role — fail gracefully so non-admin users still see the app
  try {
    const role = await apiFetch<UserRoleDto>(
      `/api/user/role?group_id=${encodeURIComponent(groupId)}`,
    );
    _isAdmin = role.isAdmin ?? false;
  } catch {
    _isAdmin = false;
  }

  nav.goHome();
}

init();
