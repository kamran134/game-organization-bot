import { show, showLoader, setBackButton, hideMainButton, type TelegramWebApp } from '../ui.js';
import { apiFetch } from '../api.js';
import { escapeHtml, getErrorMessage, santaPersonName } from '../utils.js';
import type { Nav, SpyStatsRowDto } from '../types.js';

interface SpyStatsCtx {
  tg: TelegramWebApp;
  groupId: string;
}

function renderRow(r: SpyStatsRowDto): string {
  return `
    <tr>
      <td class="spy-stats-name">${escapeHtml(santaPersonName(r))}</td>
      <td>${r.rounds}</td>
      <td>${r.wins}</td>
      <td>${r.spy_rounds}</td>
      <td>${r.exposed}</td>
      <td>${r.guessed}</td>
      <td>${Math.round(r.win_rate * 100)}%</td>
    </tr>
  `;
}

/**
 * Renders the group's Spy statistics. `win_rate` arrives as a 0..1 fraction.
 */
export async function renderSpyStats(ctx: SpyStatsCtx, nav: Nav): Promise<void> {
  const { tg, groupId } = ctx;

  hideMainButton(tg);
  setBackButton(tg, () => nav.goSpyList());
  showLoader();

  let rows: SpyStatsRowDto[];
  try {
    rows = await apiFetch<SpyStatsRowDto[]>(`/api/spy/stats?group_id=${encodeURIComponent(groupId)}`);
  } catch (err) {
    show(`<div class="error">❌ ${escapeHtml(getErrorMessage(err))}</div>`);
    return;
  }

  const table = rows.length === 0
    ? '<div class="empty">Ещё не сыграно ни одной партии</div>'
    : `
      <div class="spy-stats-wrap">
        <table class="spy-stats">
          <thead>
            <tr>
              <th>Игрок</th><th title="Партий">Парт.</th><th title="Побед">Поб.</th>
              <th title="Партий за шпиона">Шпион</th><th title="Раз разоблачён">Разобл.</th>
              <th title="Раз угадал локацию">Угадал</th><th title="Доля побед">%</th>
            </tr>
          </thead>
          <tbody>${rows.map(renderRow).join('')}</tbody>
        </table>
      </div>
    `;

  show(`
    <div class="page">
      <h2 class="page-title">📊 Статистика «Шпиона»</h2>
      ${table}
    </div>
  `);
}
