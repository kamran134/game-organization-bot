import { escapeHtml } from './utils.js';
import {
  MAFIA_ROLE_DESCRIPTION,
  MAFIA_ROLE_TEAM,
  MAFIA_TEAM_COLOR,
  MAFIA_TEAM_NAME,
  mafiaRoleName,
} from './mafiaRoles.js';
import type { Gender, MafiaCardDto, MafiaRole } from './types.js';

/** Path of a role's card art; the deck grid and the full-screen card share it. */
export function mafiaCardImageUrl(role: MafiaRole, variant: number): string {
  return `/img/mafia/${encodeURIComponent(role)}-${encodeURIComponent(String(variant))}.webp`;
}

interface FaceOptions {
  /** Small caps line above the role name — the round in a game, the card number in the deck. */
  kicker: string;
  seat?: number | null;
  teammates?: MafiaCardDto['teammates'];
  /** Gender of the player holding the card; the deck preview has no player, so the base name is used. */
  gender?: Gender | null;
}

/** Inner markup of a card face: artwork, gradient and the text block over it. */
function renderFace(role: MafiaRole, variant: number, options: FaceOptions): string {
  const accent = MAFIA_TEAM_COLOR[MAFIA_ROLE_TEAM[role]];
  const mates = (options.teammates ?? [])
    .map((t) => escapeHtml(t.name) + (t.role === 'don' ? ' (Дон)' : ''))
    .join(', ');

  return `
    <img class="mafia-face-img" src="${escapeHtml(mafiaCardImageUrl(role, variant))}" alt="" />
    <div class="mafia-face-shade"></div>
    <div class="mafia-face-text">
      <div class="mafia-face-team" style="color:${accent}">${escapeHtml(options.kicker)}</div>
      <div class="mafia-face-role">${escapeHtml(mafiaRoleName(role, options.gender))}</div>
      <div class="mafia-face-desc">${escapeHtml(MAFIA_ROLE_DESCRIPTION[role])}</div>
      ${options.seat != null ? `<div class="mafia-face-seat">Место №${escapeHtml(String(options.seat))}</div>` : ''}
      ${mates ? `<div class="mafia-face-mates" style="color:${accent}">Ваша команда: ${mates}</div>` : ''}
    </div>
  `;
}

/** Full-screen black overlay with a ✕ button; returns it already attached to the document. */
function openOverlay(innerHtml: string): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'mafia-overlay';
  overlay.innerHTML = `
    <button class="mafia-close" type="button" aria-label="Закрыть">✕</button>
    ${innerHtml}
  `;

  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.appendChild(overlay);

  overlay.querySelector('.mafia-close')!.addEventListener('click', () => {
    overlay.remove();
    document.body.style.overflow = previousOverflow;
  });

  return overlay;
}

/**
 * Full-screen role card: opens on a neutral back (identical for every role, so it leaks nothing),
 * a tap flips it to the face, a tap on the face flips it back, ✕ closes.
 */
export function openMafiaCard(card: MafiaCardDto): void {
  const team = MAFIA_ROLE_TEAM[card.role];
  const kicker = `ПАРТИЯ №${card.round} · ${MAFIA_TEAM_NAME[team].toUpperCase()}`;

  const overlay = openOverlay(`
    <div class="mafia-scene">
      <div class="mafia-flip" id="mafia-flip">
        <div class="mafia-side mafia-back">
          <div class="mafia-back-frame">
            <div class="mafia-back-mask">🎭</div>
            <div class="mafia-back-title">МАФИЯ</div>
            <div class="mafia-back-round">Партия №${escapeHtml(String(card.round))}</div>
            <div class="mafia-back-hint">Нажмите, чтобы открыть · убедитесь, что никто не смотрит</div>
          </div>
        </div>
        <div class="mafia-side mafia-face">
          ${renderFace(card.role, card.variant, { kicker, seat: card.seat, teammates: card.teammates, gender: card.gender })}
        </div>
      </div>
    </div>
  `);

  // Warm the cache while the back is on screen
  new Image().src = mafiaCardImageUrl(card.role, card.variant);

  const flip = overlay.querySelector<HTMLElement>('#mafia-flip')!;
  flip.addEventListener('click', () => {
    const flipped = flip.classList.toggle('mafia-flipped');
    if (flipped) window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium');
  });
}

/**
 * Same card at full size, but opened face up and without anything game-specific —
 * used by the deck page, where there is no secret to keep.
 */
export function openMafiaCardPreview(role: MafiaRole, variant: number): void {
  const kicker = `${MAFIA_TEAM_NAME[MAFIA_ROLE_TEAM[role]].toUpperCase()} · КАРТОЧКА №${variant}`;

  openOverlay(`
    <div class="mafia-scene">
      <div class="mafia-side mafia-face mafia-face-flat">
        ${renderFace(role, variant, { kicker })}
      </div>
    </div>
  `);
}
