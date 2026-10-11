import { Game } from '../../models/Game';
import { GameType } from '../../models/GameType';
import { Sport } from '../../models/Sport';
import { CreationData, CreationState } from '../../utils/CreationState';
import { formatDate } from '../../utils/helpers';
import { GameMessageBuilder } from '../ui/GameMessageBuilder';
import { KeyboardBuilder } from '../ui/KeyboardBuilder';
import { GameCreationValidator } from './GameCreationValidator';

const CURRENCY = process.env.CURRENCY_SYMBOL ?? '₼';
const REPLY_HINT = '⚠️ Ответьте (reply) на это сообщение!';

/** "No maximum" sentinel stored in games.max_participants. */
export const UNLIMITED_PARTICIPANTS = 999;

/** Steps that ask a plain question; the date and the location have their own prompts. */
export type AskStep = 'min_participants' | 'max_participants' | 'cost' | 'notes';

export type QuickParseResult =
  | { ok: false; error: string }
  | { ok: true; data: Partial<CreationData>; location?: { name: string; mapUrl?: string } };

/** Everything that differs between the game wizard and the training wizard. */
export interface CreationConfig {
  type: GameType;
  /** Steps after the date, in the order they are asked. */
  steps: ReadonlyArray<'location' | AskStep>;
  limits: {
    /** Lowest allowed min/max participants. */
    floor: number;
    maxCeiling: number;
  };
  /** "-" is accepted as "unlimited" for max participants and as "free" for the cost. */
  dashShortcuts: boolean;
  startTitle: string;
  sportLabel(sport: Sport): string;
  sportChosen(sport: Sport): string;
  /** The question for each plain step, shown after the previous step was answered. */
  ask: Record<AskStep, (state: CreationState) => string>;
  /** Echo of an answered step, prepended to the next question. */
  ack: Partial<Record<'date' | 'max_participants' | 'min_participants' | 'cost', (state: CreationState) => string>>;
  /** Echo of a location picked with a button, prepended to the next question. */
  locationChosen?(name: string): string;
  customLocationPrompt: string;
  /** Overrides for the validator's error text where the wizards word them differently. */
  errors: {
    invalidMin?: (max: number) => string;
    invalidMax?: string;
    invalidCost?: string;
  };
  notYours: string;
  cancelled: string;
  createFailedToast: string;
  createFailed: string;
  createdToast: string;
  parseQuick(parts: string[]): QuickParseResult;
  buildConfirmation(state: CreationState): string;
  confirmationKeyboard(userId: number): ReturnType<typeof KeyboardBuilder.createGameConfirmationKeyboard>;
  buildCreated(game: Game): string;
}

/** Part `index` of a quick line, or undefined when it is missing, empty or "-". */
function optionalPart(parts: string[], index: number): string | undefined {
  const part = parts[index];
  return part !== undefined && part.length > 0 && part !== '-' ? part : undefined;
}

function fail(error: string): QuickParseResult {
  return { ok: false, error };
}

function parseGameQuick(parts: string[]): QuickParseResult {
  const date = GameCreationValidator.parseDate(parts[0]);
  if (!date.success) return fail(date.error!);

  const participants = GameCreationValidator.parseParticipantsRange(parts[1]);
  if (!participants.success) return fail(participants.error!);

  let cost: number | undefined;
  const costText = optionalPart(parts, 2);
  if (costText !== undefined) {
    const costResult = GameCreationValidator.validateCost(costText);
    if (!costResult.success) return fail('❌ Неверный формат стоимости (третья часть). Укажите число или "-".');
    cost = costResult.value;
  }

  const notes = optionalPart(parts, 3);
  if (notes !== undefined) {
    const notesResult = GameCreationValidator.validateNotes(notes);
    if (!notesResult.success) return fail(notesResult.error!);
  }

  const data: Partial<CreationData> = {
    gameDate: date.date,
    maxParticipants: participants.max,
    minParticipants: participants.min,
    cost,
    notes,
  };

  const locationName = optionalPart(parts, 4);
  if (locationName === undefined) return { ok: true, data };
  if (!GameCreationValidator.validateLocation(locationName).success) {
    return fail('❌ Слишком короткое название места (пятая часть).');
  }
  return { ok: true, data, location: { name: locationName, mapUrl: optionalPart(parts, 5) } };
}

