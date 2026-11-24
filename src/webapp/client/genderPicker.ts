/**
 * Three-state gender control (— / ♂ / ♀) shared by the members page and the own profile page.
 * The chosen value lives in the container's data attribute, so the caller reads it back on save.
 */

import { escapeHtml } from './utils.js';
import type { Gender } from './types.js';

const OPTIONS: Array<{ value: Gender | ''; label: string }> = [
  { value: '', label: '—' },
  { value: 'male', label: '♂ Муж' },
  { value: 'female', label: '♀ Жен' },
];

/** Short marker next to a name; empty string when the gender is unknown. */
export function genderIcon(gender?: Gender | null): string {
  if (gender === 'male') return '♂';
  if (gender === 'female') return '♀';
  return '';
}

/** Markup of the control; `id` must be unique on the page and is used by the two helpers below. */
export function renderGenderPicker(id: string, value?: Gender | null): string {
  const current = value ?? '';
  const buttons = OPTIONS.map((o) => `
    <button type="button" class="gender-option${o.value === current ? ' gender-option-active' : ''}"
      data-gender="${escapeHtml(o.value)}">${escapeHtml(o.label)}</button>
  `).join('');

  return `<div class="gender-picker" id="${escapeHtml(id)}" data-value="${escapeHtml(current)}">${buttons}</div>`;
}

/** Makes the control interactive; call it after the markup was inserted into the document. */
export function bindGenderPicker(id: string): void {
  const picker = document.getElementById(id);
  if (!picker) return;

  picker.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-gender]');
    if (!btn) return;

    picker.dataset['value'] = btn.dataset['gender'] ?? '';
    picker.querySelectorAll('.gender-option').forEach((el) => el.classList.remove('gender-option-active'));
    btn.classList.add('gender-option-active');
  });
}

/** Puts the control back to a known value — used when an edit form is reopened. */
export function setGenderPicker(id: string, value?: Gender | null): void {
  const picker = document.getElementById(id);
  if (!picker) return;

  const current = value ?? '';
  picker.dataset['value'] = current;
  picker.querySelectorAll<HTMLElement>('.gender-option').forEach((el) => {
    el.classList.toggle('gender-option-active', (el.dataset['gender'] ?? '') === current);
  });
}

/** Current value of the control: null means "not set". */
export function readGenderPicker(id: string): Gender | null {
  const value = document.getElementById(id)?.dataset['value'];
  return value === 'male' || value === 'female' ? value : null;
}
