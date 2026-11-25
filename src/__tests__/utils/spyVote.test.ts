import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { SpyRole } from '../../models/SpyRole';
import { ValidationError } from '../../utils/errors';
import { SpyBallot, resolveVote, tallyVotes } from '../../utils/spyVote';

const ballot = (voterId: number, targetId: number): SpyBallot => ({ voterId, targetId });

describe('tallyVotes', () => {
  test('no ballots: nothing counted, not complete, no leaders', () => {
    const tally = tallyVotes([], [1, 2, 3]);
    assert.deepEqual(tally, { counts: [], leaders: [], complete: false });
  });

  test('partial voting is not complete', () => {
    const tally = tallyVotes([ballot(1, 3), ballot(2, 3)], [1, 2, 3]);
    assert.equal(tally.complete, false);
    assert.deepEqual(tally.counts, [{ userId: 3, votes: 2 }]);
    assert.deepEqual(tally.leaders, [3]);
  });

  test('complete once every living player has voted', () => {
    const tally = tallyVotes([ballot(1, 3), ballot(2, 3), ballot(3, 1)], [1, 2, 3]);
    assert.equal(tally.complete, true);
    assert.deepEqual(tally.leaders, [3]);
    assert.deepEqual(tally.counts, [
      { userId: 3, votes: 2 },
      { userId: 1, votes: 1 },
    ]);
  });

  test('a tie lists every leader', () => {
    const tally = tallyVotes([ballot(1, 2), ballot(2, 1), ballot(3, 4), ballot(4, 3)], [1, 2, 3, 4]);
    assert.equal(tally.complete, true);
    assert.deepEqual(tally.leaders, [1, 2, 3, 4]);
  });

  test('a two-way tie ignores the trailing candidate', () => {
    const tally = tallyVotes(
      [ballot(1, 2), ballot(2, 3), ballot(3, 2), ballot(4, 3), ballot(5, 1)],
      [1, 2, 3, 4, 5],
    );
    assert.deepEqual(tally.leaders, [2, 3]);
  });

  test('ballots of eliminated players are ignored and do not block completion', () => {
    const tally = tallyVotes([ballot(1, 2), ballot(2, 1), ballot(9, 1)], [1, 2]);
    assert.equal(tally.complete, true);
    assert.deepEqual(tally.counts, [
      { userId: 1, votes: 1 },
      { userId: 2, votes: 1 },
    ]);
  });

  test('a re-vote replaces the earlier ballot', () => {
    const tally = tallyVotes([ballot(1, 2), ballot(1, 3), ballot(2, 3)], [1, 2, 3]);
    assert.deepEqual(tally.counts, [{ userId: 3, votes: 2 }]);
    assert.equal(tally.complete, false);
  });

  test('no living players is never complete', () => {
    assert.equal(tallyVotes([], []).complete, false);
  });
});

describe('resolveVote', () => {
  const roles: Record<number, SpyRole> = {
    1: SpyRole.CIVILIAN,
    2: SpyRole.SPY,
    3: SpyRole.DOUBLE_AGENT,
    4: SpyRole.MR_WHITE,
  };
  const roleOf = (id: number): SpyRole => roles[id];

  test('exposing a spy is a hit for the town', () => {
    assert.deepEqual(resolveVote([2], roleOf), { outcome: 'town', reason: 'vote_hit', accusedId: 2 });
  });

  test('exposing the double agent is a hit for the town', () => {
    assert.deepEqual(resolveVote([3], roleOf), { outcome: 'town', reason: 'vote_hit', accusedId: 3 });
  });

  test('exposing a civilian is a miss', () => {
    assert.deepEqual(resolveVote([1], roleOf), { outcome: 'spies', reason: 'vote_miss', accusedId: 1 });
  });

  test('exposing Mr. White is a miss', () => {
    assert.deepEqual(resolveVote([4], roleOf), { outcome: 'spies', reason: 'vote_miss', accusedId: 4 });
  });

  test('several leaders are a tie, whoever they are', () => {
    assert.equal(resolveVote([2, 3], roleOf), 'tie');
    assert.equal(resolveVote([1, 2], roleOf), 'tie');
  });

  test('no leaders is rejected', () => {
    assert.throws(() => resolveVote([], roleOf), ValidationError);
  });
});
