import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  serializeGame, serializeUser, serializeSantaEvent, serializeSantaParticipant, serializeSantaAssignment,
  serializeMafiaEvent, serializeMafiaParticipant, serializeMafiaCard, serializeMafiaLayoutRow,
  serializeSpyEvent, serializeSpyParticipant, serializeSpyRound, serializeSpyCard, serializeSpyVotingState,
  serializeSpyStats, serializeSpyLocation, serializeSpyLayoutRow,
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

  test('serializeGame exposes the team split and each participant team', () => {
    const game = makeGame();
    game.team_count = 3;
    game.participants[0].team = 2;
    const dto = serializeGame(game) as any;
    assert.equal(dto.team_count, 3);
    assert.equal(dto.participants[0].team, 2);
  });

  test('team and team_count are null when the game is not split', () => {
    const dto = serializeGame(makeGame()) as any;
    assert.equal(dto.team_count, null);
    assert.equal(dto.participants[0].team, null);
    assert.equal(dto.participants[1].team, null);
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
    assert.deepEqual(Object.keys(dto).sort(), ['first_name', 'gender', 'last_name', 'seat', 'user_id', 'username']);
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
      round: 1, role: 'mafia' as never, gender: null, seat: 2, variant: 1,
      teammates: [{ name: 'Bob', role: 'don', seat: 3, extra: 'x' } as any],
    });
    assert.deepEqual(Object.keys(dto).sort(), ['gender', 'role', 'round', 'seat', 'teammates', 'variant']);
    assert.deepEqual(Object.keys((dto.teammates as object[])[0]).sort(), ['name', 'role', 'seat']);
  });

  test('layout row is the only place that pairs a person with a role', () => {
    const dto = serializeMafiaLayoutRow({ user: user as any, role: 'doctor' as never, seat: 4 });
    assert.deepEqual(Object.keys(dto).sort(), ['first_name', 'gender', 'last_name', 'role', 'seat', 'user_id', 'username']);
    assert.ok(!JSON.stringify(dto).includes('telegram_id'));
    assert.ok(!JSON.stringify(dto).includes('phone'));
  });
});

