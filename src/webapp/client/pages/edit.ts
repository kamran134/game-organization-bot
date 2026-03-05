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
import type { GameDto, Nav, SportDto, LocationDto } from '../types.js';

interface EditCtx {
  tg: TelegramWebApp;
  groupId: string;
  gameId: number;
}

/**
 * Renders the game/training edit form, pre-filled with existing data.
 */
export async function renderEditGame(ctx: EditCtx, nav: Nav): Promise<void> {
  const { tg, groupId, gameId } = ctx;

  showLoader();
  setBackButton(tg, nav.goGamesList);
  hideMainButton(tg);

  try {
    const [game, sports, locations] = await Promise.all([
      apiFetch<GameDto>(`/api/games/${gameId}`),
      apiFetch<SportDto[]>('/api/sports'),
      apiFetch<LocationDto[]>(`/api/locations?group_id=${encodeURIComponent(groupId)}`),
    ]);

    const isTraining = game.type === 'training';
    const title = isTraining ? '🏃 Редактировать тренировку' : '🎮 Редактировать игру';

    // Format date for datetime-local input (requires "YYYY-MM-DDTHH:mm")
    const gameDate = new Date(game.game_date);
    const pad = (n: number) => String(n).padStart(2, '0');
    const defaultDate =
      `${gameDate.getFullYear()}-${pad(gameDate.getMonth() + 1)}-${pad(gameDate.getDate())}` +
      `T${pad(gameDate.getHours())}:${pad(gameDate.getMinutes())}`;

    const sportsOptions = sports
      .map(
        (s) =>
          `<option value="${escapeHtml(String(s.id))}" ${s.id === game.sport?.id ? 'selected' : ''}>` +
          `${escapeHtml(s.emoji)} ${escapeHtml(s.name)}</option>`,
      )
      .join('');

    const locationsOptions = locations.length
      ? locations
          .map(
            (l) =>
              `<option value="${escapeHtml(String(l.id))}" ${l.id === game.location?.id ? 'selected' : ''}>` +
              `${escapeHtml(l.name)}</option>`,
          )
          .join('')
      : '<option value="">Нет доступных площадок</option>';

    show(`
      <div class="page">
        <h2 class="page-title">${title}</h2>
        <form id="editForm" class="form">
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
              <input type="number" name="min_participants" class="input"
                value="${escapeHtml(String(game.min_participants))}" min="1" max="100" required />
            </div>
            <div class="field">
              <label class="label">Макс. игроков</label>
              <input type="number" name="max_participants" class="input"
                value="${escapeHtml(String(game.max_participants))}" min="1" max="100" required />
            </div>
          </div>
          <div class="field">
            <label class="label">Стоимость (необязательно)</label>
            <input type="number" name="cost" class="input"
              value="${game.cost ? escapeHtml(String(game.cost)) : ''}"
              placeholder="0" min="0" step="50" />
          </div>
          <div class="field">
            <label class="label">Заметки (необязательно)</label>
            <textarea name="notes" class="input textarea" rows="3"
              placeholder="Доп. информация...">${game.notes ? escapeHtml(game.notes) : ''}</textarea>
          </div>
        </form>
      </div>
    `);

    const handleSubmit = async (): Promise<void> => {
      const form = document.getElementById('editForm') as HTMLFormElement;
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
        await apiFetch(`/api/games/${gameId}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        tg.MainButton.hideProgress();
        hideMainButton(tg);
        toast('✅ Игра обновлена!');
        setTimeout(() => nav.goGamesList(), 1200);
      } catch (err) {
        tg.MainButton.hideProgress();
        toast(getErrorMessage(err), true);
      }
    };

    setMainButton(tg, 'Сохранить', handleSubmit);
  } catch (err) {
    show(
      `<div class="error">❌ Ошибка загрузки: ${escapeHtml(getErrorMessage(err))}</div>`,
    );
  }
}