function parseTrainingQuick(parts: string[]): QuickParseResult {
  const date = GameCreationValidator.parseDate(parts[0]);
  if (!date.success) return fail(date.error!);

  let max = UNLIMITED_PARTICIPANTS;
  const maxText = optionalPart(parts, 2);
  if (maxText !== undefined) {
    const maxValue = parseInt(maxText);
    if (isNaN(maxValue) || maxValue < 1) return fail('❌ Макс. участников должно быть числом >= 1');
    max = maxValue;
  }

  const min = GameCreationValidator.validateMinParticipants(parts[1], max, TRAINING.limits.floor);
  if (!min.success) return fail('❌ Ошибка в мин. участниках: ' + min.error);

  let cost = 0;
  const costText = optionalPart(parts, 3);
  if (costText !== undefined) {
    const costResult = GameCreationValidator.validateCost(costText);
    if (!costResult.success) return fail('❌ Стоимость должна быть числом >= 0');
    cost = costResult.value ?? 0;
  }

  const notes = optionalPart(parts, 4);
  if (notes !== undefined) {
    const notesResult = GameCreationValidator.validateNotes(notes);
    if (!notesResult.success) return fail(notesResult.error!);
  }

  const data: Partial<CreationData> = {
    gameDate: date.date,
    maxParticipants: max,
    minParticipants: min.value,
    cost,
    notes,
  };

  const locationName = optionalPart(parts, 5);
  return locationName === undefined ? { ok: true, data } : { ok: true, data, location: { name: locationName } };
}

export const GAME: CreationConfig = {
  type: GameType.GAME,
  steps: ['max_participants', 'min_participants', 'cost', 'notes', 'location'],
  limits: { floor: 2, maxCeiling: 100 },
  dashShortcuts: false,
  startTitle: '🎮 Создание новой игры',
  sportLabel: (sport) => `${sport.emoji} ${sport.name}`,
  sportChosen: (sport) =>
    `✅ Выбран: ${sport.emoji} ${sport.name}\n\n` +
    '🚀 БЫСТРЫЙ СПОСОБ (одной строкой через /):\n' +
    '📝 дата время / мин-макс / стоимость / заметки / локация\n\n' +
    'Пример:\n' +
    '10.02 18:00 / 5-10 / 500 / Приходите за 15 минут / Спортзал Олимп\n' +
    'Или короче: 10.02 18:00 / 10 / 0 / - / Зал\n\n' +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
    '📋 ПОШАГОВЫЙ СПОСОБ:\n' +
    '📅 Введите дату и время игры\n' +
    '⚠️ ВАЖНО: Ответьте (reply) на это сообщение!\n\n' +
    'Формат: ДД.ММ.ГГГГ ЧЧ:ММ\n' +
    'Примеры: 15.02.2026 19:00 или 15.02 19:00',
  ask: {
    max_participants: () =>
      `👥 Введите максимальное количество участников:\n${REPLY_HINT}\n\nНапример: 10`,
    min_participants: (state) =>
      `👤 Введите минимальное количество участников:\n${REPLY_HINT}\n\n(от 2 до ${state.data.maxParticipants})`,
    cost: () =>
      `💰 Введите стоимость участия (${CURRENCY}):\n${REPLY_HINT}\n\nИли отправьте 0, если игра бесплатная`,
    notes: () =>
      `📝 Добавьте дополнительные заметки или отправьте "-" чтобы пропустить:\n${REPLY_HINT}\n\n` +
      'Например: "Своя форма", "Принести мяч" и т.д.',
  },
  ack: {
    date: (state) => `✅ Дата: ${formatDate(state.data.gameDate!)}\n\n`,
    max_participants: (state) => `✅ Максимум участников: ${state.data.maxParticipants}\n\n`,
    min_participants: (state) => `✅ Минимум участников: ${state.data.minParticipants}\n\n`,
    cost: (state) =>
      state.data.cost ? `✅ Стоимость: ${state.data.cost} ${CURRENCY}\n\n` : '✅ Игра бесплатная\n\n',
  },
  customLocationPrompt:
    `📍 Введите название места:\n${REPLY_HINT}\n\nНапример: "Стадион Центральный" или "ул. Ленина, 15"`,
  errors: {},
  notYours: '❌ Это не ваша игра',
  cancelled: '❌ Создание игры отменено.',
  createFailedToast: '❌ Ошибка создания игры',
  createFailed: '❌ Не удалось создать игру. Попробуйте ещё раз.',
  createdToast: '✅ Игра создана!',
  parseQuick: parseGameQuick,
  buildConfirmation: (state) => GameMessageBuilder.formatGameConfirmation(state),
  confirmationKeyboard: (userId) => KeyboardBuilder.createGameConfirmationKeyboard(userId),
  buildCreated: (game) => GameMessageBuilder.formatGameCreatedMessage(game),
};

