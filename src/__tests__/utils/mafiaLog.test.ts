import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canActAtNight, deadUserIds, deathPoints, LOG_TYPE_ROLES, gameOutcome, rolesLastNight, summarizeLog,
  MafiaLogFact, MafiaLogPlayer,
} from '../../utils/mafiaLog';
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

describe('gameOutcome', () => {
  test('no mafia and no solo player among the living: town wins', () => {
    assert.equal(gameOutcome({ alive: 3, mafia: 0, town: 3, solo: 0 }), 'town');
    assert.equal(gameOutcome({ alive: 0, mafia: 0, town: 0, solo: 0 }), 'town');
  });

  test('no mafia but town and a maniac both alive: the game goes on', () => {
    assert.equal(gameOutcome({ alive: 4, mafia: 0, town: 3, solo: 1 }), null);
  });

  test('only the maniac is left: solo wins', () => {
    assert.equal(gameOutcome({ alive: 1, mafia: 0, town: 0, solo: 1 }), 'solo');
    assert.equal(gameOutcome({ alive: 2, mafia: 0, town: 0, solo: 2 }), 'solo');
  });

  test('mafia equal to the rest of the living: mafia wins', () => {
    assert.equal(gameOutcome({ alive: 4, mafia: 2, town: 2, solo: 0 }), 'mafia');
    assert.equal(gameOutcome({ alive: 2, mafia: 1, town: 1, solo: 0 }), 'mafia');
  });

  test('mafia outnumbers the rest: mafia wins', () => {
    assert.equal(gameOutcome({ alive: 3, mafia: 2, town: 1, solo: 0 }), 'mafia');
  });

  test('one short of parity: no hint', () => {
    assert.equal(gameOutcome({ alive: 5, mafia: 2, town: 3, solo: 0 }), null);
  });

  test('a living solo player counts among the others', () => {
    assert.equal(gameOutcome({ alive: 4, mafia: 2, town: 1, solo: 1 }), 'mafia');
    assert.equal(gameOutcome({ alive: 5, mafia: 2, town: 1, solo: 2 }), null);
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

  test('no outcome while the maniac is alive even when the whole mafia is gone', () => {
    const state = summarizeLog([fact(MafiaLogType.LYNCH, 1), fact(MafiaLogType.LYNCH, 2)], players);
    assert.equal(state.counts.mafia, 0);
    assert.equal(state.outcome, null);
  });

  test('a town win once the mafia and the maniac are gone', () => {
    const state = summarizeLog([1, 2, 5].map((id) => fact(MafiaLogType.LYNCH, id)), players);
    assert.equal(state.outcome, 'town');
  });

  test('a maniac win when only the maniac is left', () => {
    const state = summarizeLog([1, 2, 3, 4, 6, 7].map((id) => fact(MafiaLogType.KILL, id)), players);
    assert.deepEqual(state.counts, { alive: 1, mafia: 0, town: 0, solo: 1 });
    assert.equal(state.outcome, 'solo');
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

const day = (type: MafiaLogType, target: number, cycle: number): MafiaLogFact => ({
  round: 1, cycle, phase: MafiaLogPhase.DAY, type, target_user_id: target,
});

describe('deathPoints', () => {
  test('a kill dies at night, a lynch at day, a healed kill not at all', () => {
    const points = deathPoints([
      fact(MafiaLogType.KILL, 1, 2),
      day(MafiaLogType.LYNCH, 2, 3),
      fact(MafiaLogType.KILL, 3, 1),
      fact(MafiaLogType.HEAL, 3, 1),
    ]);
    assert.deepEqual(points.get(1), { cycle: 2, phase: MafiaLogPhase.NIGHT });
    assert.deepEqual(points.get(2), { cycle: 3, phase: MafiaLogPhase.DAY });
    assert.equal(points.has(3), false);
  });

  test('the earliest point wins: by cycle, then night before day', () => {
    const points = deathPoints([
      day(MafiaLogType.LYNCH, 1, 2), fact(MafiaLogType.KILL, 1, 2),
      fact(MafiaLogType.KILL, 2, 3), day(MafiaLogType.LYNCH, 2, 1),
    ]);
    assert.deepEqual(points.get(1), { cycle: 2, phase: MafiaLogPhase.NIGHT });
    assert.deepEqual(points.get(2), { cycle: 1, phase: MafiaLogPhase.DAY });
  });

  test('a healed survivor of night 1 stays in the game and dies if killed in night 2', () => {
    const night1 = [fact(MafiaLogType.KILL, 3, 1), fact(MafiaLogType.HEAL, 3, 1)];
    assert.equal(deadUserIds(night1).has(3), false);
    assert.deepEqual(deathPoints([...night1, fact(MafiaLogType.KILL, 3, 2)]).get(3), { cycle: 2, phase: MafiaLogPhase.NIGHT });
    assert.equal(deadUserIds([...night1, fact(MafiaLogType.KILL, 3, 2), fact(MafiaLogType.HEAL, 3, 2)]).has(3), false);
  });
});

describe('LOG_TYPE_ROLES', () => {
  test('lists the acting roles and leaves lynch and note role-free', () => {
    assert.deepEqual(LOG_TYPE_ROLES[MafiaLogType.KILL], [MafiaRole.MAFIA, MafiaRole.DON, MafiaRole.MANIAC]);
    assert.deepEqual(LOG_TYPE_ROLES[MafiaLogType.HEAL], [MafiaRole.DOCTOR]);
    assert.deepEqual(LOG_TYPE_ROLES[MafiaLogType.CHECK], [MafiaRole.COMMISSAR, MafiaRole.DON]);
    assert.deepEqual(LOG_TYPE_ROLES[MafiaLogType.BLOCK], [MafiaRole.LOVER]);
    assert.equal(LOG_TYPE_ROLES[MafiaLogType.LYNCH], null);
    assert.equal(LOG_TYPE_ROLES[MafiaLogType.NOTE], null);
  });
});

describe('rolesLastNight / canActAtNight', () => {
  const players = roster(MafiaRole.MAFIA, MafiaRole.DOCTOR, MafiaRole.CIVILIAN, MafiaRole.MAFIA);

  test('only dealt roles get a key; living carriers mean no limit', () => {
    assert.deepEqual(rolesLastNight([], players), { [MafiaRole.MAFIA]: null, [MafiaRole.DOCTOR]: null, [MafiaRole.CIVILIAN]: null });
  });

  test('a role with all carriers dead is bounded by the latest death cycle', () => {
    const facts = [fact(MafiaLogType.KILL, 1, 2), day(MafiaLogType.LYNCH, 4, 3)];
    assert.equal(rolesLastNight(facts, players)[MafiaRole.MAFIA], 3);
    assert.equal(rolesLastNight([fact(MafiaLogType.KILL, 1, 2)], players)[MafiaRole.MAFIA], null);
    assert.equal(rolesLastNight([fact(MafiaLogType.KILL, 2, 2)], players)[MafiaRole.DOCTOR], 2);
  });

  test('a carrier killed in night N still acts in night N, but not in N+1; a lynch in day N likewise', () => {
    const killed = rolesLastNight([fact(MafiaLogType.KILL, 2, 2)], players);
    assert.equal(canActAtNight(killed, MafiaLogType.HEAL, 2), true);
    assert.equal(canActAtNight(killed, MafiaLogType.HEAL, 3), false);
    const lynched = rolesLastNight([day(MafiaLogType.LYNCH, 2, 2)], players);
    assert.equal(canActAtNight(lynched, MafiaLogType.HEAL, 2), true);
    assert.equal(canActAtNight(lynched, MafiaLogType.HEAL, 3), false);
  });

  test('deleting the death returns the action; a healed carrier is not dead', () => {
    assert.equal(canActAtNight(rolesLastNight([], players), MafiaLogType.HEAL, 9), true);
    const saved = [fact(MafiaLogType.KILL, 2, 1), fact(MafiaLogType.HEAL, 2, 1)];
    assert.equal(canActAtNight(rolesLastNight(saved, players), MafiaLogType.HEAL, 9), true);
  });

  test('actions of roles nobody got are unavailable; lynch and note always are', () => {
    const state = rolesLastNight([], players);
    assert.equal(canActAtNight(state, MafiaLogType.CHECK, 1), false);
    assert.equal(canActAtNight(state, MafiaLogType.BLOCK, 1), false);
    assert.equal(canActAtNight(state, MafiaLogType.KILL, 1), true);
    assert.equal(canActAtNight({}, MafiaLogType.LYNCH, 1), true);
    assert.equal(canActAtNight({}, MafiaLogType.NOTE, 1), true);
  });

  test('a don covers both kill and check', () => {
    const withDon = rolesLastNight([], roster(MafiaRole.DON));
    assert.equal(canActAtNight(withDon, MafiaLogType.CHECK, 1), true);
    assert.equal(canActAtNight(withDon, MafiaLogType.KILL, 1), true);
  });

  test('summarizeLog carries rolesLastNight', () => {
    const state = summarizeLog([fact(MafiaLogType.KILL, 2, 2)], players);
    assert.equal(state.rolesLastNight[MafiaRole.DOCTOR], 2);
  });
});
