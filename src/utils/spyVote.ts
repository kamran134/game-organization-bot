import { SpyRole } from '../models/SpyRole';
import { ValidationError } from './errors';

export interface SpyBallot {
  voterId: number;
  targetId: number;
}

export interface SpyTally {
  /** Targets that got at least one vote, most voted first. */
  counts: Array<{ userId: number; votes: number }>;
  /** Everyone sharing the top score; more than one means a tie. */
  leaders: number[];
  /** True once every living player has voted. */
  complete: boolean;
}

/** Counts the ballots of living voters; a repeated voter counts once, the last ballot wins. */
export function tallyVotes(ballots: SpyBallot[], aliveIds: number[]): SpyTally {
  const alive = new Set(aliveIds);
  const targetOf = new Map<number, number>();
  for (const ballot of ballots) {
    if (alive.has(ballot.voterId)) targetOf.set(ballot.voterId, ballot.targetId);
  }

  const votes = new Map<number, number>();
  for (const targetId of targetOf.values()) votes.set(targetId, (votes.get(targetId) ?? 0) + 1);

  const counts = [...votes.entries()]
    .map(([userId, count]) => ({ userId, votes: count }))
    .sort((a, b) => b.votes - a.votes || a.userId - b.userId);
  const top = counts.length > 0 ? counts[0].votes : 0;
  const leaders = counts.filter((c) => c.votes === top).map((c) => c.userId);

  return { counts, leaders, complete: alive.size > 0 && targetOf.size === alive.size };
}

export type SpyVoteResolution =
  | { outcome: 'town' | 'spies'; reason: 'vote_hit' | 'vote_miss'; accusedId: number }
  | 'tie';

/**
 * Decides the round from the vote leaders. Exposing a spy or the double agent is a hit for the
 * town; exposing a civilian or Mr. White (formally not a spy) is a miss. Several leaders = tie.
 */
export function resolveVote(leaders: number[], roleOf: (userId: number) => SpyRole): SpyVoteResolution {
  if (leaders.length === 0) throw new ValidationError('No votes to resolve');
  if (leaders.length > 1) return 'tie';

  const accusedId = leaders[0];
  const role = roleOf(accusedId);
  const hit = role === SpyRole.SPY || role === SpyRole.DOUBLE_AGENT;
  return hit
    ? { outcome: 'town', reason: 'vote_hit', accusedId }
    : { outcome: 'spies', reason: 'vote_miss', accusedId };
}
