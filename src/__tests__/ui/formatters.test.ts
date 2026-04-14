import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GameParticipant, ParticipationStatus } from '../../models/GameParticipant';
import { User } from '../../models/User';
import {
  formatGameStatus,
  formatParticipantName,
  formatParticipantsList,
  formatParticipantsCount,
} from '../../bot/ui/formatters';

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
// formatGameStatus
// ---------------------------------------------------------------------------
describe('formatGameStatus', () => {
  test('planned', () => {
    assert.match(formatGameStatus('planned'), /Запланирована/);
  });

  test('active', () => {
    assert.match(formatGameStatus('active'), /Активна/);
  });

  test('completed', () => {
    assert.match(formatGameStatus('completed'), /Завершена/);
  });

  test('cancelled', () => {
    assert.match(formatGameStatus('cancelled'), /Отменена/);
  });

  test('unknown status returns the raw string', () => {
    assert.equal(formatGameStatus('unknown_status'), 'unknown_status');
  });
});

// ---------------------------------------------------------------------------
// formatParticipantName
// ---------------------------------------------------------------------------
describe('formatParticipantName', () => {
  test('CONFIRMED shows ✅ emoji', () => {
    const p = makeParticipant(ParticipationStatus.CONFIRMED, { first_name: 'Ivan' });
    assert.ok(formatParticipantName(p).startsWith('✅'));
  });

  test('MAYBE shows ❓ emoji', () => {
    const p = makeParticipant(ParticipationStatus.MAYBE, { first_name: 'Ivan' });
    assert.ok(formatParticipantName(p).startsWith('❓'));
  });

  test('GUEST shows 👤 emoji', () => {
    const p = makeParticipant(ParticipationStatus.GUEST, { guest_name: 'Гость' });
    assert.ok(formatParticipantName(p).startsWith('👤'));
  });

  test('prefers @username over first_name', () => {
    const p = makeParticipant(ParticipationStatus.CONFIRMED, { username: 'ivanpetrov', first_name: 'Ivan' });
    assert.match(formatParticipantName(p), /@ivanpetrov/);
  });

  test('uses first_name when no username', () => {
    const p = makeParticipant(ParticipationStatus.CONFIRMED, { first_name: 'Ivan' });
    assert.match(formatParticipantName(p), /Ivan/);
  });

  test('uses guest_name when no user', () => {
    const p = makeParticipant(ParticipationStatus.GUEST, { guest_name: 'Алексей' });
    assert.match(formatParticipantName(p), /Алексей/);
  });
});

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
// formatParticipantsCount
// ---------------------------------------------------------------------------
describe('formatParticipantsCount', () => {
  test('formats confirmed/max and maybe count', () => {
    const result = formatParticipantsCount(3, 2, 2, 10);
    assert.match(result, /3\/10/);
    assert.match(result, /ещё 2/);
  });

  test('works with zero maybeCount', () => {
    const result = formatParticipantsCount(5, 0, 2, 8);
    assert.match(result, /5\/8/);
  });
});
