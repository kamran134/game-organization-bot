import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TEAM_COUNT,
  MIN_TEAM_COUNT,
  TEAM_EMOJI,
  TeamCandidate,
  groupByTeam,
  splitIntoTeams,
  teamLabel,
  validateTeamCount,
} from '../../utils/gameTeams';
import { Gender } from '../../models/Gender';
import { ValidationError } from '../../utils/errors';

/** Small deterministic PRNG so shuffles are reproducible. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCandidates(female: number, male: number, unknown: number): TeamCandidate[] {
  const result: TeamCandidate[] = [];
  let id = 1;
  for (let i = 0; i < female; i++) result.push({ participant_id: id++, gender: Gender.FEMALE });
  for (let i = 0; i < male; i++) result.push({ participant_id: id++, gender: Gender.MALE });
  for (let i = 0; i < unknown; i++) result.push({ participant_id: id++, gender: i % 2 === 0 ? null : undefined });
  return result;
}

/** Per-team counts of the players matching `predicate`. */
function countPerTeam(
  candidates: TeamCandidate[],
  assignment: Map<number, number>,
  teamCount: number,
  predicate: (c: TeamCandidate) => boolean = () => true,
): number[] {
  const counts: number[] = Array(teamCount).fill(0);
  for (const c of candidates) {
    if (predicate(c)) counts[assignment.get(c.participant_id)! - 1] += 1;
  }
  return counts;
}

const spread = (counts: number[]): number => Math.max(...counts) - Math.min(...counts);

describe('splitIntoTeams', () => {
  test('12 players (4 f / 6 m / 2 unknown) into 2 teams: sizes 6/6, women 2/2, men 3/3', () => {
    const candidates = makeCandidates(4, 6, 2);
    const result = splitIntoTeams(candidates, 2, seeded(1));
    assert.deepEqual(countPerTeam(candidates, result, 2), [6, 6]);
    assert.deepEqual(countPerTeam(candidates, result, 2, (c) => c.gender === Gender.FEMALE), [2, 2]);
    assert.deepEqual(countPerTeam(candidates, result, 2, (c) => c.gender === Gender.MALE), [3, 3]);
  });

  test('10 players into 3 teams: sizes 4/3/3 in some order', () => {
    const candidates = makeCandidates(3, 5, 2);
    const result = splitIntoTeams(candidates, 3, seeded(2));
    const sizes = countPerTeam(candidates, result, 3);
    assert.deepEqual([...sizes].sort(), [3, 3, 4]);
    assert.ok(spread(sizes) <= 1);
  });

  test('players with unknown gender only: 7 players into 2 teams gives 4/3', () => {
    const candidates = makeCandidates(0, 0, 7);
    const result = splitIntoTeams(candidates, 2, seeded(3));
    assert.deepEqual(countPerTeam(candidates, result, 2), [4, 3]);
  });

  test('4 women into 4 teams: one each', () => {
    const candidates = makeCandidates(4, 0, 0);
    const result = splitIntoTeams(candidates, 4, seeded(4));
    assert.deepEqual(countPerTeam(candidates, result, 4), [1, 1, 1, 1]);
  });

  test('every candidate lands in exactly one team within range', () => {
    const candidates = makeCandidates(3, 4, 3);
    const result = splitIntoTeams(candidates, 3, seeded(5));
    assert.equal(result.size, candidates.length);
    for (const c of candidates) {
      const team = result.get(c.participant_id);
      assert.ok(team !== undefined && Number.isInteger(team) && team >= 1 && team <= 3);
    }
  });

  test('sizes and every gender stay balanced (spread <= 1) over many shapes and seeds', () => {
    for (let teamCount = MIN_TEAM_COUNT; teamCount <= MAX_TEAM_COUNT; teamCount++) {
      for (let female = 0; female <= 6; female++) {
        for (let male = 0; male <= 6; male++) {
          for (let unknown = 0; unknown <= 3; unknown++) {
            if (female + male + unknown < teamCount) continue;
            const candidates = makeCandidates(female, male, unknown);
            const result = splitIntoTeams(candidates, teamCount, seeded(female * 100 + male * 10 + unknown));
            const label = `teams=${teamCount} f=${female} m=${male} u=${unknown}`;
            assert.ok(spread(countPerTeam(candidates, result, teamCount)) <= 1, `size ${label}`);
            assert.ok(
              spread(countPerTeam(candidates, result, teamCount, (c) => c.gender === Gender.FEMALE)) <= 1,
              `female ${label}`,
            );
            assert.ok(
              spread(countPerTeam(candidates, result, teamCount, (c) => c.gender === Gender.MALE)) <= 1,
              `male ${label}`,
            );
          }
        }
      }
    }
  });

  test('the same seed gives the same result', () => {
    const candidates = makeCandidates(5, 5, 2);
    const first = splitIntoTeams(candidates, 3, seeded(42));
    const second = splitIntoTeams(candidates, 3, seeded(42));
    assert.deepEqual([...first.entries()], [...second.entries()]);
  });

  test('rejects an invalid team count', () => {
    const candidates = makeCandidates(0, 0, 8);
    for (const bad of [1, 5, 2.5, '2', null]) {
      assert.throws(() => splitIntoTeams(candidates, bad as unknown as number), ValidationError);
    }
  });

  test('rejects duplicate participants', () => {
    const candidates: TeamCandidate[] = [{ participant_id: 1 }, { participant_id: 1 }, { participant_id: 2 }];
    assert.throws(() => splitIntoTeams(candidates, 2), ValidationError);
  });

  test('rejects fewer players than teams', () => {
    assert.throws(() => splitIntoTeams(makeCandidates(0, 0, 2), 3), ValidationError);
    assert.throws(() => splitIntoTeams([], 2), ValidationError);
  });
});

describe('validateTeamCount', () => {
  test('accepts the supported range', () => {
    for (let n = MIN_TEAM_COUNT; n <= MAX_TEAM_COUNT; n++) validateTeamCount(n);
  });

  test('rejects everything else', () => {
    for (const bad of [0, 1, 5, 2.5, '2', null, undefined, NaN]) {
      assert.throws(() => validateTeamCount(bad), ValidationError);
    }
  });
});

describe('teamLabel', () => {
  test('has an emoji per supported team', () => {
    assert.equal(TEAM_EMOJI.length, MAX_TEAM_COUNT);
    assert.equal(teamLabel(1), '🔴 Команда 1');
    assert.equal(teamLabel(4), '🟡 Команда 4');
  });

  test('has no emoji outside the range', () => {
    assert.equal(teamLabel(0), 'Команда 0');
    assert.equal(teamLabel(5), 'Команда 5');
  });
});

describe('groupByTeam', () => {
  const items = [
    { name: 'a', team: 1 },
    { name: 'b', team: 3 },
    { name: 'c', team: null },
    { name: 'd' },
    { name: 'e', team: 1 },
  ] as Array<{ name: string; team?: number | null }>;

  test('lays items out by team and keeps the rest unassigned', () => {
    const { teams, unassigned } = groupByTeam(items, (i) => i.team, 3);
    assert.deepEqual(teams.map((t) => t.map((i) => i.name)), [['a', 'e'], [], ['b']]);
    assert.deepEqual(unassigned.map((i) => i.name), ['c', 'd']);
  });

  test('an out-of-range team counts as unassigned', () => {
    const { teams, unassigned } = groupByTeam(items, (i) => i.team, 2);
    assert.deepEqual(teams.map((t) => t.length), [2, 0]);
    assert.deepEqual(unassigned.map((i) => i.name), ['b', 'c', 'd']);
  });
});
