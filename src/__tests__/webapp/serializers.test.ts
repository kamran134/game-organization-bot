import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  serializeGame, serializeUser, serializeSantaEvent, serializeSantaParticipant, serializeSantaAssignment,
  serializeMafiaEvent, serializeMafiaParticipant, serializeMafiaCard, serializeMafiaLayoutRow,
} from '../../webapp/serializers';

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

describe('santa serializers', () => {
  const FORBIDDEN = ['receiver_id', 'wishlist', 'phone', 'telegram_id', '+994500000000', 'SECRET'];

  function assertClean(value: unknown): void {
    const json = JSON.stringify(value);
    for (const word of FORBIDDEN) assert.ok(!json.includes(word), `leaked ${word}`);
  }

  test('participant exposes only the user id and public name fields', () => {
    const dto = serializeSantaParticipant({
      id: 1, event_id: 2, user_id: 1, user, wishlist: 'SECRET', receiver_id: 7, receiver: user,
    } as any);
    assert.deepEqual(Object.keys(dto).sort(), ['first_name', 'last_name', 'user_id', 'username']);
    assertClean(dto);
  });

  test('event drops everything outside the allow-list', () => {
    const dto = serializeSantaEvent({
      id: 2, group_id: 1, title: 'NY', description: null, budget: '30', exchange_date: '2026-12-31',
      status: 'drawn', drawn_at: new Date(), group: { invite_code: 'SECRET' }, creator: user, created_by: 1,
    } as any);
    assert.deepEqual(
      Object.keys(dto).sort(),
      ['budget', 'description', 'drawn_at', 'exchange_date', 'group_id', 'id', 'status', 'title'],
    );
    assertClean(dto);
  });

  test('assignment carries the recipient name and wishlist but no identifiers', () => {
    const dto = serializeSantaAssignment({ receiver: user as any, wishlist: 'socks' });
    assert.deepEqual(Object.keys(dto).sort(), ['receiver', 'wishlist']);
    assert.deepEqual(Object.keys(dto.receiver as object).sort(), ['first_name', 'last_name', 'username']);
    assert.ok(!JSON.stringify(dto).includes('telegram_id'));
    assert.ok(!JSON.stringify(dto).includes('phone'));
  });
});

describe('mafia serializers', () => {
  const SECRET = ['role', 'card_variant', 'roles_config', 'card_chat_id', 'card_message_id', 'phone', 'telegram_id', '+994500000000', 'SECRET'];

  function assertClean(value: unknown): void {
    const json = JSON.stringify(value);
    for (const word of SECRET) assert.ok(!json.includes(word), `leaked ${word}`);
  }

  test('participant exposes the public name and the seat, never the role', () => {
    const dto = serializeMafiaParticipant({
      id: 1, event_id: 2, user_id: 1, user, role: 'don', seat: 3, card_variant: 1,
    } as any);
    assert.deepEqual(Object.keys(dto).sort(), ['first_name', 'last_name', 'seat', 'user_id', 'username']);
    assert.equal(dto.seat, 3);
    assertClean(dto);
  });

  test('event drops everything outside the allow-list', () => {
    const dto = serializeMafiaEvent({
      id: 2, group_id: 1, title: 'Evening', description: null, starts_at: new Date(), place: 'Cafe',
      status: 'dealt', host_id: 1, host: user, show_mafia_team: true, assign_seats: false, max_players: 10, round: 2,
      roles_config: { mafia: 2 }, dealt_at: new Date(), card_chat_id: '-100', card_message_id: 5,
      group: { invite_code: 'SECRET' }, created_at: new Date(),
    } as any);
    assert.deepEqual(
      Object.keys(dto).sort(),
      ['assign_seats', 'dealt_at', 'description', 'group_id', 'host', 'id', 'max_players', 'place', 'round', 'show_mafia_team', 'starts_at', 'status', 'title'],
    );
    assert.deepEqual(Object.keys(dto.host as object).sort(), ['first_name', 'last_name', 'username']);
    assertClean(dto);
  });

  test('own card carries the role, but only names and roles of teammates', () => {
    const dto = serializeMafiaCard({
      round: 1, role: 'mafia' as never, seat: 2, variant: 1,
      teammates: [{ name: 'Bob', role: 'don', seat: 3, extra: 'x' } as any],
    });
    assert.deepEqual(Object.keys(dto).sort(), ['role', 'round', 'seat', 'teammates', 'variant']);
    assert.deepEqual(Object.keys((dto.teammates as object[])[0]).sort(), ['name', 'role', 'seat']);
  });

  test('layout row is the only place that pairs a person with a role', () => {
    const dto = serializeMafiaLayoutRow({ user: user as any, role: 'doctor' as never, seat: 4 });
    assert.deepEqual(Object.keys(dto).sort(), ['first_name', 'last_name', 'role', 'seat', 'user_id', 'username']);
    assert.ok(!JSON.stringify(dto).includes('telegram_id'));
    assert.ok(!JSON.stringify(dto).includes('phone'));
  });
});
