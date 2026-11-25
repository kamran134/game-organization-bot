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
import { escapeHtml } from '../utils.js';
import { getSpyErrorMessage, SPY_FORM_DEFAULTS, loadSpyMeta, readSpyForm, renderSpyFormFields } from '../spyForm.js';
import type { Nav, SpyEventDto, SpyMetaDto } from '../types.js';

interface SpyCreateCtx {
  tg: TelegramWebApp;
  groupId: string;
}

/**
 * Renders the Spy evening creation form. The creator becomes the host, and since the host plays in
 * this game, they are joined to the roster right after the evening is created.
 */
export async function renderSpyCreate(ctx: SpyCreateCtx, nav: Nav): Promise<void> {
  const { tg, groupId } = ctx;

  setBackButton(tg, () => nav.goSpyList());
  hideMainButton(tg);
  showLoader();

  // The packs and limits belong to the server; without them the form cannot be drawn, so a failure offers a retry
  let meta: SpyMetaDto;
  try {
    meta = await loadSpyMeta();
  } catch (err) {
    show(`
      <div class="page">
        <div class="error">❌ ${escapeHtml(getSpyErrorMessage(err))}</div>
        <button class="btn btn-primary" id="spyMetaRetry">Повторить</button>
      </div>
    `);
    document.getElementById('spyMetaRetry')?.addEventListener('click', () => { void renderSpyCreate(ctx, nav); });
    return;
  }

  show(`
    <div class="page">
      <h2 class="page-title">🕵️ Новый вечер «Шпиона»</h2>
      <form id="spyCreateForm" class="form">
        ${renderSpyFormFields(SPY_FORM_DEFAULTS, meta)}
      </form>
    </div>
  `);

  const handleSubmit = async (): Promise<void> => {
    const form = document.getElementById('spyCreateForm') as HTMLFormElement;
    const parsed = readSpyForm(form, meta.limits);
    if (!parsed.ok) {
      toast(parsed.error, true);
      return;
    }

    tg.MainButton.showProgress();
    let created: SpyEventDto;
    try {
      created = await apiFetch<SpyEventDto>('/api/spy', {
        method: 'POST',
        body: JSON.stringify({ group_id: parseInt(groupId, 10), ...parsed.body }),
      });
    } catch (err) {
      tg.MainButton.hideProgress();
      toast(getSpyErrorMessage(err), true);
      return;
    }

    // The server does not seat the host. A failed join must not undo the creation: the evening exists,
    // and the host can still join from its screen.
    let joined = true;
    try {
      await apiFetch(`/api/spy/${encodeURIComponent(String(created.id))}/join`, { method: 'POST' });
    } catch {
      joined = false;
    }

    tg.MainButton.hideProgress();
    hideMainButton(tg);
    toast(joined ? '✅ Вечер создан!' : 'Вечер создан, но записаться не удалось: сделайте это на экране вечера', !joined);
    nav.goSpyEvent(created.id);
  };

  setMainButton(tg, 'Создать', handleSubmit);
}
