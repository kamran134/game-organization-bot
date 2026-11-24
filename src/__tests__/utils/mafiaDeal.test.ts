import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  MAFIA_MAX_PLAYERS,
  MAFIA_MIN_PLAYERS,
  MAFIA_CARD_GENDER,
  MAFIA_CARD_VARIANTS,
  MAFIA_ROLE_NAME,
  MAFIA_ROLE_NAME_FEMALE,
  MAFIA_ROLE_ORDER,
  MafiaRole,
  RoleCounts,
  dealRoles,
  mafiaRoleName,
  suggestRoleCounts,
  validateRoleCounts,
} from '../../utils/mafiaDeal';
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

function counts(partial: Partial<RoleCounts>): RoleCounts {
  return {
    civilian: 0, mafia: 0, don: 0, commissar: 0, doctor: 0, maniac: 0, lover: 0,
    ...partial,
  };
}

const ids = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

describe('suggestRoleCounts', () => {
  const table: Array<[number, Partial<RoleCounts>]> = [
    [4, { mafia: 1, civilian: 3 }],
    [5, { mafia: 1, commissar: 1, civilian: 3 }],
    [6, { don: 1, mafia: 1, commissar: 1, civilian: 3 }],
    [7, { don: 1, mafia: 1, commissar: 1, doctor: 1, civilian: 3 }],
    [10, { don: 1, mafia: 2, commissar: 1, doctor: 1, civilian: 5 }],
    [12, { don: 1, mafia: 3, commissar: 1, doctor: 1, civilian: 6 }],
  ];
  for (const [n, expected] of table) {
    test(`n = ${n}`, () => {
      assert.deepEqual(suggestRoleCounts(n), counts(expected));
    });
  }

  test('every suggestion is valid for the whole supported range', () => {
    for (let n = MAFIA_MIN_PLAYERS; n <= MAFIA_MAX_PLAYERS; n++) {
      validateRoleCounts(suggestRoleCounts(n), n);
    }
  });
});

describe('validateRoleCounts', () => {
  const ok = counts({ mafia: 1, civilian: 3 });

  test('accepts a playable layout', () => {
    validateRoleCounts(ok, 4);
  });

  test('rejects a missing, unknown or non-integer value', () => {
    const missing: Record<string, number> = { ...ok };
    delete missing['lover'];
    assert.throws(() => validateRoleCounts(missing, 4), ValidationError);
    assert.throws(() => validateRoleCounts({ ...ok, witch: 1 }, 4), ValidationError);
    assert.throws(() => validateRoleCounts({ ...ok, civilian: 2.5 }, 4), ValidationError);
    assert.throws(() => validateRoleCounts({ ...ok, civilian: '3' }, 4), ValidationError);
    assert.throws(() => validateRoleCounts({ ...ok, civilian: 4, doctor: -1 }, 4), ValidationError);
    assert.throws(() => validateRoleCounts(null, 4), ValidationError);
  });

  test('rejects a sum that differs from the player count', () => {
    assert.throws(() => validateRoleCounts(ok, 5), ValidationError);
    assert.throws(() => validateRoleCounts(counts({ mafia: 1, civilian: 4 }), 4), ValidationError);
  });

  test('requires at least one mafia or don', () => {
    assert.throws(() => validateRoleCounts(counts({ civilian: 4 }), 4), ValidationError);
    validateRoleCounts(counts({ don: 1, civilian: 3 }), 4);
  });

  test('don, commissar, doctor, maniac and lover are at most one each', () => {
    for (const role of ['don', 'commissar', 'doctor', 'maniac', 'lover'] as const) {
      const c = counts({ mafia: 1, civilian: 6, [role]: 2 });
      assert.throws(() => validateRoleCounts(c, 9), ValidationError, role);
    }
  });

  test('the mafia team must be a strict minority', () => {
    assert.throws(() => validateRoleCounts(counts({ mafia: 2, civilian: 2 }), 4), ValidationError);
    assert.throws(() => validateRoleCounts(counts({ mafia: 2, don: 1, civilian: 3 }), 6), ValidationError);
    validateRoleCounts(counts({ mafia: 2, don: 1, civilian: 4 }), 7);
  });
});

