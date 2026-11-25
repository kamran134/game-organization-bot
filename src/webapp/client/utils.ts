import { ApiError } from './api.js';

/**
 * Escapes a value for safe insertion into innerHTML.
 * Prevents XSS when rendering server-supplied data.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formats an ISO date string for Russian locale display.
 */
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Server error strings that should be shown to the user in Russian. */
const KNOWN_ERRORS: Record<string, string> = {
  'Forbidden': 'Нет доступа к этой группе',
  'Registration locked': 'Запись закрыта',
  'Admin only': 'Только для администраторов',
  'You are not a member of this group': 'Вы не участник этой группы',
  'Cannot remove an admin': 'Нельзя удалить администратора',
  'Game cancelled': 'Игра отменена',
  'Game completed': 'Игра уже завершена',
  'Game not active': 'Игра уже не активна',
  'Event not found': 'Событие не найдено',
  'Already joined': 'Вы уже участвуете',
  'Not joined': 'Вы не участвуете',
  'Draw already done': 'Жеребьёвка уже проведена',
  'Draw not done': 'Жеребьёвка ещё не проведена',
  'Event finished': 'Событие завершено',
  'Not enough participants': 'Недостаточно участников (нужно минимум 3)',
  'Title is required': 'Введите название',
  'Title is too long': 'Название слишком длинное (до 100 символов)',
  'Description is too long': 'Описание слишком длинное (до 500 символов)',
  'Invalid description': 'Некорректное описание',
  'Budget is too long': 'Бюджет слишком длинный (до 50 символов)',
  'Invalid budget': 'Некорректный бюджет',
  'Invalid exchange date': 'Некорректная дата обмена',
  'Wishlist is too long': 'Пожелания слишком длинные (до 1000 символов)',
  'Invalid wishlist': 'Некорректные пожелания',
  'Host cannot play': 'Ведущий не играет',
  'Event is full': 'Мест нет',
  'Registration closed': 'Запись закрыта',
  'Roles already dealt': 'Роли уже розданы',
  'Roles not dealt': 'Роли ещё не розданы',
  'Not enough players': 'Недостаточно игроков (нужно минимум 4)',
  'Host only': 'Только для ведущего',
  'Host or admin only': 'Только для ведущего или админа',
  'Invalid max players': 'Число игроков должно быть от 4 до 30',
  'Invalid date': 'Некорректная дата',
  'Invalid place': 'Некорректное место',
  'Place is too long': 'Место слишком длинное (до 200 символов)',
  'Invalid roles': 'Некорректный набор ролей',
  'Roles must add up to the number of players': 'Число ролей должно совпадать с числом игроков',
  'At least one mafia is required': 'Нужна хотя бы одна мафия',
  'Too many of a unique role': 'Эта роль может быть только одна',
  'Only group admins can manage locations': 'Локациями управляют только админы группы',
  'Global locations cannot be changed': 'Общие локации менять нельзя',
  'Location already exists': 'Такая локация уже есть',
  'Name is required': 'Введите название',
  'Name is too long': 'Название слишком длинное (до 100 символов)',
  'No locations to play': 'В выбранных пакетах нет локаций',
  'Not your turn': 'Сейчас не ваш ход',
  'Cannot vote for yourself': 'За себя голосовать нельзя',
  'Vote for one of the leaders': 'Голосуйте за одного из лидеров',
  'Only a living spy can guess': 'Угадывать может только живой шпион',
  'Guess is required': 'Введите название локации',
  'Guess is too long': 'Слишком длинный ответ',
  'Invalid spy count': 'Некорректное число шпионов',
  'Invalid turn time': 'Таймер хода: от 15 до 300 секунд',
  'Invalid hint cycles': 'Подсказка: после 1-10 кругов',
  'Invalid packs': 'Выберите хотя бы один пакет локаций',
  'Fewer places than joined players': 'Мест меньше, чем уже записалось игроков',
  'Round is not finished': 'Партия ещё не завершена',
  'Round in progress': 'Идёт партия: сейчас это недоступно',
  'Registration is open': 'Набор ещё открыт',
  'Wrong round state': 'Партия сейчас в другом состоянии',
  'Round finished': 'Партия уже завершена',
  'No round': 'Партия ещё не начата',
  'Not in the round': 'Вы не участвуете в этой партии',
  'Mafia must be a minority': 'Мафия должна быть в меньшинстве',
};

/**
 * Extracts a human-readable message from an unknown error value.
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const known = KNOWN_ERRORS[err.message];
    if (known) return known;
    if (err instanceof ApiError && err.status === 403) return 'Нет доступа к этой группе';
    return err.message;
  }
  if (typeof err === 'string') return err;
  return 'Неизвестная ошибка';
}

const SANTA_STATUS_LABELS: Record<string, string> = {
  registration: 'Запись идёт',
  drawn: 'Пары распределены',
  finished: 'Завершён',
};

export function santaStatusLabel(status: string): string {
  return SANTA_STATUS_LABELS[status] ?? status;
}

/** Display name of a Secret Santa person: full name, falling back to the username. */
export function santaPersonName(p: { first_name?: string; last_name?: string; username?: string | null }): string {
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.username || '—';
}

/** 'YYYY-MM-DD' → 'DD.MM.YYYY'. */
export function formatSantaDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}

const MAFIA_STATUS_LABELS: Record<string, string> = {
  registration: 'Запись идёт',
  closed: 'Запись закрыта',
  dealt: 'Роли розданы',
  finished: 'Завершён',
};

export function mafiaStatusLabel(status: string): string {
  return MAFIA_STATUS_LABELS[status] ?? status;
}

const SPY_STATUS_LABELS: Record<string, string> = {
  registration: 'Запись идёт',
  closed: 'Запись закрыта',
  in_progress: 'Идёт игра',
  finished: 'Завершён',
};

export function spyStatusLabel(status: string): string {
  return SPY_STATUS_LABELS[status] ?? status;
}
