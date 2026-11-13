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
import { renderCreateLocation } from './pages/createLocation.js';
import { renderMembers } from './pages/members.js';
import { renderSports } from './pages/sports.js';
import { renderSantaList } from './pages/santaList.js';
import { renderSantaCreate } from './pages/santaCreate.js';
import { renderSantaEvent } from './pages/santaEvent.js';
import { escapeHtml, getErrorMessage } from './utils.js';
import type { GameType, Nav, SantaDetailsDto, UserRoleDto } from './types.js';

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
// start_param: "group_42" (home), "santas_42" (Santa list of group 42), "santa_7" (Santa event 7,
// group resolved via the API). Fallback: URL ?group_id=42

const startParam = tg.initDataUnsafe?.start_param ?? '';
const urlParams  = new URLSearchParams(window.location.search);
let groupId      = startParam.startsWith('group_')
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
  goCreateLocation() {
    renderCreateLocation({ tg, groupId }, nav);
  },
  goMembers() {
    renderMembers({ tg, groupId }, nav);
  },
  goSports() {
    renderSports({ tg, groupId }, nav);
  },
  goSantaList() {
    renderSantaList({ tg, groupId, isAdmin: _isAdmin }, nav);
  },
  goSantaEvent(eventId: number) {
    renderSantaEvent({ tg, eventId }, nav);
  },
  goSantaCreate() {
    renderSantaCreate({ tg, groupId }, nav);
  },
};

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  // Where to land once the group (and the admin role) are known
  let openStartPage: () => void = () => nav.goHome();

  if (startParam.startsWith('santas_')) {
    groupId = startParam.replace('santas_', '');
    openStartPage = () => nav.goSantaList();
  } else if (startParam.startsWith('santa_')) {
    const eventId = parseInt(startParam.replace('santa_', ''), 10);
    try {
      const details = await apiFetch<SantaDetailsDto>(`/api/santa/${encodeURIComponent(String(eventId))}`);
      groupId = String(details.event.group_id);
      openStartPage = () => nav.goSantaEvent(eventId);
    } catch (err) {
      show(`<div class="error">❌ ${escapeHtml(getErrorMessage(err))}</div>`);
      return;
    }
  }

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

  openStartPage();
}

init();
