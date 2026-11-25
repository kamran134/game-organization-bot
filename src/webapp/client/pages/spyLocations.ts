import { show, showLoader, toast, setBackButton, hideMainButton, type TelegramWebApp } from '../ui.js';
import { apiFetch } from '../api.js';
import { escapeHtml, getErrorMessage } from '../utils.js';
import type { Nav, SpyLocationDto } from '../types.js';

interface SpyLocationsCtx {
  tg: TelegramWebApp;
  groupId: string;
  /** Only hides the controls; the server decides who may write. */
  isAdmin: boolean;
}

function renderOwnList(own: SpyLocationDto[], canEdit: boolean): string {
  if (!own.length) return '<div class="empty">Своих локаций пока нет</div>';

  return own.map((l) => `
    <div class="sport-row">
      <span class="sport-name">📍 ${escapeHtml(l.name)}</span>
      ${canEdit
        ? `<button class="btn-icon" data-action="remove-location" data-location-id="${escapeHtml(String(l.id))}" title="Удалить">🗑️</button>`
        : ''}
    </div>
  `).join('');
}

/** Global locations are shown for reference only, folded per pack. */
function renderGlobalList(global: SpyLocationDto[]): string {
  const byPack = new Map<string, SpyLocationDto[]>();
  for (const l of global) byPack.set(l.pack, [...(byPack.get(l.pack) ?? []), l]);

  return Array.from(byPack.entries()).map(([pack, items]) => `
    <details class="spy-pack">
      <summary>${escapeHtml(pack)} (${items.length})</summary>
      <div class="spy-pack-items">${items.map((l) => `<span class="spy-chip">${escapeHtml(l.name)}</span>`).join('')}</div>
    </details>
  `).join('');
}

/**
 * Renders the locations of the group: its own ones (editable by a group admin) and the global ones
 * (reference only).
 */
export async function renderSpyLocations(ctx: SpyLocationsCtx, nav: Nav): Promise<void> {
  const { tg, groupId, isAdmin } = ctx;

  hideMainButton(tg);
  setBackButton(tg, () => nav.goSpyList());
  showLoader();

  let locations: SpyLocationDto[];
  try {
    locations = await apiFetch<SpyLocationDto[]>(`/api/spy/locations?group_id=${encodeURIComponent(groupId)}`);
  } catch (err) {
    show(`<div class="error">❌ ${escapeHtml(getErrorMessage(err))}</div>`);
    return;
  }

  function render(): void {
    const own = locations.filter((l) => l.group_id !== null);
    const global = locations.filter((l) => l.group_id === null);

    show(`
      <div class="page" id="spy-locations-page">
        <h2 class="page-title">📍 Локации «Шпиона»</h2>
        <h3 class="santa-section-title">Свои локации группы</h3>
        <div class="sports-list">${renderOwnList(own, isAdmin)}</div>
        ${isAdmin ? `
          <form id="addLocationForm" class="form add-sport-form">
            <div class="field">
              <label class="label">Новая локация</label>
              <input class="input" id="spy-location-input" maxlength="100" placeholder="Например: Наш офис" required />
            </div>
            <button type="submit" class="btn btn-primary">Добавить</button>
          </form>
        ` : '<div class="santa-hint">Добавлять и удалять локации могут админы группы. Чтобы они попали в игру, включите пакет «Свои локации».</div>'}
        <h3 class="santa-section-title">Общие локации (только просмотр)</h3>
        ${renderGlobalList(global) || '<div class="empty">Общих локаций нет</div>'}
      </div>
    `);
    attachHandlers();
  }

  function attachHandlers(): void {
    const page = document.getElementById('spy-locations-page')!;

    page.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action="remove-location"]');
      if (!btn) return;

      const locationId = btn.dataset['locationId']!;
      const location = locations.find((l) => String(l.id) === locationId);
      if (!window.confirm(`Удалить «${location?.name ?? 'локацию'}»?`)) return;

      btn.disabled = true;
      try {
        await apiFetch(`/api/spy/locations/${encodeURIComponent(locationId)}`, { method: 'DELETE' });
        locations = locations.filter((l) => String(l.id) !== locationId);
        toast('✅ Локация удалена');
        render();
      } catch (err) {
        btn.disabled = false;
        toast(getErrorMessage(err), true);
      }
    });

    const form = document.getElementById('addLocationForm') as HTMLFormElement | null;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nameInput = document.getElementById('spy-location-input') as HTMLInputElement;
      const name = nameInput.value.trim();
      if (!name) {
        toast('Введите название', true);
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
      submitBtn.disabled = true;
      try {
        const created = await apiFetch<SpyLocationDto>('/api/spy/locations', {
          method: 'POST',
          body: JSON.stringify({ group_id: parseInt(groupId, 10), name }),
        });
        locations = [...locations, created];
        toast('✅ Локация добавлена');
        render();
      } catch (err) {
        submitBtn.disabled = false;
        toast(getErrorMessage(err), true);
      }
    });
  }

  render();
}
