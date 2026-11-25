import type { SpyEventDto, SpyLimitsDto, SpyMetaDto } from './types.js';
import { apiFetch } from './api.js';
import { escapeHtml, getErrorMessage } from './utils.js';

/** Limits of the last successful meta load; null until then. */
let loadedLimits: SpyLimitsDto | null = null;

/**
 * Packs and numeric limits come from GET /api/spy/meta: the create form runs before any event exists,
 * and the server stays the single source of them.
 */
export async function loadSpyMeta(): Promise<SpyMetaDto> {
  const meta = await apiFetch<SpyMetaDto>('/api/spy/meta');
  loadedLimits = meta.limits;
  return meta;
}

/**
 * Player-count messages of the Spy pages. Their English keys are shared with Mafia, whose limits differ,
 * so the numbers here come from the server's meta (never hard-coded); without it the text stays number-free.
 */
export function getSpyErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const limits = loadedLimits;
    if (err.message === 'Not enough players') {
      return limits ? `Недостаточно игроков (нужно минимум ${limits.min_players})` : 'Недостаточно игроков';
    }
    if (err.message === 'Invalid max players') {
      return limits
        ? `Число игроков должно быть от ${limits.min_players} до ${limits.max_players}`
        : 'Некорректное число игроков';
    }
  }
  return getErrorMessage(err);
}

export interface SpyFormValues {
  title: string;
  description: string;
  starts_at: string | null;
  place: string;
  max_players: number;
  spy_count: number | null;
  double_agent: boolean;
  mr_white: boolean;
  packs: string[];
  turn_seconds: number | null;
  hint_after_cycles: number | null;
}

export const SPY_FORM_DEFAULTS: SpyFormValues = {
  title: 'Шпион',
  description: '',
  starts_at: null,
  place: '',
  max_players: 10,
  spy_count: null,
  double_agent: false,
  mr_white: false,
  packs: ['base'],
  turn_seconds: null,
  hint_after_cycles: null,
};

export function spyFormValuesOf(event: SpyEventDto): SpyFormValues {
  return {
    title: event.title,
    description: event.description ?? '',
    starts_at: event.starts_at,
    place: event.place ?? '',
    max_players: event.max_players,
    spy_count: event.spy_count,
    double_agent: event.double_agent,
    mr_white: event.mr_white,
    packs: event.packs,
    turn_seconds: event.turn_seconds,
    hint_after_cycles: event.hint_after_cycles,
  };
}

/** ISO instant to the value of a datetime-local input (the user's wall-clock time). */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function numberOrEmpty(value: number | null): string {
  return value === null ? '' : String(value);
}

/** The fields shared by the create form and the settings panel. Names are read back by readSpyForm. */
export function renderSpyFormFields(values: SpyFormValues, meta: SpyMetaDto, suggestedSpyCount?: number): string {
  const { limits } = meta;
  const packBoxes = meta.packs.map((p) => `
    <label class="mafia-check">
      <input type="checkbox" name="pack" value="${escapeHtml(p.id)}" ${values.packs.includes(p.id) ? 'checked' : ''} />
      ${escapeHtml(p.emoji)} ${escapeHtml(p.title)}${p.adult ? ' <span class="spy-adult">18+, только для взрослых</span>' : ''}
    </label>`).join('');
  const autoHint = suggestedSpyCount ? ` (авто: ${escapeHtml(suggestedSpyCount)})` : '';

  return `
    <div class="field">
      <label class="label">Название</label>
      <input type="text" name="title" class="input" maxlength="100" value="${escapeHtml(values.title)}" required />
    </div>
    <div class="field">
      <label class="label">Дата и время (необязательно)</label>
      <input type="datetime-local" name="starts_at" class="input" value="${escapeHtml(toLocalInput(values.starts_at))}" />
    </div>
    <div class="field">
      <label class="label">Место (необязательно)</label>
      <input type="text" name="place" class="input" maxlength="200" value="${escapeHtml(values.place)}" placeholder="Кафе, адрес..." />
    </div>
    <div class="field">
      <label class="label">Максимум игроков</label>
      <input type="number" name="max_players" class="input" min="${limits.min_players}" max="${limits.max_players}" value="${escapeHtml(values.max_players)}" />
    </div>
    <div class="field">
      <label class="label">Число шпионов${autoHint}</label>
      <input type="number" name="spy_count" class="input" min="1" max="${limits.max_players}" value="${escapeHtml(numberOrEmpty(values.spy_count))}" placeholder="Пусто - автоматически" />
    </div>
    <label class="mafia-check"><input type="checkbox" name="double_agent" ${values.double_agent ? 'checked' : ''} /> Двойной агент</label>
    <label class="mafia-check"><input type="checkbox" name="mr_white" ${values.mr_white ? 'checked' : ''} /> Мистер Белый</label>
    <div class="field">
      <label class="label">Пакеты локаций</label>
      ${packBoxes}
    </div>
    <div class="field">
      <label class="label">Таймер хода, секунд (${limits.turn_seconds.min}-${limits.turn_seconds.max})</label>
      <input type="number" name="turn_seconds" class="input" min="${limits.turn_seconds.min}" max="${limits.turn_seconds.max}" value="${escapeHtml(numberOrEmpty(values.turn_seconds))}" placeholder="Пусто - без таймера" />
    </div>
    <div class="field">
      <label class="label">Подсказка шпиону после N кругов (${limits.hint_cycles.min}-${limits.hint_cycles.max})</label>
      <input type="number" name="hint_after_cycles" class="input" min="${limits.hint_cycles.min}" max="${limits.hint_cycles.max}" value="${escapeHtml(numberOrEmpty(values.hint_after_cycles))}" placeholder="Пусто - без подсказки" />
    </div>
    <div class="field">
      <label class="label">Описание (необязательно)</label>
      <textarea name="description" class="input textarea" rows="3" maxlength="500" placeholder="Правила, дресс-код...">${escapeHtml(values.description)}</textarea>
    </div>
  `;
}

