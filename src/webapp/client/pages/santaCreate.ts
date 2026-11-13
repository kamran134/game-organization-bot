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
import type { Nav, SantaEventDto } from '../types.js';

interface SantaCreateCtx {
  tg: TelegramWebApp;
  groupId: string;
}

/**
 * Renders the Secret Santa event creation form (admins only; the server enforces it).
 */
export function renderSantaCreate(ctx: SantaCreateCtx, nav: Nav): void {
  const { tg, groupId } = ctx;

  setBackButton(tg, () => nav.goSantaList());

  show(`
    <div class="page">
      <h2 class="page-title">🎅 Новый Тайный Санта</h2>
      <form id="santaCreateForm" class="form">
        <div class="field">
          <label class="label">Название</label>
          <input type="text" name="title" class="input" maxlength="100" placeholder="Новый год 2027" required />
        </div>
        <div class="field">
          <label class="label">Бюджет (необязательно)</label>
          <input type="text" name="budget" class="input" maxlength="50" placeholder="до 30 AZN" />
        </div>
        <div class="field">
          <label class="label">Дата обмена подарками (необязательно)</label>
          <input type="date" name="exchange_date" class="input" />
        </div>
        <div class="field">
          <label class="label">Описание (необязательно)</label>
          <textarea name="description" class="input textarea" rows="3" maxlength="500" placeholder="Правила, место встречи..."></textarea>
        </div>
      </form>
    </div>
  `);

  const handleSubmit = async (): Promise<void> => {
    const form = document.getElementById('santaCreateForm') as HTMLFormElement;
    const data = Object.fromEntries(new FormData(form).entries()) as Record<string, FormDataEntryValue>;

    if (!String(data['title'] ?? '').trim()) {
      toast('Введите название', true);
      return;
    }

    tg.MainButton.showProgress();
    try {
      const created = await apiFetch<SantaEventDto>('/api/santa', {
        method: 'POST',
        body: JSON.stringify({ ...data, group_id: parseInt(groupId, 10) }),
      });
      tg.MainButton.hideProgress();
      hideMainButton(tg);
      toast('✅ Событие создано!');
      nav.goSantaEvent(created.id);
    } catch (err) {
      tg.MainButton.hideProgress();
      toast(getErrorMessage(err), true);
    }
  };

  setMainButton(tg, 'Создать', handleSubmit);
}
