import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeGame, serializeUser } from '../../webapp/serializers';

const user = {
  id: 1, telegram_id: 100, username: 'alice', first_name: 'Alice', last_name: 'A', phone: '+994500000000',
};

function makeGame(): any {
  return {
    id: 5,
    group_id: 2,
    group: { id: 2, name: 'Friends', invite_code: 'SECRET', creator_id: 1 },
    creator: user,
    sport_id: 3,
    sport: { id: 3, name: 'Football', emoji: '⚽', group_id: null },
    location_id: 4,
    location: { id: 4, name: 'Arena', group_id: 2, map_url: 'https://m', is_active: true },
    game_date: new Date('2030-01-01T10:00:00Z'),
    min_participants: 2,
    max_participants: 10,
    type: 'game',
    status: 'planned',
    participants: [
      { id: 9, game_id: 5, user_id: 1, user, participation_status: 'confirmed', joined_at: new Date() },
      { id: 10, game_id: 5, participation_status: 'guest', guest_name: 'Bob', joined_at: new Date() },
    ],
  };
}

describe('webapp serializers', () => {
  test('serializeUser keeps only public fields', () => {
    const dto = serializeUser(user as any);
    assert.deepEqual(Object.keys(dto).sort(), ['first_name', 'id', 'last_name', 'telegram_id', 'username']);
  });

  test('serializeGame drops phone and invite_code everywhere', () => {
    const json = JSON.stringify(serializeGame(makeGame()));
    assert.ok(!json.includes('phone'));
    assert.ok(!json.includes('+994500000000'));
    assert.ok(!json.includes('invite_code'));
    assert.ok(!json.includes('SECRET'));
  });

  test('serializeGame keeps everything the client reads', () => {
    const dto = serializeGame(makeGame()) as any;
    assert.equal(dto.id, 5);
    assert.equal(dto.sport.name, 'Football');
    assert.equal(dto.location.name, 'Arena');
    assert.deepEqual(dto.group, { id: 2, name: 'Friends' });
    assert.equal(dto.participants[0].user.telegram_id, 100);
    assert.equal(dto.participants[0].user.first_name, 'Alice');
    assert.equal(dto.participants[1].guest_name, 'Bob');
    assert.equal(dto.participants[1].user, undefined);
  });

  test('relations that were not loaded stay absent', () => {
    const game = makeGame();
    delete game.group;
    delete game.creator;
    const dto = serializeGame(game) as any;
    assert.equal(dto.group, undefined);
    assert.equal(dto.creator, undefined);
  });
});
