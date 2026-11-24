import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GameParticipant, ParticipationStatus } from '../../models/GameParticipant';
import { User } from '../../models/User';
import {
  formatParticipantsList,
  formatMention,
  formatMembersMentions,
  formatTeamsInline,
  formatTeamsList,
  participantName,
} from '../../bot/ui/formatters';
import { GroupMember } from '../../models/GroupMember';

function makeParticipant(
  status: ParticipationStatus,
  opts: { username?: string; first_name?: string; guest_name?: string } = {}
): GameParticipant {
  const p = new GameParticipant();
  p.participation_status = status;
  p.joined_at = new Date('2026-01-01T00:00:00Z');
  if (opts.guest_name) {
    p.guest_name = opts.guest_name;
  } else {
    const u = new User();
    u.username = opts.username;
    u.first_name = opts.first_name ?? 'Player';
    p.user = u;
  }
  return p;
}

// ---------------------------------------------------------------------------
// formatParticipantsList
// ---------------------------------------------------------------------------
describe('formatParticipantsList', () => {
  test('returns placeholder when list is empty', () => {
    assert.match(formatParticipantsList([]), /никто не записался/);
  });

  test('confirmed section appears before maybe section', () => {
    const confirmed = makeParticipant(ParticipationStatus.CONFIRMED, { first_name: 'A' });
    const maybe = makeParticipant(ParticipationStatus.MAYBE, { first_name: 'B' });
    const result = formatParticipantsList([maybe, confirmed]);
    assert.ok(result.indexOf('✅') < result.indexOf('❓'));
  });

  test('guests section is present', () => {
    const guest = makeParticipant(ParticipationStatus.GUEST, { guest_name: 'Гость' });
    assert.match(formatParticipantsList([guest]), /👤 Гости/);
  });

  test('summary line contains total count', () => {
    const p1 = makeParticipant(ParticipationStatus.CONFIRMED, { first_name: 'A' });
    const p2 = makeParticipant(ParticipationStatus.CONFIRMED, { first_name: 'B' });
    const p3 = makeParticipant(ParticipationStatus.MAYBE, { first_name: 'C' });
    const result = formatParticipantsList([p1, p2, p3]);
    assert.match(result, /Всего: 3/);
  });

  test('singular guest word "гость" for 1 guest', () => {
    const p = makeParticipant(ParticipationStatus.GUEST, { guest_name: 'X' });
    assert.match(formatParticipantsList([p]), /1 гость/);
  });

  test('plural guest word "гостя" for 2–4 guests', () => {
    const guests = [1, 2].map((i) =>
      makeParticipant(ParticipationStatus.GUEST, { guest_name: `G${i}` })
    );
    assert.match(formatParticipantsList(guests), /2 гостя/);
  });

  test('plural guest word "гостей" for 5+ guests', () => {
    const guests = [1, 2, 3, 4, 5].map((i) =>
      makeParticipant(ParticipationStatus.GUEST, { guest_name: `G${i}` })
    );
    assert.match(formatParticipantsList(guests), /5 гостей/);
  });
});

// ---------------------------------------------------------------------------
// formatMention / formatMembersMentions
// ---------------------------------------------------------------------------
function makeUser(opts: { telegram_id?: number; username?: string | null; first_name?: string; last_name?: string }): User {
  const u = new User();
  u.telegram_id = opts.telegram_id ?? 777;
  u.username = opts.username ?? null;
  u.first_name = opts.first_name;
  u.last_name = opts.last_name;
  return u;
}

function makeMember(user: User | undefined): GroupMember {
  const m = new GroupMember();
  if (user) m.user = user;
  return m;
}

describe('formatMention', () => {
  test('uses @username when present', () => {
    assert.equal(formatMention(makeUser({ username: 'ivan', first_name: 'Ivan' })), '@ivan');
  });

  test('falls back to an inline tg:// mention when username is missing', () => {
    const out = formatMention(makeUser({ telegram_id: 123, first_name: 'Ivan', last_name: 'Petrov' }));
    assert.equal(out, '<a href="tg://user?id=123">Ivan Petrov</a>');
  });

  test('falls back to a placeholder name when nothing is known', () => {
    const out = formatMention(makeUser({ telegram_id: 5 }));
    assert.equal(out, '<a href="tg://user?id=5">Игрок</a>');
  });

  test('escapes HTML in the display name', () => {
    const out = formatMention(makeUser({ telegram_id: 5, first_name: '<b>Иван</b>' }));
    assert.match(out, /&lt;b&gt;Иван&lt;\/b&gt;/);
  });
});

