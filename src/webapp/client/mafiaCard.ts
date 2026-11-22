import { escapeHtml } from './utils.js';
import {
  MAFIA_ROLE_DESCRIPTION,
  MAFIA_ROLE_NAME,
  MAFIA_ROLE_TEAM,
  MAFIA_TEAM_COLOR,
  MAFIA_TEAM_NAME,
} from './mafiaRoles.js';
import type { MafiaCardDto } from './types.js';

/**
 * Full-screen role card: opens on a neutral back (identical for every role, so it leaks nothing),
 * a tap flips it to the face, a tap on the face flips it back, ✕ closes.
 */
export function openMafiaCard(card: MafiaCardDto): void {
  const team = MAFIA_ROLE_TEAM[card.role];
  const accent = MAFIA_TEAM_COLOR[team];
  const imageUrl = `/img/mafia/${encodeURIComponent(card.role)}-${encodeURIComponent(String(card.variant))}.webp`;

  const mates = card.teammates
    .map((t) => escapeHtml(t.name) + (t.role === 'don' ? ' (Дон)' : ''))
    .join(', ');

  const overlay = document.createElement('div');
  overlay.className = 'mafia-overlay';
  overlay.innerHTML = `
    <button class="mafia-close" type="button" aria-label="Закрыть">✕</button>
    <div class="mafia-scene">
      <div class="mafia-flip" id="mafia-flip">
        <div class="mafia-side mafia-back">
          <div class="mafia-back-frame">
            <div class="mafia-back-mask">🎭</div>
            <div class="mafia-back-title">МАФИЯ</div>
            <div class="mafia-back-round">Партия №${escapeHtml(card.round)}</div>
            <div class="mafia-back-hint">Нажмите, чтобы открыть · убедитесь, что никто не смотрит</div>
          </div>
        </div>
        <div class="mafia-side mafia-face">
          <img class="mafia-face-img" src="${escapeHtml(imageUrl)}" alt="" />
          <div class="mafia-face-shade"></div>
          <div class="mafia-face-text">
            <div class="mafia-face-team" style="color:${accent}">ПАРТИЯ №${escapeHtml(card.round)} · ${escapeHtml(MAFIA_TEAM_NAME[team].toUpperCase())}</div>
            <div class="mafia-face-role">${escapeHtml(MAFIA_ROLE_NAME[card.role])}</div>
            <div class="mafia-face-desc">${escapeHtml(MAFIA_ROLE_DESCRIPTION[card.role])}</div>
            ${card.seat !== null ? `<div class="mafia-face-seat">Место №${escapeHtml(card.seat)}</div>` : ''}
            ${mates ? `<div class="mafia-face-mates" style="color:${accent}">Ваша команда: ${mates}</div>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;

  // Warm the cache while the back is on screen
  new Image().src = imageUrl;

  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.appendChild(overlay);

  const flip = overlay.querySelector<HTMLElement>('#mafia-flip')!;
  flip.addEventListener('click', () => {
    const flipped = flip.classList.toggle('mafia-flipped');
    if (flipped) window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium');
  });

  overlay.querySelector('.mafia-close')!.addEventListener('click', () => {
    overlay.remove();
    document.body.style.overflow = previousOverflow;
  });
}
