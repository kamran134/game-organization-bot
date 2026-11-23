import { MafiaRole, MafiaTeam } from '../models/MafiaRole';
import { ValidationError } from './errors';

export { MafiaRole };
export type { MafiaTeam };

export const MAFIA_MIN_PLAYERS = 4;
export const MAFIA_MAX_PLAYERS = 30;

export type RoleCounts = Record<MafiaRole, number>;

/** Display order of the roles (host layout, role editor). */
export const MAFIA_ROLE_ORDER: readonly MafiaRole[] = [
  MafiaRole.CIVILIAN,
  MafiaRole.MAFIA,
  MafiaRole.DON,
  MafiaRole.COMMISSAR,
  MafiaRole.DOCTOR,
  MafiaRole.MANIAC,
  MafiaRole.LOVER,
];

export const MAFIA_ROLE_TEAM: Record<MafiaRole, MafiaTeam> = {
  [MafiaRole.CIVILIAN]: 'town',
  [MafiaRole.MAFIA]: 'mafia',
  [MafiaRole.DON]: 'mafia',
  [MafiaRole.COMMISSAR]: 'town',
  [MafiaRole.DOCTOR]: 'town',
  [MafiaRole.MANIAC]: 'solo',
  [MafiaRole.LOVER]: 'town',
};

export const MAFIA_ROLE_NAME: Record<MafiaRole, string> = {
  [MafiaRole.CIVILIAN]: 'Мирный житель',
  [MafiaRole.MAFIA]: 'Мафия',
  [MafiaRole.DON]: 'Дон',
  [MafiaRole.COMMISSAR]: 'Комиссар',
  [MafiaRole.DOCTOR]: 'Доктор',
  [MafiaRole.MANIAC]: 'Маньяк',
  [MafiaRole.LOVER]: 'Любовница',
};

export const MAFIA_ROLE_DESCRIPTION: Record<MafiaRole, string> = {
  [MafiaRole.CIVILIAN]: 'Днём ищите мафию и голосуйте. Ночью спите.',
  [MafiaRole.MAFIA]: 'Ночью вместе с командой выбираете жертву.',
  [MafiaRole.DON]: 'Глава мафии. Ночью ищет комиссара.',
  [MafiaRole.COMMISSAR]: 'Ночью проверяет одного игрока.',
  [MafiaRole.DOCTOR]: 'Ночью спасает одного игрока.',
  [MafiaRole.MANIAC]: 'Играет сам за себя. Ночью выбирает жертву.',
  [MafiaRole.LOVER]: 'Ночью проводит время с игроком — тот пропускает ход.',
};

export const MAFIA_TEAM_NAME: Record<MafiaTeam, string> = {
  town: 'Мирные',
  mafia: 'Мафия',
  solo: 'Одиночка',
};

/** Number of card images per role in public/img/mafia/{role}-{variant}.webp. */
export const MAFIA_CARD_VARIANTS: Record<MafiaRole, number> = {
  [MafiaRole.CIVILIAN]: 11,
  [MafiaRole.MAFIA]: 4,
  [MafiaRole.DON]: 3,
  [MafiaRole.COMMISSAR]: 3,
  [MafiaRole.DOCTOR]: 3,
  [MafiaRole.MANIAC]: 2,
  [MafiaRole.LOVER]: 3,
};

export interface DealtRole {
  role: MafiaRole;
  seat: number | null;
  variant: number;
}

export function isMafiaTeamRole(role: MafiaRole): boolean {
  return MAFIA_ROLE_TEAM[role] === 'mafia';
}

/** Classic layout for n players: a third are mafia (one of them the don from 2 up), commissar from 5, doctor from 7. */
export function suggestRoleCounts(n: number): RoleCounts {
  const mafiaTeam = Math.max(1, Math.floor(n / 3));
  const don = mafiaTeam >= 2 ? 1 : 0;
  const mafia = mafiaTeam - don;
  const commissar = n >= 5 ? 1 : 0;
  const doctor = n >= 7 ? 1 : 0;
  return {
    [MafiaRole.CIVILIAN]: Math.max(0, n - mafia - don - commissar - doctor),
    [MafiaRole.MAFIA]: mafia,
    [MafiaRole.DON]: don,
    [MafiaRole.COMMISSAR]: commissar,
    [MafiaRole.DOCTOR]: doctor,
    [MafiaRole.MANIAC]: 0,
    [MafiaRole.LOVER]: 0,
  };
}

/** Throws ValidationError unless `counts` is a playable layout for exactly n players. */
export function validateRoleCounts(counts: unknown, n: number): asserts counts is RoleCounts {
  if (typeof counts !== 'object' || counts === null || Array.isArray(counts)) {
    throw new ValidationError('Invalid roles');
  }
  const record = counts as Record<string, unknown>;
  const known = new Set<string>(MAFIA_ROLE_ORDER);
  for (const key of Object.keys(record)) {
    if (!known.has(key)) throw new ValidationError('Invalid roles');
  }
  for (const role of MAFIA_ROLE_ORDER) {
    const value = record[role];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new ValidationError('Invalid roles');
    }
  }

  const typed = record as RoleCounts;
  const sum = MAFIA_ROLE_ORDER.reduce((acc, role) => acc + typed[role], 0);
  if (sum !== n) throw new ValidationError('Roles must add up to the number of players');

  const mafiaTeam = typed[MafiaRole.MAFIA] + typed[MafiaRole.DON];
  if (mafiaTeam < 1) throw new ValidationError('At least one mafia is required');
  for (const role of [MafiaRole.DON, MafiaRole.COMMISSAR, MafiaRole.DOCTOR, MafiaRole.MANIAC, MafiaRole.LOVER]) {
    if (typed[role] > 1) throw new ValidationError('Too many of a unique role');
  }
  if (mafiaTeam * 2 >= n) throw new ValidationError('Mafia must be a minority');
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Deals roles (and optionally seats) to the players; same-role players get different card images while variants last. */
export function dealRoles(
  userIds: readonly number[],
  counts: RoleCounts,
  options: { assignSeats: boolean },
  random: () => number = Math.random,
): Map<number, DealtRole> {
  if (new Set(userIds).size !== userIds.length) throw new ValidationError('Duplicate players');
  const n = userIds.length;
  if (n < MAFIA_MIN_PLAYERS || n > MAFIA_MAX_PLAYERS) throw new ValidationError('Wrong number of players');
  validateRoleCounts(counts, n);

  const roles = shuffle(
    MAFIA_ROLE_ORDER.flatMap((role) => Array<MafiaRole>(counts[role]).fill(role)),
    random,
  );
  const seats = options.assignSeats
    ? shuffle(Array.from({ length: n }, (_, i) => i + 1), random)
    : null;

  const variantQueues = new Map<MafiaRole, number[]>();
  const nextVariant = new Map<MafiaRole, number>();
  for (const role of MAFIA_ROLE_ORDER) {
    variantQueues.set(role, shuffle(Array.from({ length: MAFIA_CARD_VARIANTS[role] }, (_, i) => i + 1), random));
    nextVariant.set(role, 0);
  }

  const result = new Map<number, DealtRole>();
  userIds.forEach((userId, i) => {
    const role = roles[i];
    const queue = variantQueues.get(role)!;
    const index = nextVariant.get(role)!;
    nextVariant.set(role, index + 1);
    result.set(userId, { role, seat: seats ? seats[i] : null, variant: queue[index % queue.length] });
  });
  return result;
}
