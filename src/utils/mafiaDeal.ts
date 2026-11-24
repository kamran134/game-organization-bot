import { Gender } from '../models/Gender';
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
  [MafiaRole.LOVER]: 'Любовник',
};

/** Roles whose name has a feminine form; the rest fall back to MAFIA_ROLE_NAME. */
export const MAFIA_ROLE_NAME_FEMALE: Partial<Record<MafiaRole, string>> = {
  [MafiaRole.CIVILIAN]: 'Мирная жительница',
  [MafiaRole.MANIAC]: 'Маньячка',
  [MafiaRole.LOVER]: 'Любовница',
};

/** Role name for a player: the feminine form only for a known female player. */
export function mafiaRoleName(role: MafiaRole, gender?: Gender | null): string {
  return (gender === Gender.FEMALE ? MAFIA_ROLE_NAME_FEMALE[role] : undefined) ?? MAFIA_ROLE_NAME[role];
}

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
  [MafiaRole.CIVILIAN]: 10,
  [MafiaRole.MAFIA]: 7,
  [MafiaRole.DON]: 6,
  [MafiaRole.COMMISSAR]: 5,
  [MafiaRole.DOCTOR]: 3,
  [MafiaRole.MANIAC]: 3,
  [MafiaRole.LOVER]: 3,
};

/** Gender of the character on a card; 'neutral' fits any player. */
export type CardGender = 'male' | 'female' | 'neutral';

/**
 * Gender of the character drawn on each card, index = variant - 1, classified by looking at
 * every image in public/img/mafia. Mirrored in src/webapp/client/mafiaRoles.ts; the guard test
 * in src/__tests__/utils/mafiaDeal.test.ts keeps both copies in step with MAFIA_CARD_VARIANTS.
 */
export const MAFIA_CARD_GENDER: Record<MafiaRole, readonly CardGender[]> = {
  [MafiaRole.CIVILIAN]: ['female', 'male', 'male', 'female', 'female', 'male', 'male', 'female', 'female', 'male'],
  [MafiaRole.MAFIA]: ['male', 'female', 'male', 'female', 'male', 'male', 'male'],
  [MafiaRole.DON]: ['male', 'male', 'female', 'male', 'female', 'female'],
  [MafiaRole.COMMISSAR]: ['male', 'male', 'male', 'female', 'female'],
  [MafiaRole.DOCTOR]: ['male', 'female', 'male'],
  [MafiaRole.MANIAC]: ['neutral', 'male', 'female'],
  [MafiaRole.LOVER]: ['female', 'female', 'female'],
};

/** A card fits a player when it was drawn genderless or in the player's own gender. */
export function cardFitsGender(card: CardGender, gender?: Gender | null): boolean {
  return card === 'neutral' || !gender || card === gender;
}

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

/**
 * Deals roles (and optionally seats) to the players; same-role players get different card images
 * while variants last, and each player gets a card drawn in their own gender where one is free.
 * `options.genders` may be partial — a player with no known gender fits any card.
 */
export function dealRoles(
  userIds: readonly number[],
  counts: RoleCounts,
  options: { assignSeats: boolean; genders?: ReadonlyMap<number, Gender | null | undefined> },
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

  // Unused card variants per role, in a random order; refilled once a role runs out of them
  const freeVariants = new Map<MafiaRole, number[]>();
  const shuffledVariants = (role: MafiaRole): number[] =>
    shuffle(Array.from({ length: MAFIA_CARD_VARIANTS[role] }, (_, i) => i + 1), random);
  for (const role of MAFIA_ROLE_ORDER) freeVariants.set(role, shuffledVariants(role));

  /** The first unused variant drawn in the player's gender, or — when there is none — any unused one. */
  const takeVariant = (role: MafiaRole, gender?: Gender | null): number => {
    let free = freeVariants.get(role)!;
    if (free.length === 0) {
      free = shuffledVariants(role);
      freeVariants.set(role, free);
    }
    const fitting = free.findIndex((variant) => cardFitsGender(MAFIA_CARD_GENDER[role][variant - 1], gender));
    const [variant] = free.splice(fitting >= 0 ? fitting : 0, 1);
    return variant;
  };

  const result = new Map<number, DealtRole>();
  userIds.forEach((userId, i) => {
    const role = roles[i];
    result.set(userId, {
      role,
      seat: seats ? seats[i] : null,
      variant: takeVariant(role, options.genders?.get(userId)),
    });
  });
  return result;
}
