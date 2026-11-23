import { show, setBackButton, hideMainButton, type TelegramWebApp } from '../ui.js';
import { escapeHtml } from '../utils.js';
import { mafiaCardImageUrl, openMafiaCardPreview } from '../mafiaCard.js';
import {
  MAFIA_CARD_VARIANTS,
  MAFIA_ROLE_DESCRIPTION,
  MAFIA_ROLE_NAME,
  MAFIA_ROLE_ORDER,
  MAFIA_ROLE_TEAM,
  MAFIA_TEAM_COLOR,
  MAFIA_TEAM_NAME,
} from '../mafiaRoles.js';
import type { Nav, MafiaRole } from '../types.js';

interface MafiaDeckCtx {
  tg: TelegramWebApp;
}

function renderTile(role: MafiaRole, variant: number): string {
  return `
    <button class="mafia-deck-tile" type="button"
            data-role="${escapeHtml(role)}" data-variant="${escapeHtml(String(variant))}">
      <img class="mafia-deck-img" src="${escapeHtml(mafiaCardImageUrl(role, variant))}"
           alt="${escapeHtml(MAFIA_ROLE_NAME[role])} №${escapeHtml(String(variant))}" loading="lazy" />
      <span class="mafia-deck-no">№${escapeHtml(String(variant))}</span>
    </button>
  `;
}

function renderRoleSection(role: MafiaRole): string {
  const count = MAFIA_CARD_VARIANTS[role];
  const team = MAFIA_ROLE_TEAM[role];
  const accent = MAFIA_TEAM_COLOR[team];
  const tiles = Array.from({ length: count }, (_, i) => renderTile(role, i + 1)).join('');

  return `
    <section class="mafia-deck-section">
      <h3 class="mafia-deck-role">
        ${escapeHtml(MAFIA_ROLE_NAME[role])}
        <span class="mafia-deck-team" style="color:${accent}">${escapeHtml(MAFIA_TEAM_NAME[team])}</span>
        <span class="mafia-deck-count">${escapeHtml(String(count))}</span>
      </h3>
      <div class="mafia-deck-desc">${escapeHtml(MAFIA_ROLE_DESCRIPTION[role])}</div>
      <div class="mafia-deck-grid">${tiles}</div>
    </section>
  `;
}

/**
 * The whole card collection, grouped by role — a way to look through the artwork
 * without starting an evening. Reads nothing from the server: the deck is static.
 */
export function renderMafiaDeck(ctx: MafiaDeckCtx, nav: Nav): void {
  const { tg } = ctx;

  hideMainButton(tg);
  setBackButton(tg, () => nav.goMafiaList());

  const total = MAFIA_ROLE_ORDER.reduce((sum, role) => sum + MAFIA_CARD_VARIANTS[role], 0);

  show(`
    <div class="page" id="mafia-deck-page">
      <h2 class="page-title">🃏 Колода</h2>
      <div class="mafia-deck-intro">
        Все ${escapeHtml(String(total))} карточек игры. Игрокам с одной ролью раздаются разные
        картинки, пока их хватает. Нажмите на карточку, чтобы открыть её целиком.
      </div>
      ${MAFIA_ROLE_ORDER.map(renderRoleSection).join('')}
    </div>
  `);

  document.getElementById('mafia-deck-page')!.addEventListener('click', (e) => {
    const tile = (e.target as HTMLElement).closest<HTMLElement>('.mafia-deck-tile');
    if (!tile) return;
    openMafiaCardPreview(tile.dataset['role'] as MafiaRole, parseInt(tile.dataset['variant']!, 10));
  });
}
