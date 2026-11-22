import {
  show,
  toast,
  setBackButton,
  setMainButton,
  hideMainButton,
  type TelegramWebApp,
} from '../ui.js';
import { apiFetch } from '../api.js';
import { getErrorMessage } from '../utils.js';
import { MAFIA_MAX_PLAYERS, MAFIA_MIN_PLAYERS } from '../mafiaRoles.js';
import type { Nav, MafiaEventDto } from '../types.js';

interface MafiaCreateCtx {
  tg: TelegramWebApp;
  groupId: string;
}

/**
 * Renders the Mafia evening creation form; the creator becomes the host.
 */
export function renderMafiaCreate(ctx: MafiaCreateCtx, nav: Nav): void {
  const { tg, groupId } = ctx;

  setBackButton(tg, () => nav.goMafiaList());

  show(`
    <div class="page">
      <h2 class="page-title">🎭 Новый вечер мафии</h2>
      <form id="mafiaCreateForm" class="form">
        <div class="field">
          <label class="label">Название</label>
          <input type="text" name="title" class="input" maxlength="100" value="Мафия" required />
        </div>
        <div class="field">
          <label class="label">Дата и время (необязательно)</label>
          <input type="datetime-local" name="starts_at" class="input" />
        </div>
        <div class="field">
          <label class="label">Место (необязательно)</label>
          <input type="text" name="place" class="input" maxlength="200" placeholder="Кафе, адрес..." />
        </div>
        <div class="field">
          <label class="label">Максимум игроков</label>
          <input type="number" name="max_players" class="input" min="${MAFIA_MIN_PLAYERS}" max="${MAFIA_MAX_PLAYERS}" value="10" />
        </div>
        <div class="field">
          <label class="label">Описание (необязательно)</label>
          <textarea name="description" class="input textarea" rows="3" maxlength="500" placeholder="Правила, дресс-код..."></textarea>
        </div>
        <label class="mafia-check"><input type="checkbox" name="show_mafia_team" checked /> Показывать мафии своих</label>
        <label class="mafia-check"><input type="checkbox" name="assign_seats" /> Случайная рассадка</label>
      </form>
    </div>
  `);

  const handleSubmit = async (): Promise<void> => {
    const form = document.getElementById('mafiaCreateForm') as HTMLFormElement;
    const field = (name: string): HTMLInputElement | HTMLTextAreaElement =>
      form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement;

    const title = field('title').value.trim();
    if (!title) {
      toast('Введите название', true);
      return;
    }
    const maxPlayers = parseInt(field('max_players').value, 10);
    if (!Number.isInteger(maxPlayers) || maxPlayers < MAFIA_MIN_PLAYERS || maxPlayers > MAFIA_MAX_PLAYERS) {
      toast(`Игроков должно быть от ${MAFIA_MIN_PLAYERS} до ${MAFIA_MAX_PLAYERS}`, true);
      return;
    }

    // datetime-local is the user's wall-clock time; send it as an absolute instant
    const startsRaw = field('starts_at').value;
    const body = {
      group_id: parseInt(groupId, 10),
      title,
      description: field('description').value,
      place: field('place').value,
      starts_at: startsRaw ? new Date(startsRaw).toISOString() : null,
      max_players: maxPlayers,
      show_mafia_team: (field('show_mafia_team') as HTMLInputElement).checked,
      assign_seats: (field('assign_seats') as HTMLInputElement).checked,
    };

    tg.MainButton.showProgress();
    try {
      const created = await apiFetch<MafiaEventDto>('/api/mafia', { method: 'POST', body: JSON.stringify(body) });
      tg.MainButton.hideProgress();
      hideMainButton(tg);
      toast('✅ Вечер создан!');
      nav.goMafiaEvent(created.id);
    } catch (err) {
      tg.MainButton.hideProgress();
      toast(getErrorMessage(err), true);
    }
  };

  setMainButton(tg, 'Создать', handleSubmit);
}
