/**
 * Role labels, descriptions, teams and layout rules for the Mafia pages.
 * Mirrors src/utils/mafiaDeal.ts: the client tsconfig cannot import server code, so this small map is duplicated.
 */

import type { MafiaRole, MafiaRoleCounts } from './types.js';

export type MafiaTeam = 'town' | 'mafia' | 'solo';

export const MAFIA_MIN_PLAYERS = 4;
export const MAFIA_MAX_PLAYERS = 30;

export const MAFIA_ROLE_ORDER: readonly MafiaRole[] = [
  'civilian', 'mafia', 'don', 'commissar', 'doctor', 'maniac', 'lover',
];

export const MAFIA_ROLE_NAME: Record<MafiaRole, string> = {
  civilian: 'Мирный житель',
  mafia: 'Мафия',
  don: 'Дон',
  commissar: 'Комиссар',
  doctor: 'Доктор',
  maniac: 'Маньяк',
  lover: 'Любовница',
};

export const MAFIA_ROLE_DESCRIPTION: Record<MafiaRole, string> = {
  civilian: 'Днём ищите мафию и голосуйте. Ночью спите.',
  mafia: 'Ночью вместе с командой выбираете жертву.',
  don: 'Глава мафии. Ночью ищет комиссара.',
  commissar: 'Ночью проверяет одного игрока.',
  doctor: 'Ночью спасает одного игрока.',
  maniac: 'Играет сам за себя. Ночью выбирает жертву.',
  lover: 'Ночью проводит время с игроком — тот пропускает ход.',
};

export const MAFIA_ROLE_TEAM: Record<MafiaRole, MafiaTeam> = {
  civilian: 'town',
  mafia: 'mafia',
  don: 'mafia',
  commissar: 'town',
  doctor: 'town',
  maniac: 'solo',
  lover: 'town',
};

export const MAFIA_TEAM_NAME: Record<MafiaTeam, string> = {
  town: 'Мирные',
  mafia: 'Мафия',
  solo: 'Одиночка',
};

export const MAFIA_TEAM_COLOR: Record<MafiaTeam, string> = {
  mafia: '#F09595',
  town: '#85B7EB',
  solo: '#AFA9EC',
};

/** Same rules as validateRoleCounts on the server; returns the message to show, or null when the layout is playable. */
export function validateCounts(counts: MafiaRoleCounts, n: number): string | null {
  const sum = MAFIA_ROLE_ORDER.reduce((acc, role) => acc + counts[role], 0);
  if (sum !== n) return `Ролей должно быть ровно ${n}`;

  const mafiaTeam = counts.mafia + counts.don;
  if (mafiaTeam < 1) return 'Нужна хотя бы одна мафия';
  for (const role of ['don', 'commissar', 'doctor', 'maniac', 'lover'] as const) {
    if (counts[role] > 1) return `${MAFIA_ROLE_NAME[role]} может быть только один`;
  }
  if (mafiaTeam * 2 >= n) return 'Мафия должна быть в меньшинстве';
  return null;
}
