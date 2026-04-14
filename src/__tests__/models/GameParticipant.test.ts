import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GameParticipant, ParticipationStatus } from '../../models/GameParticipant';

function makeParticipant(status: ParticipationStatus): GameParticipant {
  const p = new GameParticipant();
  p.participation_status = status;
  return p;
}

describe('GameParticipant.getPriority', () => {
  test('CONFIRMED returns 1', () => {
    assert.equal(makeParticipant(ParticipationStatus.CONFIRMED).getPriority(), 1);
  });

  test('MAYBE returns 2', () => {
    assert.equal(makeParticipant(ParticipationStatus.MAYBE).getPriority(), 2);
  });

  test('GUEST returns 3', () => {
    assert.equal(makeParticipant(ParticipationStatus.GUEST).getPriority(), 3);
  });

  test('unknown status returns 999', () => {
    const p = new GameParticipant();
    p.participation_status = 'unknown' as ParticipationStatus;
    assert.equal(p.getPriority(), 999);
  });

  test('priority order: CONFIRMED < MAYBE < GUEST', () => {
    const confirmed = makeParticipant(ParticipationStatus.CONFIRMED).getPriority();
    const maybe = makeParticipant(ParticipationStatus.MAYBE).getPriority();
    const guest = makeParticipant(ParticipationStatus.GUEST).getPriority();
    assert.ok(confirmed < maybe);
    assert.ok(maybe < guest);
  });
});

describe('GameParticipant.getStatusEmoji', () => {
  test('CONFIRMED returns ✅', () => {
    assert.equal(makeParticipant(ParticipationStatus.CONFIRMED).getStatusEmoji(), '✅');
  });

  test('MAYBE returns ❓', () => {
    assert.equal(makeParticipant(ParticipationStatus.MAYBE).getStatusEmoji(), '❓');
  });

  test('GUEST returns 👤', () => {
    assert.equal(makeParticipant(ParticipationStatus.GUEST).getStatusEmoji(), '👤');
  });

  test('unknown status returns empty string', () => {
    const p = new GameParticipant();
    p.participation_status = 'unknown' as ParticipationStatus;
    assert.equal(p.getStatusEmoji(), '');
  });
});
