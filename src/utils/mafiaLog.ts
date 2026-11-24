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

/** A hint for the host only: the evening is never finished automatically. */
export type MafiaOutcomeHint = 'town' | 'mafia' | null;

export interface MafiaLogState {
  /** User ids, in the order of the given players. */
  alive: number[];
  dead: number[];
  counts: MafiaLogCounts;
  outcome: MafiaOutcomeHint;
}

/**
 * Who is dead according to the log. A `lynch` always kills. A `kill` kills unless there is a `heal`
 * of the same player in the same round and cycle.
 *
 * Deliberate simplification: a `heal` cancels ANY `kill` of its cycle, whoever the killer was
 * (mafia or maniac). Tables differ on whether the doctor can save from the maniac, so we use one
 * simple deterministic model; the host can always delete an entry to correct the outcome.
 * `block`, `check` and `note` never affect life.
 */
export function deadUserIds(facts: MafiaLogFact[]): Set<number> {
  const healed = new Set<string>();
  for (const f of facts) {
    if (f.type === MafiaLogType.HEAL && f.target_user_id != null) {
      healed.add(`${f.round}:${f.cycle}:${f.target_user_id}`);
    }
  }

  const dead = new Set<number>();
  for (const f of facts) {
    if (f.target_user_id == null) continue;
    if (f.type === MafiaLogType.LYNCH) {
      dead.add(f.target_user_id);
    } else if (f.type === MafiaLogType.KILL && !healed.has(`${f.round}:${f.cycle}:${f.target_user_id}`)) {
      dead.add(f.target_user_id);
    }
  }
  return dead;
}

/** No mafia left → town wins; mafia not outnumbered by the rest of the living → mafia wins; otherwise no hint. */
export function outcomeHint(counts: MafiaLogCounts): MafiaOutcomeHint {
  if (counts.mafia === 0) return 'town';
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
  return { alive, dead, counts, outcome: outcomeHint(counts) };
}