describe('spy serializers', () => {
  const alice = { id: 1, telegram_id: 100, username: 'alice', first_name: 'Alice', last_name: 'A', phone: '+994500000000' };
  const bob = { id: 2, telegram_id: 101, username: 'bob', first_name: 'Bob', last_name: 'B', phone: '+994500000001' };
  const PRIVATE = ['telegram_id', 'phone', '+994500000000', 'card_chat_id', 'card_message_id', 'invite_code'];
  const FINISH_ONLY = ['location_name', 'location_pack', 'outcome', 'outcome_reason', 'guess', 'guessed_by'];
  const SECRET_LOCATION = 'Secret hospital';

  function makeRound(status: string): any {
    return {
      id: 10, event_id: 1, number: 2, status, location_id: 7, location_name: SECRET_LOCATION, location_pack: 'base',
      turn_order: [1, 2], turn_index: 1, cycle: 2, turn_started_at: new Date('2030-01-01T10:00:00Z'),
      outcome: status === 'finished' ? 'spies' : null, outcome_reason: status === 'finished' ? 'guess_correct' : null,
      guess: 'hospital', guessed_by: 2, started_at: new Date(), finished_at: status === 'finished' ? new Date() : null,
    };
  }
  function makeView(status: string, role: string | null): any {
    return {
      round: makeRound(status),
      players: [
        { user_id: 1, user: alice, is_eliminated: false, role },
        { user_id: 2, user: bob, is_eliminated: true, role: role && 'spy' },
      ],
    };
  }
  function assertNoPrivateData(value: unknown): void {
    const json = JSON.stringify(value);
    for (const word of PRIVATE) assert.ok(!json.includes(word), `leaked ${word}`);
  }

  test('an unfinished round has no secret keys at all, even when the input carries them', () => {
    for (const status of ['in_progress', 'voting']) {
      // The input deliberately holds the roles and the guess: the serializer must not trust the caller
      const dto = serializeSpyRound(makeView(status, 'civilian'));
      const json = JSON.stringify(dto);
      for (const key of FINISH_ONLY) assert.ok(!(key in dto), `${key} present in ${status}`);
      for (const player of dto.players as Array<Record<string, unknown>>) assert.ok(!('role' in player), 'role present');
      assert.ok(!json.includes(SECRET_LOCATION));
      assert.ok(!json.includes('civilian'));
      assert.ok(!json.includes('spy'));
      assertNoPrivateData(dto);
    }
  });

  test('a finished round reveals the location, the outcome and the roles', () => {
    const dto = serializeSpyRound(makeView('finished', 'civilian'));
    assert.equal(dto.location_name, SECRET_LOCATION);
    assert.equal(dto.location_pack, 'base');
    assert.equal(dto.outcome, 'spies');
    assert.equal(dto.outcome_reason, 'guess_correct');
    assert.equal(dto.guess, 'hospital');
    assert.equal(dto.guessed_by, 2);
    assert.deepEqual((dto.players as Array<Record<string, unknown>>).map((p) => p.role), ['civilian', 'spy']);
    assertNoPrivateData(dto);
  });

  test('a running round names the current player and the deadline; a voting one does not', () => {
    const running = serializeSpyRound(makeView('in_progress', null), 60);
    assert.equal(running.current_user_id, 2);
    assert.equal((running.deadline as Date).toISOString(), '2030-01-01T10:01:00.000Z');
    assert.equal(serializeSpyRound(makeView('in_progress', null), null).deadline, null);

    const voting = serializeSpyRound(makeView('voting', null), 60);
    assert.equal(voting.current_user_id, null);
    assert.equal(voting.deadline, null);
  });

  test('event and participant expose the allow-list only', () => {
    const event = serializeSpyEvent({
      id: 1, group_id: 2, title: 'Evening', description: null, starts_at: null, place: null, status: 'registration',
      host_id: 1, host: alice, max_players: 10, spy_count: null, double_agent: true, mr_white: false, packs: ['base'],
      turn_seconds: 60, hint_after_cycles: null, round: 0, card_chat_id: '-100', card_message_id: 5,
      group: { invite_code: 'SECRET' }, created_at: new Date(),
    } as any);
    assert.deepEqual(Object.keys(event).sort(), [
      'description', 'double_agent', 'group_id', 'hint_after_cycles', 'host', 'host_id', 'id', 'max_players', 'mr_white',
      'packs', 'place', 'round', 'spy_count', 'starts_at', 'status', 'title', 'turn_seconds',
    ]);
    assert.deepEqual(Object.keys(event.host as object).sort(), ['first_name', 'last_name', 'username']);
    assertNoPrivateData(event);

    const participant = serializeSpyParticipant({ id: 3, event_id: 1, user_id: 1, user: alice, is_active: false } as any);
    assert.deepEqual(Object.keys(participant).sort(), ['first_name', 'is_active', 'last_name', 'user_id', 'username']);
    assertNoPrivateData(participant);
  });

  test('own card, voting state, stats and location expose only their fields', () => {
    const card = serializeSpyCard({
      round: 1, role: 'spy' as never, location: null, hint: 'Hint', cycle: 3, currentUserId: 2, isMyTurn: false, deadline: null,
    });
    assert.deepEqual(Object.keys(card).sort(), ['current_user_id', 'cycle', 'deadline', 'hint', 'is_my_turn', 'location', 'role', 'round']);

    const voting = serializeSpyVotingState({
      roundId: 10, ballot: 2, voterIds: [1], counts: [{ userId: 2, votes: 1 }], leaders: [2], candidateIds: [2, 3],
      extra: 'x', votes: [{ voterId: 1, targetId: 2 }],
    } as any);
    assert.deepEqual(Object.keys(voting).sort(), ['ballot', 'candidate_ids', 'counts', 'leaders', 'round_id', 'voter_ids']);
    assert.deepEqual(voting.counts, [{ user_id: 2, votes: 1 }]);
    assert.equal(serializeSpyVotingState({ roundId: 1, ballot: 1, voterIds: [], counts: [], leaders: [] }).candidate_ids, null);

    const stats = serializeSpyStats({
      user_id: 1, user: alice as any, rounds: 4, wins: 3, spy_rounds: 1, spy_wins: 1, exposed: 0, guessed: 1, win_rate: 0.75,
    });
    assert.deepEqual(Object.keys(stats).sort(), [
      'exposed', 'first_name', 'guessed', 'last_name', 'rounds', 'spy_rounds', 'spy_wins', 'user_id', 'username', 'win_rate', 'wins',
    ]);
    assertNoPrivateData(stats);

    const location = serializeSpyLocation({ id: 1, name: 'Cafe', pack: 'custom', group_id: 2, is_active: true, created_at: new Date() } as any);
    assert.deepEqual(Object.keys(location).sort(), ['group_id', 'id', 'is_active', 'name', 'pack']);
    assert.equal(serializeSpyLocation({ id: 1, name: 'x', pack: 'base', is_active: true } as any).group_id, null);
  });

  test('layout row is the person with the role and nothing private', () => {
    const row = serializeSpyLayoutRow({ id: 1, round_id: 10, user_id: 1, user: alice, role: 'mr_white', is_eliminated: false } as any);
    assert.deepEqual(Object.keys(row).sort(), ['first_name', 'is_eliminated', 'last_name', 'role', 'user_id', 'username']);
    assertNoPrivateData(row);
  });
});
