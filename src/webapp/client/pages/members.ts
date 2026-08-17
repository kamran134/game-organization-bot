import { show, showLoader, toast, setBackButton, hideMainButton, type TelegramWebApp } from '../ui.js';
import { apiFetch } from '../api.js';
import { escapeHtml, getErrorMessage } from '../utils.js';
import type { MemberDto, Nav } from '../types.js';

interface MembersCtx {
  tg: TelegramWebApp;
  groupId: string;
}

function memberDisplayName(m: MemberDto): string {
  return [m.first_name, m.last_name].filter(Boolean).join(' ') || m.username || '—';
}

function renderMembersList(members: MemberDto[], groupId: string): string {
  if (!members.length) {
    return '<div class="empty">Участников нет</div>';
  }

  return members.map(m => {
    const uid = escapeHtml(String(m.id));
    const name = escapeHtml(memberDisplayName(m));
    const hint = m.username ? `<span class="member-hint">@${escapeHtml(m.username)}</span>` : '';
    const firstName = escapeHtml(m.first_name ?? '');
    const lastName  = escapeHtml(m.last_name  ?? '');

    return `
      <div class="member-row" id="member-row-${uid}">
        <span class="member-name">${name}</span>
        ${hint}
        <button class="btn-icon"
          data-action="edit-member"
          data-user-id="${uid}"
          data-first-name="${firstName}"
          data-last-name="${lastName}"
          title="Редактировать имя">✏️</button>
        <button class="btn-icon"
          data-action="remove-member"
          data-user-id="${uid}"
          data-group-id="${escapeHtml(groupId)}"
          title="Удалить из группы">🗑️</button>
      </div>
      <div class="member-edit-form hidden" id="member-form-${uid}">
        <div class="guest-form-inner">
          <input class="guest-input" id="member-first-${uid}" placeholder="Имя" value="${firstName}">
          <input class="guest-input" id="member-last-${uid}"  placeholder="Фамилия" value="${lastName}">
          <div class="guest-form-actions">
            <button class="btn btn-primary"   data-action="save-member"   data-user-id="${uid}" data-group-id="${escapeHtml(groupId)}">Сохранить</button>
            <button class="btn btn-secondary" data-action="cancel-member" data-user-id="${uid}">Отмена</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

export async function renderMembers(ctx: MembersCtx, nav: Nav): Promise<void> {
  const { tg, groupId } = ctx;

  hideMainButton(tg);
  setBackButton(tg, () => nav.goHome());

  showLoader();

  let members: MemberDto[];
  try {
    members = await apiFetch<MemberDto[]>(`/api/user/members?group_id=${encodeURIComponent(groupId)}`);
  } catch (err) {
    show(`<div class="error">❌ ${escapeHtml(getErrorMessage(err))}</div>`);
    return;
  }

  function render() {
    show(`
      <div class="page">
        <h2 class="page-title">👥 Участники</h2>
        <div class="members-list" id="members-list">
          ${renderMembersList(members, groupId)}
        </div>
      </div>
    `);
    attachHandlers();
  }

  function attachHandlers() {
    document.getElementById('members-list')!.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
      if (!btn) return;

      const action = btn.dataset['action'];
      const userId = btn.dataset['userId']!;

      if (action === 'edit-member') {
        const form = document.getElementById(`member-form-${userId}`)!;
        const firstInput = document.getElementById(`member-first-${userId}`) as HTMLInputElement;
        firstInput.value = btn.dataset['firstName'] ?? '';
        (document.getElementById(`member-last-${userId}`) as HTMLInputElement).value = btn.dataset['lastName'] ?? '';
        form.classList.remove('hidden');
        firstInput.focus();
        return;
      }

      if (action === 'cancel-member') {
        document.getElementById(`member-form-${userId}`)!.classList.add('hidden');
        return;
      }

      if (action === 'remove-member') {
        const m = members.find(x => x.id === parseInt(userId));
        const name = m ? memberDisplayName(m) : 'участника';
        if (!window.confirm(`Удалить ${name} из группы?`)) return;

        btn.disabled = true;

        try {
          await apiFetch(`/api/user/${encodeURIComponent(userId)}/member?group_id=${encodeURIComponent(groupId)}`, {
            method: 'DELETE',
          });

          members = members.filter(x => x.id !== parseInt(userId));
          toast('✅ Участник удалён из группы');
          render();
        } catch (err) {
          btn.disabled = false;
          toast(getErrorMessage(err), true);
        }
        return;
      }

      if (action === 'save-member') {
        const gid = btn.dataset['groupId']!;
        const firstName = (document.getElementById(`member-first-${userId}`) as HTMLInputElement).value.trim();
        const lastName  = (document.getElementById(`member-last-${userId}`)  as HTMLInputElement).value.trim();

        if (!firstName) {
          toast('Введите имя', true);
          return;
        }

        btn.disabled = true;
        btn.textContent = '…';

        try {
          await apiFetch(`/api/user/${encodeURIComponent(userId)}/name?group_id=${encodeURIComponent(gid)}`, {
            method: 'PATCH',
            body: JSON.stringify({ first_name: firstName, last_name: lastName || undefined }),
          });

          const m = members.find(x => x.id === parseInt(userId));
          if (m) {
            m.first_name = firstName;
            m.last_name  = lastName || undefined;
          }

          toast('✅ Имя обновлено');
          render();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Сохранить';
          toast(getErrorMessage(err), true);
        }
      }
    });
  }

  render();
}
