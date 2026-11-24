import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { deadUserIds, outcomeHint, summarizeLog, MafiaLogFact, MafiaLogPlayer } from '../../utils/mafiaLog';
import { MafiaLogPhase, MafiaLogType } from '../../models/MafiaLogEntry';
import { MafiaRole } from '../../models/MafiaRole';

const fact = (type: MafiaLogType, target: number | null, cycle = 1, round = 1): MafiaLogFact => ({
  round,
  cycle,
  phase: type === MafiaLogType.LYNCH ? MafiaLogPhase.DAY : MafiaLogPhase.NIGHT,
  type,
  target_user_id: target,
});

const roster = (...roles: MafiaRole[]): MafiaLogPlayer[] => roles.map((role, i) => ({ user_id: i + 1, role }));

describe('deadUserIds', () => {
  test('an empty log kills nobody', () => {
    assert.equal(deadUserIds([]).size, 0);
  });

  test('a kill without a heal kills', () => {
    assert.deepEqual([...deadUserIds([fact(MafiaLogType.KILL, 3)])], [3]);
  });

  test('a heal in the same round and cycle cancels the kill', () => {
    const dead = deadUserIds([fact(MafiaLogType.KILL, 3), fact(MafiaLogType.HEAL, 3)]);
    assert.equal(dead.size, 0);
  });

  test('the heal wins regardless of the order of entries', () => {
    const dead = deadUserIds([fact(MafiaLogType.HEAL, 3), fact(MafiaLogType.KILL, 3)]);
    assert.equal(dead.size, 0);
  });

  test('a heal cancels every kill of that player in the cycle (mafia and maniac alike)', () => {
    const dead = deadUserIds([fact(MafiaLogType.KILL, 3), fact(MafiaLogType.KILL, 3), fact(MafiaLogType.HEAL, 3)]);
    assert.equal(dead.size, 0);
  });

  test('a kill in cycle 1 is not saved by a heal in cycle 2', () => {
    const dead = deadUserIds([fact(MafiaLogType.KILL, 3, 1), fact(MafiaLogType.HEAL, 3, 2)]);
    assert.deepEqual([...dead], [3]);
  });

  test('a heal in another round does not save', () => {
    const dead = deadUserIds([fact(MafiaLogType.KILL, 3, 1, 2), fact(MafiaLogType.HEAL, 3, 1, 1)]);
    assert.deepEqual([...dead], [3]);
  });

  test('a heal of somebody else does not save', () => {
    const dead = deadUserIds([fact(MafiaLogType.KILL, 3), fact(MafiaLogType.HEAL, 4)]);
    assert.deepEqual([...dead], [3]);
  });

  test('a lynch always kills, even a player healed in the same cycle', () => {
    const dead = deadUserIds([fact(MafiaLogType.HEAL, 3), fact(MafiaLogType.LYNCH, 3)]);
    assert.deepEqual([...dead], [3]);
  });

  test('repeated entries about one player count the player once', () => {
    const dead = deadUserIds([
      fact(MafiaLogType.KILL, 3, 1), fact(MafiaLogType.KILL, 3, 2), fact(MafiaLogType.LYNCH, 3, 3),
    ]);
    assert.deepEqual([...dead], [3]);
  });

  test('block, check and note never affect life', () => {
    const dead = deadUserIds([fact(MafiaLogType.BLOCK, 3), fact(MafiaLogType.CHECK, 3), fact(MafiaLogType.NOTE, 3), fact(MafiaLogType.NOTE, null)]);
    assert.equal(dead.size, 0);
  });
});

describe('outcomeHint', () => {
  test('no mafia among the living: town wins', () => {
    assert.equal(outcomeHint({ alive: 3, mafia: 0, town: 3, solo: 0 }), 'town');
    assert.equal(outcomeHint({ alive: 0, mafia: 0, town: 0, solo: 0 }), 'town');
  });

  test('mafia equal to the rest of the living: mafia wins', () => {
    assert.equal(outcomeHint({ alive: 4, mafia: 2, town: 2, solo: 0 }), 'mafia');
    assert.equal(outcomeHint({ alive: 2, mafia: 1, town: 1, solo: 0 }), 'mafia');
  });

  test('mafia outnumbers the rest: mafia wins', () => {
    assert.equal(outcomeHint({ alive: 3, mafia: 2, town: 1, solo: 0 }), 'mafia');
  });

  test('one short of parity: no hint', () => {
    assert.equal(outcomeHint({ alive: 5, mafia: 2, town: 3, solo: 0 }), null);
  });

  test('a living solo player counts among the others', () => {
    assert.equal(outcomeHint({ alive: 4, mafia: 2, town: 1, solo: 1 }), 'mafia');
    assert.equal(outcomeHint({ alive: 5, mafia: 2, town: 1, solo: 2 }), null);
  });
});

describe('summarizeLog', () => {
  const players = roster(
    MafiaRole.DON, MafiaRole.MAFIA, MafiaRole.COMMISSAR, MafiaRole.DOCTOR, MafiaRole.MANIAC, MafiaRole.CIVILIAN, MafiaRole.CIVILIAN,
  );

  test('counts the living by team before anything happens', () => {
    const state = summarizeLog([], players);
    assert.deepEqual(state.counts, { alive: 7, mafia: 2, town: 4, solo: 1 });
    assert.deepEqual(state.alive, [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(state.dead, []);
    assert.equal(state.outcome, null);
  });

  test('moves the dead out of the counts and keeps the order of the players', () => {
    const state = summarizeLog([fact(MafiaLogType.KILL, 6), fact(MafiaLogType.LYNCH, 2), fact(MafiaLogType.KILL, 4), fact(MafiaLogType.HEAL, 4)], players);
    assert.deepEqual(state.dead, [2, 6]);
    assert.deepEqual(state.alive, [1, 3, 4, 5, 7]);
    assert.deepEqual(state.counts, { alive: 5, mafia: 1, town: 3, solo: 1 });
    assert.equal(state.outcome, null);
  });

  test('hints at a town win when the whole mafia is gone', () => {
    const state = summarizeLog([fact(MafiaLogType.LYNCH, 1), fact(MafiaLogType.LYNCH, 2)], players);
    assert.equal(state.outcome, 'town');
  });

  test('hints at a mafia win at parity', () => {
    const state = summarizeLog(
      [fact(MafiaLogType.KILL, 3), fact(MafiaLogType.KILL, 4), fact(MafiaLogType.KILL, 5), fact(MafiaLogType.KILL, 6)],
      players,
    );
    assert.deepEqual(state.counts, { alive: 3, mafia: 2, town: 1, solo: 0 });
    assert.equal(state.outcome, 'mafia');
  });

  test('ignores log targets who are not in the player list', () => {
    const state = summarizeLog([fact(MafiaLogType.KILL, 99)], players);
    assert.equal(state.counts.alive, 7);
  });

  test('a player without a role is alive but belongs to no team', () => {
    const state = summarizeLog([], [{ user_id: 1, role: null }, { user_id: 2, role: MafiaRole.MAFIA }]);
    assert.deepEqual(state.counts, { alive: 2, mafia: 1, town: 0, solo: 0 });
  });
});