describe('formatMembersMentions', () => {
  test('mentions every member, with and without a username', () => {
    const out = formatMembersMentions([
      makeMember(makeUser({ telegram_id: 1, username: 'ivan' })),
      makeMember(makeUser({ telegram_id: 2, first_name: 'Petr' })),
    ]);
    assert.equal(out, '@ivan <a href="tg://user?id=2">Petr</a>');
  });

  test('skips members without a loaded user relation', () => {
    assert.equal(formatMembersMentions([makeMember(undefined)]), '');
  });

  test('returns an empty string for an empty list', () => {
    assert.equal(formatMembersMentions([]), '');
  });
});

// ---------------------------------------------------------------------------
// participantName / team formatters
// ---------------------------------------------------------------------------
function teamPlayer(
  status: ParticipationStatus,
  name: string,
  team: number | null,
  kind: 'user' | 'guest' = 'user',
): GameParticipant {
  const p = makeParticipant(status, kind === 'guest' ? { guest_name: name } : { first_name: name });
  p.team = team;
  return p;
}

const identity = (s: string): string => s;

describe('participantName', () => {
  test('joins the user name or falls back to the guest name', () => {
    const p = makeParticipant(ParticipationStatus.CONFIRMED, { first_name: 'Ivan' });
    p.user!.last_name = 'Petrov';
    assert.equal(participantName(p), 'Ivan Petrov');
    assert.equal(participantName(makeParticipant(ParticipationStatus.GUEST, { guest_name: 'Bob' })), 'Bob');
    const nameless = new GameParticipant();
    assert.equal(participantName(nameless), 'Гость');
  });
});

describe('formatTeamsInline', () => {
  const players = [
    teamPlayer(ParticipationStatus.CONFIRMED, 'Ann', 1),
    teamPlayer(ParticipationStatus.GUEST, 'Bob', 1, 'guest'),
    teamPlayer(ParticipationStatus.CONFIRMED, 'Cat', 3),
    teamPlayer(ParticipationStatus.CONFIRMED, 'Dan', null),
    teamPlayer(ParticipationStatus.MAYBE, 'Eve', 1),
  ];

  test('prints one line per non-empty team and a block for players without a team', () => {
    assert.equal(
      formatTeamsInline(players, 3, identity),
      '🔴 Команда 1: Ann, Bob\n🟢 Команда 3: Cat\n⚪ Без команды: Dan',
    );
  });

  test('skips empty teams and the unassigned block when nobody is left', () => {
    const split = [teamPlayer(ParticipationStatus.CONFIRMED, 'Ann', 2)];
    assert.equal(formatTeamsInline(split, 2, identity), '🔵 Команда 2: Ann');
  });

  test('never lists a maybe player', () => {
    assert.ok(!formatTeamsInline(players, 3, identity).includes('Eve'));
  });

  test('escapes names with the given escaper', () => {
    const split = [teamPlayer(ParticipationStatus.CONFIRMED, 'a_b', 1)];
    assert.equal(formatTeamsInline(split, 2, (s) => s.replace('_', '\\_')), '🔴 Команда 1: a\\_b');
  });
});

describe('formatTeamsList', () => {
  test('prints a numbered list per team separated by blank lines', () => {
    const players = [
      teamPlayer(ParticipationStatus.CONFIRMED, 'Ann', 1),
      teamPlayer(ParticipationStatus.CONFIRMED, 'Bob', 2),
      teamPlayer(ParticipationStatus.GUEST, 'Cat', 1, 'guest'),
      teamPlayer(ParticipationStatus.CONFIRMED, 'Dan', null),
    ];
    assert.equal(
      formatTeamsList(players, 2, identity),
      '🔴 Команда 1:\n1. Ann\n2. Cat\n\n🔵 Команда 2:\n1. Bob\n\n⚪ Без команды:\n1. Dan',
    );
  });

  test('does not print an empty team', () => {
    const players = [teamPlayer(ParticipationStatus.CONFIRMED, 'Ann', 2)];
    assert.ok(!formatTeamsList(players, 3, identity).includes('Команда 1'));
  });

  test('returns an empty string without players', () => {
    assert.equal(formatTeamsList([], 2, identity), '');
  });
});
