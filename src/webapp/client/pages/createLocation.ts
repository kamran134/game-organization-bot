import {
  show,
  showLoader,
  toast,
  setBackButton,
  setMainButton,
  hideMainButton,
  type TelegramWebApp,
} from '../ui.js';
import { apiFetch } from '../api.js';
import { escapeHtml, getErrorMessage } from '../utils.js';
import type { Nav, SportDto } from '../types.js';

interface CreateLocationCtx {
  tg: TelegramWebApp;
  groupId: string;
}

/**
 * Renders the location creation form (admin only).
 */
export async function renderCreateLocation(ctx: CreateLocationCtx, nav: Nav): Promise<void> {
  const { tg, groupId } = ctx;

  showLoader();
  setBackButton(tg, nav.goHome);
  hideMainButton(tg);

  try {
    const sports = await apiFetch<SportDto[]>('/api/sports');

    const sportCheckboxes = sports
      .map(
        (s) =>
          `<label class="checkbox-label">
            <input type="checkbox" name="sport_ids" value="${escapeHtml(String(s.id))}" />
            ${escapeHtml(s.emoji)} ${escapeHtml(s.name)}
          </label>`,
      )
      .join('');

    show(`
      <div class="page">
        <h2 class="page-title">📍 Добавить площадку</h2>
        <form id="createLocationForm" class="form">
          <div class="field">
            <label class="label">Название площадки</label>
            <input type="text" name="name" class="input" placeholder="Например: Стадион Динамо" required maxlength="255" />
          </div>
          <div class="field">
            <label class="label">Виды спорта</label>
            <div class="checkbox-group">
              ${sportCheckboxes}
            </div>
          </div>
          <div class="field">
            <label class="label">Ссылка на карту (необязательно)</label>
            <input type="url" name="map_url" class="input" placeholder="https://maps.google.com/..." maxlength="500" />
          </div>
        </form>
      </div>
    `);

    const handleSubmit = async (): Promise<void> => {
      const form = document.getElementById('createLocationForm') as HTMLFormElement;
      const formData = new FormData(form);

      const name = (formData.get('name') as string | null)?.trim() ?? '';
      const mapUrl = (formData.get('map_url') as string | null)?.trim() ?? '';
      const sportIds = formData.getAll('sport_ids').map(Number);

      if (!name) {
        toast('Введите название площадки', true);
        return;
      }

      tg.MainButton.showProgress();
      try {
        await apiFetch('/api/locations', {
          method: 'POST',
          body: JSON.stringify({
            group_id: groupId,
            name,
            sport_ids: sportIds,
            map_url: mapUrl || undefined,
          }),
        });
        tg.MainButton.hideProgress();
        hideMainButton(tg);
        toast('✅ Площадка добавлена!');
        setTimeout(() => nav.goHome(), 1500);
      } catch (err) {
        tg.MainButton.hideProgress();
        toast(getErrorMessage(err), true);
      }
    };

    setMainButton(tg, 'Добавить площадку', handleSubmit);
  } catch (err) {
    show(`<div class="error">❌ Ошибка загрузки: ${escapeHtml(getErrorMessage(err))}</div>`);
  }
}