export const TRAINING: CreationConfig = {
  type: GameType.TRAINING,
  steps: ['location', 'min_participants', 'max_participants', 'cost', 'notes'],
  limits: { floor: 1, maxCeiling: 1000 },
  dashShortcuts: true,
  startTitle: '🏋️ Создание тренировки',
  sportLabel: (sport) => sport.name,
  sportChosen: (sport) =>
    `✅ Вид спорта: ${sport.emoji} ${sport.name}\n\n` +
    '🚀 БЫСТРЫЙ СПОСОБ (одной строкой через /):\n' +
    '📝 дата время / мин / макс ("-" = безлимит) / стоимость ("-" = бесплатно) / заметки / локация\n\n' +
    'Пример:\n' +
    '10.02 18:00 / 3 / - / - / Кроссфит / Зал\n' +
    'Или короче: 10.02 18:00 / 5 / 15 / 0 / - / Спортзал\n\n' +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
    '📋 ПОШАГОВЫЙ СПОСОБ:\n' +
    '📅 Введите дату и время тренировки\n' +
    '⚠️ Ответьте (reply) на это сообщение!\n\n' +
    'Формат: ДД.ММ ЧЧ:ММ\n' +
    'Примеры: 15.02 18:00 или 15.02.2026 18:00',
  ask: {
    min_participants: () =>
      `👥 Введите минимальное количество участников:\n${REPLY_HINT}\n\nНапример: 5\n` +
      '(если наберётся меньше, тренировка может быть отменена)',
    max_participants: () =>
      `👥 Введите максимальное количество участников или "-" для безлимита:\n${REPLY_HINT}\n\nНапример: 20 или -`,
    cost: () =>
      `💰 Введите стоимость участия или "-" для бесплатной тренировки:\n${REPLY_HINT}\n\nНапример: 500 или 0 или -`,
    notes: () =>
      `📝 Добавьте заметки к тренировке или "-" для пропуска:\n${REPLY_HINT}\n\n` +
      'Например: "Приходите за 10 минут, с собой воду"',
  },
  ack: {},
  locationChosen: (name) => `✅ Место: ${name}\n\n`,
  customLocationPrompt:
    `📍 Введите место проведения тренировки:\n${REPLY_HINT}\n\nНапример: "Стадион Центральный" или "ул. Ленина, 15"`,
  errors: {
    invalidMin: () => '❌ Укажите число от 1 до 1000',
    invalidMax: '❌ Укажите число от 1 до 1000 или "-" для безлимита',
    invalidCost: '❌ Укажите число (стоимость) или "-" для бесплатной тренировки',
  },
  notYours: '❌ Это не ваша тренировка',
  cancelled: '❌ Создание тренировки отменено',
  createFailedToast: '❌ Ошибка создания тренировки',
  createFailed: '❌ Не удалось создать тренировку. Попробуйте ещё раз.',
  createdToast: '✅ Тренировка создана!',
  parseQuick: parseTrainingQuick,
  buildConfirmation: (state) =>
    GameMessageBuilder.buildConfirmationMessage(
      state.data.sportName!,
      state.data.gameDate!,
      state.data.locationName!,
      state.data.minParticipants!,
      state.data.maxParticipants!,
      state.data.cost,
      state.data.notes,
      '🏋️ ТРЕНИРОВКА'
    ),
  confirmationKeyboard: (userId) => KeyboardBuilder.createTrainingConfirmationKeyboard(userId),
  buildCreated: (game) => `✅ Тренировка создана!\n\n${GameMessageBuilder.buildTrainingCard(game)}`,
};

export const CREATION_CONFIGS: Record<GameType, CreationConfig> = {
  [GameType.GAME]: GAME,
  [GameType.TRAINING]: TRAINING,
};