describe('dealRoles', () => {
  const layout = suggestRoleCounts(10);

  test('hands out exactly the requested counts', () => {
    const result = dealRoles(ids(10), layout, { assignSeats: false });
    assert.equal(result.size, 10);
    const tally = counts({});
    for (const { role } of result.values()) tally[role]++;
    assert.deepEqual(tally, layout);
  });

  test('seats are a permutation of 1..n, or null when off', () => {
    const seated = dealRoles(ids(10), layout, { assignSeats: true });
    assert.deepEqual([...seated.values()].map((d) => d.seat).sort((a, b) => a! - b!), ids(10));

    const unseated = dealRoles(ids(10), layout, { assignSeats: false });
    assert.ok([...unseated.values()].every((d) => d.seat === null));
  });

  test('players with the same role get different images while variants last', () => {
    const c = counts({ mafia: 1, civilian: 5 });
    const result = dealRoles(ids(6), c, { assignSeats: false }, seeded(7));
    const civilians = [...result.values()].filter((d) => d.role === MafiaRole.CIVILIAN);
    assert.equal(civilians.length, 5);
    assert.equal(new Set(civilians.map((d) => d.variant)).size, 5);
    assert.ok(civilians.every((d) => d.variant <= MAFIA_CARD_VARIANTS[MafiaRole.CIVILIAN]));
  });

  test('variants stay within the role image count and wrap around when exhausted', () => {
    const result = dealRoles(ids(12), suggestRoleCounts(12), { assignSeats: false }, seeded(3));
    for (const { role, variant } of result.values()) {
      assert.ok(variant >= 1 && variant <= MAFIA_CARD_VARIANTS[role], `${role} ${variant}`);
    }
    // More players of one role than that role has images: the queue wraps, so every image is
    // handed out before any of them repeats, and none repeats more often than it has to.
    const images = MAFIA_CARD_VARIANTS[MafiaRole.CIVILIAN];
    const civilians = images + 2;
    const wrapped = dealRoles(
      ids(civilians + 2),
      counts({ mafia: 2, civilian: civilians }),
      { assignSeats: false },
      seeded(3),
    );
    const used = [...wrapped.values()].filter((d) => d.role === MafiaRole.CIVILIAN).map((d) => d.variant);
    assert.equal(new Set(used).size, images);
    for (const variant of new Set(used)) {
      assert.ok(used.filter((v) => v === variant).length <= Math.ceil(civilians / images));
    }
  });

  test('a seeded random makes the deal deterministic', () => {
    const a = dealRoles(ids(10), layout, { assignSeats: true }, seeded(42));
    const b = dealRoles(ids(10), layout, { assignSeats: true }, seeded(42));
    assert.deepEqual([...a.entries()], [...b.entries()]);

    const c = dealRoles(ids(10), layout, { assignSeats: true }, seeded(43));
    assert.notDeepEqual([...a.entries()], [...c.entries()]);
  });

  test('rejects duplicate ids and out-of-range player counts', () => {
    assert.throws(() => dealRoles([1, 2, 3, 3], suggestRoleCounts(4), { assignSeats: false }), ValidationError);
    assert.throws(() => dealRoles(ids(3), counts({ mafia: 1, civilian: 2 }), { assignSeats: false }), ValidationError);
    const big = MAFIA_MAX_PLAYERS + 1;
    assert.throws(() => dealRoles(ids(big), suggestRoleCounts(big), { assignSeats: false }), ValidationError);
  });

  test('rejects counts that do not fit the players', () => {
    assert.throws(() => dealRoles(ids(5), suggestRoleCounts(4), { assignSeats: false }), ValidationError);
  });
});

describe('MAFIA_CARD_VARIANTS', () => {
  const cardsDir = path.join(__dirname, '../../../public/img/mafia');

  test('every declared variant has a card image, and no image is unreachable', () => {
    const declared = new Set(
      Object.entries(MAFIA_CARD_VARIANTS).flatMap(([role, n]) =>
        Array.from({ length: n }, (_, i) => `${role}-${i + 1}.webp`),
      ),
    );
    const onDisk = new Set(fs.readdirSync(cardsDir).filter((f) => f.endsWith('.webp')));

    assert.deepEqual([...declared].filter((f) => !onDisk.has(f)), [], 'missing card images');
    assert.deepEqual([...onDisk].filter((f) => !declared.has(f)), [], 'images no deal can hand out');
  });

  test('the client mirror of the counts matches this one', () => {
    // The client bundle cannot import server code, so mafiaRoles.ts keeps its own copy.
    // Read it as text rather than importing an ES module into these CommonJS tests.
    const source = fs.readFileSync(path.join(__dirname, '../../webapp/client/mafiaRoles.ts'), 'utf8');
    const block = /MAFIA_CARD_VARIANTS: Record<MafiaRole, number> = \{([^}]*)\}/.exec(source);
    assert.ok(block, 'MAFIA_CARD_VARIANTS not found in the client mafiaRoles.ts');

    const mirror: Record<string, number> = {};
    for (const [, role, n] of block[1]!.matchAll(/(\w+):\s*(\d+)/g)) mirror[role!] = Number(n);

    assert.deepEqual(mirror, { ...MAFIA_CARD_VARIANTS });
  });
});