export type SpyFormResult = { ok: true; body: Record<string, unknown> } | { ok: false; error: string };

/** Reads an optional integer field: empty gives null; out of range or not an integer gives undefined. */
function optionalInt(raw: string, min: number, max: number): number | null | undefined {
  const text = raw.trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

/** Validates the form fields rendered by renderSpyFormFields and builds the request body. */
export function readSpyForm(form: HTMLFormElement, limits: SpyLimitsDto): SpyFormResult {
  const input = (name: string): HTMLInputElement | HTMLTextAreaElement =>
    form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement;
  const checked = (name: string): boolean => (input(name) as HTMLInputElement).checked;

  const title = input('title').value.trim();
  if (!title) return { ok: false, error: 'Введите название' };

  const maxPlayers = Number(input('max_players').value);
  if (!Number.isInteger(maxPlayers) || maxPlayers < limits.min_players || maxPlayers > limits.max_players) {
    return { ok: false, error: `Игроков должно быть от ${limits.min_players} до ${limits.max_players}` };
  }

  const spyCount = optionalInt(input('spy_count').value, 1, limits.max_players);
  if (spyCount === undefined) return { ok: false, error: 'Некорректное число шпионов' };
  if (spyCount !== null && spyCount >= maxPlayers) return { ok: false, error: 'Шпионов должно быть меньше, чем игроков' };

  const turnSeconds = optionalInt(input('turn_seconds').value, limits.turn_seconds.min, limits.turn_seconds.max);
  if (turnSeconds === undefined) return { ok: false, error: `Таймер хода: от ${limits.turn_seconds.min} до ${limits.turn_seconds.max} секунд` };

  const hintCycles = optionalInt(input('hint_after_cycles').value, limits.hint_cycles.min, limits.hint_cycles.max);
  if (hintCycles === undefined) return { ok: false, error: `Подсказка: после ${limits.hint_cycles.min}-${limits.hint_cycles.max} кругов` };

  const packs = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="pack"]:checked')).map((el) => el.value);
  if (packs.length === 0) return { ok: false, error: 'Выберите хотя бы один пакет локаций' };

  // datetime-local is the user's wall-clock time; send it as an absolute instant
  const startsRaw = input('starts_at').value;

  return {
    ok: true,
    body: {
      title,
      description: input('description').value,
      place: input('place').value,
      starts_at: startsRaw ? new Date(startsRaw).toISOString() : null,
      max_players: maxPlayers,
      spy_count: spyCount,
      double_agent: checked('double_agent'),
      mr_white: checked('mr_white'),
      packs,
      turn_seconds: turnSeconds,
      hint_after_cycles: hintCycles,
    },
  };
}
