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
import type { GameType, Nav, SportDto, LocationDto } from '../types.js';

interface CreateCtx {
  tg: TelegramWebApp;
  groupId: string;
  type: GameType;
}

/**
 * Renders the game/training creation form.
 */
export async function renderCreateForm(ctx: CreateCtx, nav: Nav): Promise<void> {
  const { tg, groupId, type } = ctx;

  showLoader();
  setBackButton(tg, nav.goHome);
  hideMainButton(tg);

  try {
    const [sports, locations] = await Promise.all([
      apiFetch<SportDto[]>('/api/sports'),
      groupId
        ? apiFetch<LocationDto[]>(
            `/api/locations?group_id=${encodeURIComponent(groupId)}`,
          )
        : Promise.resolve<LocationDto[]>([]),
    ]);

    const isTraining = type === 'training';
    const title = isTraining ? '🏃 Создать тренировку' : '🎮 Создать игру';

    const sportsOptions = sports
      .map(
        (s) =>
          `<option value="${escapeHtml(String(s.id))}">${escapeHtml(s.emoji)} ${escapeHtml(s.name)}</option>`,
      )
      .join('');

    const locationsOptions = locations.length
      ? locations
          .map(
            (l) =>
              `<option value="${escapeHtml(String(l.id))}">${escapeHtml(l.name)}</option>`,
          )
          .join('')
      : '<option value="">Нет доступных площадок</option>';

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(18, 0, 0, 0);
    const defaultDate = tomorrow.toISOString().slice(0, 16);

    show(`
      <div class="page">
        <h2 class="page-title">${title}</h2>
        <form id="createForm" class="form">
          <div class="field">
            <label class="label">Вид спорта</label>
            <select name="sport_id" class="input" required>${sportsOptions}</select>
          </div>
          <div class="field">
            <label class="label">Дата и время</label>
            <input type="datetime-local" name="game_date" class="input" value="${defaultDate}" required />
          </div>
          <div class="field">
            <label class="label">Площадка</label>
            <select name="location_id" class="input" required>${locationsOptions}</select>
          </div>
          <div class="field-row">
            <div class="field">
              <label class="label">Мин. игроков</label>
              <input type="number" name="min_participants" class="input" value="6" min="1" max="100" required />
            </div>
            <div class="field">
              <label class="label">Макс. игроков</label>
              <input type="number" name="max_participants" class="input" value="12" min="1" max="100" required />
            </div>
          </div>
          <div class="field">
            <label class="label">Стоимость (необязательно)</label>
            <input type="number" name="cost" class="input" placeholder="0" min="0" step="50" />
          </div>
          <div class="field">
            <label class="label">Заметки (необязательно)</label>
            <textarea name="notes" class="input textarea" rows="3" placeholder="Доп. информация..."></textarea>
          </div>
        </form>
      </div>
    `);

    const handleSubmit = async (): Promise<void> => {
      const form = document.getElementById('createForm') as HTMLFormElement;
      const data = Object.fromEntries(new FormData(form).entries()) as Record<
        string,
        FormDataEntryValue
      >;

      if (!data['sport_id'] || !data['game_date'] || !data['location_id'] || !data['max_participants']) {
        toast('Заполните все обязательные поля', true);
        return;
      }

      tg.MainButton.showProgress();
      try {
        await apiFetch('/api/games', {
          method: 'POST',
          body: JSON.stringify({ ...data, group_id: groupId, type }),
        });
        tg.MainButton.hideProgress();
        hideMainButton(tg);
        toast(isTraining ? '✅ Тренировка создана!' : '✅ Игра создана!');
        setTimeout(() => nav.goHome(), 1500);
      } catch (err) {
        tg.MainButton.hideProgress();
        toast(getErrorMessage(err), true);
      }
    };

    setMainButton(tg, 'Создать', handleSubmit);
  } catch (err) {
    show(
      `<div class="error">❌ Ошибка загрузки: ${escapeHtml(getErrorMessage(err))}</div>`,
    );
  }
}
