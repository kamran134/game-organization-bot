import { show, showLoader, toast, setBackButton, hideMainButton, type TelegramWebApp } from '../ui.js';
import { apiFetch } from '../api.js';
import { escapeHtml, getErrorMessage } from '../utils.js';
import type { SportDto, Nav } from '../types.js';

interface SportsCtx {
  tg: TelegramWebApp;
  groupId: string;
}

function renderSportsList(sports: SportDto[]): string {
  if (!sports.length) {
    return '<div class="empty">Видов активности нет</div>';
  }

  return sports.map(s => {
    const sid = escapeHtml(String(s.id));
    const name = escapeHtml(s.name);
    const emoji = escapeHtml(s.emoji);
    const badge = s.is_base ? '<span class="sport-badge">базовый</span>' : '';
    const deleteBtn = s.is_base
      ? ''
      : `<button class="btn-icon" data-action="remove-sport" data-sport-id="${sid}" title="Удалить">🗑️</button>`;

    return `
      <div class="sport-row" id="sport-row-${sid}">
        <span class="sport-name">${emoji} ${name}</span>
        ${badge}
        ${deleteBtn}
      </div>
    `;
  }).join('');
}

/**
 * Renders the group's sport types (activity types) management page (admin only).
 * Base sports are shown for reference but cannot be edited or removed.
 */
export async function renderSports(ctx: SportsCtx, nav: Nav): Promise<void> {
  const { tg, groupId } = ctx;

  hideMainButton(tg);
  setBackButton(tg, () => nav.goHome());

  showLoader();

  let sports: SportDto[];
  try {
    sports = await apiFetch<SportDto[]>(`/api/sports?group_id=${encodeURIComponent(groupId)}`);
  } catch (err) {
    show(`<div class="error">❌ ${escapeHtml(getErrorMessage(err))}</div>`);
    return;
  }

  function render() {
    show(`
      <div class="page">
        <h2 class="page-title">🏅 Виды активности</h2>
        <div class="sports-list" id="sports-list">
          ${renderSportsList(sports)}
        </div>
        <form id="addSportForm" class="form add-sport-form">
          <div class="field-row">
            <div class="field">
              <label class="label">Название</label>
              <input class="input" id="sport-name-input" maxlength="50" placeholder="Например: Пинг-понг" required />
            </div>
            <div class="field">
              <label class="label">Эмодзи</label>
              <input class="input" id="sport-emoji-input" maxlength="10" placeholder="🏓" required />
            </div>
          </div>
          <button type="submit" class="btn btn-primary">Добавить</button>
        </form>
      </div>
    `);
    attachHandlers();
  }

  function attachHandlers() {
    document.getElementById('sports-list')!.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action="remove-sport"]');
      if (!btn) return;

      const sportId = btn.dataset['sportId']!;
      const sport = sports.find(s => s.id === parseInt(sportId));
      const name = sport ? `${sport.emoji} ${sport.name}` : 'вид активности';
      if (!window.confirm(`Удалить «${name}»?`)) return;

      btn.disabled = true;

      try {
        await apiFetch(`/api/sports/${encodeURIComponent(sportId)}?group_id=${encodeURIComponent(groupId)}`, {
          method: 'DELETE',
        });

        sports = sports.filter(s => s.id !== parseInt(sportId));
        toast('✅ Вид активности удалён');
        render();
      } catch (err) {
        btn.disabled = false;
        toast(getErrorMessage(err), true);
      }
    });

    const form = document.getElementById('addSportForm') as HTMLFormElement;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nameInput = document.getElementById('sport-name-input') as HTMLInputElement;
      const emojiInput = document.getElementById('sport-emoji-input') as HTMLInputElement;
      const name = nameInput.value.trim();
      const emoji = emojiInput.value.trim();

      if (!name || !emoji) {
        toast('Заполните название и эмодзи', true);
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
      submitBtn.disabled = true;

      try {
        const created = await apiFetch<SportDto>(`/api/sports?group_id=${encodeURIComponent(groupId)}`, {
          method: 'POST',
          body: JSON.stringify({ name, emoji }),
        });

        sports = [...sports, created].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        toast('✅ Вид активности добавлен');
        render();
      } catch (err) {
        submitBtn.disabled = false;
        toast(getErrorMessage(err), true);
      }
    });
  }

  render();
}