describe('mafiaRoleName', () => {
  test('a female player gets the feminine form where the role has one', () => {
    assert.equal(mafiaRoleName(MafiaRole.CIVILIAN, Gender.FEMALE), 'Мирная жительница');
    assert.equal(mafiaRoleName(MafiaRole.MANIAC, Gender.FEMALE), 'Маньячка');
    assert.equal(mafiaRoleName(MafiaRole.LOVER, Gender.FEMALE), 'Любовница');
  });

  test('roles without a feminine form keep the base name for everyone', () => {
    for (const role of MAFIA_ROLE_ORDER) {
      if (MAFIA_ROLE_NAME_FEMALE[role]) continue;
      assert.equal(mafiaRoleName(role, Gender.FEMALE), MAFIA_ROLE_NAME[role], role);
    }
  });

  test('male, unset and unknown gender all get the base name', () => {
    for (const role of MAFIA_ROLE_ORDER) {
      for (const gender of [Gender.MALE, null, undefined]) {
        assert.equal(mafiaRoleName(role, gender), MAFIA_ROLE_NAME[role], `${role} / ${gender}`);
      }
    }
  });

  test('the base map carries the masculine form', () => {
    assert.equal(MAFIA_ROLE_NAME[MafiaRole.LOVER], 'Любовник');
    assert.equal(MAFIA_ROLE_NAME[MafiaRole.CIVILIAN], 'Мирный житель');
  });
});

describe('dealRoles card gender', () => {
  const genders = (entries: Array<[number, Gender | null]>): Map<number, Gender | null> => new Map(entries);
  const allOf = (n: number, gender: Gender | null): Map<number, Gender | null> =>
    genders(ids(n).map((id) => [id, gender]));

  test('players get a card drawn in their own gender while such cards last', () => {
    const femaleCivilians = MAFIA_CARD_GENDER[MafiaRole.CIVILIAN].filter((g) => g === 'female').length;
    const n = femaleCivilians + 1; // the civilians plus one mafia
    const result = dealRoles(
      ids(n),
      counts({ mafia: 1, civilian: femaleCivilians }),
      { assignSeats: false, genders: allOf(n, Gender.FEMALE) },
      seeded(11),
    );

    for (const dealt of result.values()) {
      if (dealt.role !== MafiaRole.CIVILIAN) continue;
      assert.equal(MAFIA_CARD_GENDER[MafiaRole.CIVILIAN][dealt.variant - 1], 'female');
    }
  });

  test('a neutral card fits a player of any gender, a card of the other gender does not', () => {
    for (const gender of [Gender.MALE, Gender.FEMALE]) {
      const seen = new Set<number>();
      for (let seed = 0; seed < 40; seed++) {
        const result = dealRoles(
          ids(5),
          counts({ mafia: 1, maniac: 1, civilian: 3 }),
          { assignSeats: false, genders: allOf(5, gender) },
          seeded(seed),
        );
        for (const dealt of result.values()) {
          if (dealt.role === MafiaRole.MANIAC) seen.add(dealt.variant);
        }
      }

      const fitting = MAFIA_CARD_GENDER[MafiaRole.MANIAC]
        .map((cardGender, i) => ({ cardGender, variant: i + 1 }))
        .filter((c) => c.cardGender === 'neutral' || c.cardGender === gender)
        .map((c) => c.variant);

      assert.ok(fitting.length >= 2, 'this test needs both a neutral and a same-gender maniac card');
      assert.deepEqual([...seen].sort(), [...fitting].sort(), gender);
    }
  });

  test('falls back to any card when the role has none in the player gender', () => {
    // Every lover card is female art, so a male lover must still get one of them
    assert.ok(MAFIA_CARD_GENDER[MafiaRole.LOVER].every((g) => g === 'female'));

    const result = dealRoles(
      ids(5),
      counts({ mafia: 1, lover: 1, civilian: 3 }),
      { assignSeats: false, genders: allOf(5, Gender.MALE) },
      seeded(5),
    );
    const lover = [...result.values()].find((d) => d.role === MafiaRole.LOVER)!;
    assert.ok(lover.variant >= 1 && lover.variant <= MAFIA_CARD_VARIANTS[MafiaRole.LOVER]);
  });

  test('more same-gender players than fitting cards still get different cards', () => {
    const femaleCards = MAFIA_CARD_GENDER[MafiaRole.CIVILIAN].filter((g) => g === 'female').length;
    const civilians = femaleCards + 2;
    const n = civilians + 2;
    const result = dealRoles(
      ids(n),
      counts({ mafia: 2, civilian: civilians }),
      { assignSeats: false, genders: allOf(n, Gender.FEMALE) },
      seeded(13),
    );

    const variants = [...result.values()].filter((d) => d.role === MafiaRole.CIVILIAN).map((d) => d.variant);
    assert.equal(new Set(variants).size, civilians, 'cards within one deal stay unique');
    const female = variants.filter((v) => MAFIA_CARD_GENDER[MafiaRole.CIVILIAN][v - 1] === 'female');
    assert.equal(female.length, femaleCards, 'every fitting card is used before an unfitting one');
  });

  test('players without a known gender are dealt exactly as before', () => {
    const layout = suggestRoleCounts(10);
    const withoutGenders = dealRoles(ids(10), layout, { assignSeats: true }, seeded(42));
    const withNulls = dealRoles(ids(10), layout, { assignSeats: true, genders: allOf(10, null) }, seeded(42));

    assert.deepEqual([...withoutGenders.entries()], [...withNulls.entries()]);
  });

  test('a gender map that covers only some players is enough', () => {
    const result = dealRoles(
      ids(6),
      counts({ mafia: 1, civilian: 5 }),
      { assignSeats: false, genders: genders([[1, Gender.FEMALE]]) },
      seeded(2),
    );

    assert.equal(result.size, 6);
  });
});

