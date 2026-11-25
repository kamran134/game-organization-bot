import { MafiaRole } from '../models/MafiaRole';
import { MafiaLogPhase, MafiaLogType } from '../models/MafiaLogEntry';
import { MAFIA_ROLE_TEAM } from './mafiaDeal';

/** The part of a log entry the rules care about. */
export interface MafiaLogFact {
  round: number;
  cycle: number;
  phase: MafiaLogPhase;
  type: MafiaLogType;
  target_user_id?: number | null;
}

export interface MafiaLogPlayer {
  user_id: number;
  role: MafiaRole | null;
}

export interface MafiaLogCounts {
  alive: number;
  mafia: number;
  town: number;
  solo: number;
}

/** The result of a game: the winning side, `solo` = the lone maniac, `null` = the game goes on. */
export type MafiaOutcome = 'town' | 'mafia' | 'solo' | null;

export interface MafiaLogState {
  /** User ids, in the order of the given players. */
  alive: number[];
  dead: number[];
  counts: MafiaLogCounts;
  outcome: MafiaOutcome;
  rolesLastNight: MafiaRolesLastNight;
}

/** When a player died: the night or the day of a cycle. */
export interface MafiaDeath {
  cycle: number;
  phase: MafiaLogPhase;
}

/** Whether `a` happened strictly before `b`: by cycle first, within a cycle the night comes before the day. */
function diedBefore(a: MafiaDeath, b: MafiaDeath): boolean {
  if (a.cycle !== b.cycle) return a.cycle < b.cycle;
  return a.phase === MafiaLogPhase.NIGHT && b.phase !== MafiaLogPhase.NIGHT;
}

/**
 * The earliest deadly point of every player who is dead according to the log. A `lynch` kills in the day
 * of its cycle. A `kill` kills in the night of its cycle unless there is a `heal` of the same player in the
 * same round and cycle.
 *
 * Deliberate simplification: a `heal` cancels ANY `kill` of its cycle, whoever the killer was
 * (mafia or maniac). Tables differ on whether the doctor can save from the maniac, so we use one
 * simple deterministic model; the host can always delete an entry to correct the outcome.
 * `block`, `check` and `note` never affect life.
 */
export function deathPoints(facts: MafiaLogFact[]): Map<number, MafiaDeath> {
  const healed = new Set<string>();
  for (const f of facts) {
    if (f.type === MafiaLogType.HEAL && f.target_user_id != null) {
      healed.add(`${f.round}:${f.cycle}:${f.target_user_id}`);
    }
  }

  const points = new Map<number, MafiaDeath>();
  const record = (userId: number, death: MafiaDeath): void => {
    const known = points.get(userId);
    if (!known || diedBefore(death, known)) points.set(userId, death);
  };
  for (const f of facts) {
    if (f.target_user_id == null) continue;
    if (f.type === MafiaLogType.LYNCH) {
      record(f.target_user_id, { cycle: f.cycle, phase: MafiaLogPhase.DAY });
    } else if (f.type === MafiaLogType.KILL && !healed.has(`${f.round}:${f.cycle}:${f.target_user_id}`)) {
      record(f.target_user_id, { cycle: f.cycle, phase: MafiaLogPhase.NIGHT });
    }
  }
  return points;
}

/** Who is dead according to the log; see {@link deathPoints} for the rules. */
export function deadUserIds(facts: MafiaLogFact[]): Set<number> {
  return new Set(deathPoints(facts).keys());
}

/** Roles that perform an entry type; `null` = not tied to a role, always available. */
export const LOG_TYPE_ROLES: Record<MafiaLogType, MafiaRole[] | null> = {
  [MafiaLogType.KILL]: [MafiaRole.MAFIA, MafiaRole.DON, MafiaRole.MANIAC],
  [MafiaLogType.HEAL]: [MafiaRole.DOCTOR],
  // The commissar checks a role, the don looks for the commissar.
  [MafiaLogType.CHECK]: [MafiaRole.COMMISSAR, MafiaRole.DON],
  [MafiaLogType.BLOCK]: [MafiaRole.LOVER],
  [MafiaLogType.LYNCH]: null,
  [MafiaLogType.NOTE]: null,
};

/** Per dealt role: the last cycle whose night it can still act in, `null` = no limit (a carrier is alive). */
export type MafiaRolesLastNight = Partial<Record<MafiaRole, number | null>>;

/**
 * Only roles somebody got at the deal get a key. Night actions are simultaneous, so a carrier who died
 * in the night or the day of cycle N still acted in night N: the bound is the death cycle itself.
 */
export function rolesLastNight(facts: MafiaLogFact[], players: MafiaLogPlayer[]): MafiaRolesLastNight {
  const deaths = deathPoints(facts);
  const result: MafiaRolesLastNight = {};
  for (const p of players) {
    if (!p.role) continue;
    const death = deaths.get(p.user_id);
    const bound = death ? death.cycle : null;
    const known = result[p.role];
    if (known === undefined) {
      result[p.role] = bound;
    } else if (known !== null) {
      result[p.role] = bound === null ? null : Math.max(known, bound);
    }
  }
  return result;
}

/** Whether an entry of this type may be offered for the night of `cycle` given who is still around. */
export function canActAtNight(lastNight: MafiaRolesLastNight, type: MafiaLogType, cycle: number): boolean {
  const roles = LOG_TYPE_ROLES[type];
  if (roles === null) return true;
  return roles.some((role) => {
    const bound = lastNight[role];
    return bound !== undefined && (bound === null || cycle <= bound);
  });
}

/**
 * The result of the game according to the log, checked in this order:
 * no mafia and no solo player → town; no mafia and no town, a solo player left → solo;
 * no mafia but town and solo both alive → the game goes on; mafia not outnumbered by the rest of the
 * living → mafia; otherwise the game goes on.
 *
 * A decided game accepts only notes (see `MafiaService.addLogEntry`), but the evening is never finished
 * automatically: the host does it by hand. Deleting a log entry may reopen the game.
 */
export function gameOutcome(counts: MafiaLogCounts): MafiaOutcome {
  if (counts.mafia === 0) {
    if (counts.solo === 0) return 'town';
    return counts.town === 0 ? 'solo' : null;
  }
  if (counts.mafia >= counts.alive - counts.mafia) return 'mafia';
  return null;
}

/** Alive / dead split and per-team counts of the living. A player without a role counts only as alive. */
export function summarizeLog(facts: MafiaLogFact[], players: MafiaLogPlayer[]): MafiaLogState {
  const deadIds = deadUserIds(facts);
  const alive: number[] = [];
  const dead: number[] = [];
  const counts: MafiaLogCounts = { alive: 0, mafia: 0, town: 0, solo: 0 };

  for (const p of players) {
    if (deadIds.has(p.user_id)) {
      dead.push(p.user_id);
      continue;
    }
    alive.push(p.user_id);
    counts.alive += 1;
    if (p.role) counts[MAFIA_ROLE_TEAM[p.role]] += 1;
  }
  return { alive, dead, counts, outcome: gameOutcome(counts), rolesLastNight: rolesLastNight(facts, players) };
}
