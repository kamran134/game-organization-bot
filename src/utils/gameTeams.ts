import { Gender } from '../models/Gender';
import { ValidationError } from './errors';

export const MIN_TEAM_COUNT = 2;
export const MAX_TEAM_COUNT = 4;

/** Team colours, index = team number - 1. */
export const TEAM_EMOJI: readonly string[] = ['🔴', '🔵', '🟢', '🟡'];

/** `🔴 Команда 1`; without the emoji when the number is outside the supported range. */
export function teamLabel(team: number): string {
  const emoji = TEAM_EMOJI[team - 1];
  return emoji ? `${emoji} Команда ${team}` : `Команда ${team}`;
}

/** A player who can be put into a team. Gender is unknown for guests and for players who did not set it. */
export interface TeamCandidate {
  participant_id: number;
  gender?: Gender | null;
}

/** Throws ValidationError unless `value` is an integer within [MIN_TEAM_COUNT, MAX_TEAM_COUNT]. */
export function validateTeamCount(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < MIN_TEAM_COUNT || value > MAX_TEAM_COUNT) {
    throw new ValidationError('Invalid team count');
  }
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
 * Splits the players into `teamCount` teams, balancing both team sizes and gender.
 * Players are dealt bucket by bucket (female, male, unknown), each shuffled; every player goes to
 * the team with the fewest players of their own bucket, then the fewest players overall, then the
 * lowest number. Returns participant_id → team number (1-based).
 */
export function splitIntoTeams(
  candidates: readonly TeamCandidate[],
  teamCount: number,
  random: () => number = Math.random,
): Map<number, number> {
  validateTeamCount(teamCount);
  if (new Set(candidates.map((c) => c.participant_id)).size !== candidates.length) {
    throw new ValidationError('Duplicate players');
  }
  if (candidates.length < teamCount) throw new ValidationError('Not enough players');

  const buckets: TeamCandidate[][] = [[], [], []];
  for (const candidate of candidates) {
    if (candidate.gender === Gender.FEMALE) buckets[0].push(candidate);
    else if (candidate.gender === Gender.MALE) buckets[1].push(candidate);
    else buckets[2].push(candidate);
  }

  const teamSize: number[] = Array(teamCount).fill(0);
  const result = new Map<number, number>();
  for (const bucket of buckets) {
    const bucketSize: number[] = Array(teamCount).fill(0);
    for (const candidate of shuffle(bucket, random)) {
      let target = 0;
      for (let t = 1; t < teamCount; t++) {
        if (bucketSize[t] < bucketSize[target] || (bucketSize[t] === bucketSize[target] && teamSize[t] < teamSize[target])) {
          target = t;
        }
      }
      bucketSize[target] += 1;
      teamSize[target] += 1;
      result.set(candidate.participant_id, target + 1);
    }
  }
  return result;
}

/** Lays items out by team for display; array index = team number - 1. Items with no (or an out-of-range) team are unassigned. */
export function groupByTeam<T>(
  items: readonly T[],
  teamOf: (item: T) => number | null | undefined,
  teamCount: number,
): { teams: T[][]; unassigned: T[] } {
  const teams: T[][] = Array.from({ length: teamCount }, () => []);
  const unassigned: T[] = [];
  for (const item of items) {
    const team = teamOf(item);
    if (typeof team === 'number' && Number.isInteger(team) && team >= 1 && team <= teamCount) {
      teams[team - 1].push(item);
    } else {
      unassigned.push(item);
    }
  }
  return { teams, unassigned };
}