describe('MAFIA_CARD_GENDER', () => {
  const CLIENT_MIRROR = path.join(__dirname, '../../webapp/client/mafiaRoles.ts');

  test('declares exactly one gender per card image of every role', () => {
    for (const role of MAFIA_ROLE_ORDER) {
      assert.equal(MAFIA_CARD_GENDER[role].length, MAFIA_CARD_VARIANTS[role], role);
      for (const value of MAFIA_CARD_GENDER[role]) {
        assert.ok(['male', 'female', 'neutral'].includes(value), `${role}: ${value}`);
      }
    }
    assert.deepEqual(Object.keys(MAFIA_CARD_GENDER).sort(), [...MAFIA_ROLE_ORDER].sort());
  });

  test('the client mirror of the card genders matches this one', () => {
    const source = fs.readFileSync(CLIENT_MIRROR, 'utf8');
    const block = /MAFIA_CARD_GENDER: Record<MafiaRole, readonly CardGender\[\]> = \{([^}]*)\}/.exec(source);
    assert.ok(block, 'MAFIA_CARD_GENDER not found in the client mafiaRoles.ts');

    const mirror: Record<string, string[]> = {};
    for (const [, role, list] of block[1]!.matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
      mirror[role!] = [...list!.matchAll(/'(\w+)'/g)].map(([, value]) => value!);
    }

    assert.deepEqual(
      mirror,
      Object.fromEntries(Object.entries(MAFIA_CARD_GENDER).map(([role, list]) => [role, [...list]])),
    );
  });

  test('the client mirror of the role names matches this one', () => {
    const source = fs.readFileSync(CLIENT_MIRROR, 'utf8');

    const readMap = (name: string, type: string): Record<string, string> => {
      const block = new RegExp(`${name}: ${type} = \\{([^}]*)\\}`).exec(source);
      assert.ok(block, `${name} not found in the client mafiaRoles.ts`);
      return Object.fromEntries(
        [...block[1]!.matchAll(/(\w+):\s*'([^']*)'/g)].map(([, role, value]) => [role!, value!]),
      );
    };

    assert.deepEqual(readMap('MAFIA_ROLE_NAME', 'Record<MafiaRole, string>'), { ...MAFIA_ROLE_NAME });
    assert.deepEqual(
      readMap('MAFIA_ROLE_NAME_FEMALE', 'Partial<Record<MafiaRole, string>>'),
      { ...MAFIA_ROLE_NAME_FEMALE },
    );
  });
});
