import { show, showLoader, toast, setBackButton, hideMainButton, type TelegramWebApp } from '../ui.js';
import { apiFetch } from '../api.js';
import { escapeHtml, getErrorMessage } from '../utils.js';
import { bindGenderPicker, readGenderPicker, renderGenderPicker } from '../genderPicker.js';
import type { MyProfileDto, Nav } from '../types.js';

interface ProfileCtx {
  tg: TelegramWebApp;
}

const PICKER_ID = 'profile-gender';

function displayName(profile: MyProfileDto): string {
  return [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.username || '—';
}

/**
 * The player's own profile: the name is read-only (an admin keeps it in order),
 * the gender is the one field a player sets for themselves.
 */
export async function renderProfile(ctx: ProfileCtx, nav: Nav): Promise<void> {
  const { tg } = ctx;

  hideMainButton(tg);
  setBackButton(tg, () => nav.goHome());
  showLoader();

  let profile: MyProfileDto;
  try {
    profile = await apiFetch<MyProfileDto>('/api/user/me');
  } catch (err) {
    show(`<div class="error">❌ ${escapeHtml(getErrorMessage(err))}</div>`);
    return;
  }

  show(`
    <div class="page" id="profile-page">
      <h2 class="page-title">👤 Мой профиль</h2>
      <div class="profile-field">
        <span class="profile-label">Имя</span>
        <span class="profile-value">${escapeHtml(displayName(profile))}</span>
      </div>
      ${profile.username ? `
      <div class="profile-field">
        <span class="profile-label">Username</span>
        <span class="profile-value">@${escapeHtml(profile.username)}</span>
      </div>` : ''}
      <div class="santa-hint">Имя и фамилию меняет администратор группы.</div>
      <div class="profile-field profile-field-column">
        <span class="profile-label">Пол</span>
        ${renderGenderPicker(PICKER_ID, profile.gender)}
      </div>
      <div class="santa-hint">Пол влияет на название роли и картинку карточки в Мафии.</div>
      <button class="btn btn-primary btn-large" data-action="save-gender">Сохранить</button>
    </div>
  `);

  bindGenderPicker(PICKER_ID);

  document.getElementById('profile-page')!.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action="save-gender"]');
    if (!btn || btn.disabled) return;

    btn.disabled = true;
    try {
      profile = await apiFetch<MyProfileDto>('/api/user/me', {
        method: 'PATCH',
        body: JSON.stringify({ gender: readGenderPicker(PICKER_ID) }),
      });
      toast('✅ Профиль сохранён');
    } catch (err) {
      toast(getErrorMessage(err), true);
    }
    btn.disabled = false;
  });
}
