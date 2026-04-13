import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { GameService } from '../../services/GameService';
import { GameParticipant, ParticipationStatus } from '../../models/GameParticipant';
import { Game } from '../../models/Game';
import { GameStatus } from '../../models/Game';
import { GameType } from '../../models/GameType';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeParticipant(
  id: number,
  status: ParticipationStatus,
  joinedMsAgo: number = 0
): GameParticipant {
  const p = new GameParticipant();
  p.id = id;
  p.game_id = 1;
  p.participation_status = status;
  p.joined_at = new Date(Date.now() - joinedMsAgo);
  p.updated_at = new Date();
  return p;
}

function makeGame(max: number, participants: GameParticipant[]): Game {
  const g = new Game();
  g.id = 1;
  g.group_id = 1;
  g.sport_id = 1;
  g.game_date = new Date(Date.now() + 86_400_000); // tomorrow
  g.min_participants = 2;
  g.max_participants = max;
  g.status = GameStatus.PLANNED;
  g.type = GameType.GAME;
  g.participants = participants;
  return g;
}

/** Create a GameService with getGameById stubbed to return the given game. */
function makeService(game: Game | null): GameService {
  const mockDb = { getRepository: () => ({}) } as any;
  const service = new GameService(mockDb);
  (service as any).getGameById = async () => game;
  return service;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GameService.getParticipantsByStatus', () => {
  test('returns empty lists when game not found', async () => {
    const service = makeService(null);
    const result = await service.getParticipantsByStatus(99);
    assert.deepEqual(result, { confirmed: [], maybe: [], guests: [], waiting: [] });
  });

  test('splits participants by status', async () => {
    const p1 = makeParticipant(1, ParticipationStatus.CONFIRMED);
    const p2 = makeParticipant(2, ParticipationStatus.MAYBE);
    const p3 = makeParticipant(3, ParticipationStatus.GUEST);
    const service = makeService(makeGame(10, [p1, p2, p3]));

    const { confirmed, maybe, guests } = await service.getParticipantsByStatus(1);
    assert.equal(confirmed.length, 1);
    assert.equal(maybe.length, 1);
    assert.equal(guests.length, 1);
  });

  test('assigns positions in sorted order', async () => {
    const p1 = makeParticipant(1, ParticipationStatus.MAYBE, 1000);       // joined earlier
    const p2 = makeParticipant(2, ParticipationStatus.CONFIRMED, 500);     // joined later but confirmed
    const p3 = makeParticipant(3, ParticipationStatus.CONFIRMED, 2000);    // joined earliest, confirmed
    const service = makeService(makeGame(10, [p1, p2, p3]));

    await service.getParticipantsByStatus(1);

    // p3 is CONFIRMED and joined earliest → position 1
    assert.equal(p3.position, 1);
    // p2 is CONFIRMED joined later → position 2
    assert.equal(p2.position, 2);
    // p1 is MAYBE → position 3
    assert.equal(p1.position, 3);
  });

  test('confirmed are sorted before maybe are sorted before guests', async () => {
    const confirmed = makeParticipant(1, ParticipationStatus.CONFIRMED, 0);
    const maybe = makeParticipant(2, ParticipationStatus.MAYBE, 5000);     // joined much earlier
    const guest = makeParticipant(3, ParticipationStatus.GUEST, 10000);    // joined even earlier
    const service = makeService(makeGame(10, [guest, maybe, confirmed]));

    await service.getParticipantsByStatus(1);

    // Priority wins over join time
    assert.equal(confirmed.position, 1);
    assert.equal(maybe.position, 2);
    assert.equal(guest.position, 3);
  });

  test('waiting list contains participants beyond max_participants', async () => {
    const participants = Array.from({ length: 5 }, (_, i) =>
      makeParticipant(i + 1, ParticipationStatus.CONFIRMED, (5 - i) * 1000)
    );
    const service = makeService(makeGame(3, participants)); // max = 3

    const { waiting } = await service.getParticipantsByStatus(1);
    assert.equal(waiting.length, 2); // positions 4 and 5 are waiting
  });

  test('within same status, earlier join time gets lower position', async () => {
    const early = makeParticipant(1, ParticipationStatus.CONFIRMED, 2000);
    const late  = makeParticipant(2, ParticipationStatus.CONFIRMED, 100);
    const service = makeService(makeGame(10, [late, early]));

    await service.getParticipantsByStatus(1);

    assert.equal(early.position, 1);
    assert.equal(late.position, 2);
  });

  test('empty game returns all empty lists', async () => {
    const service = makeService(makeGame(10, []));
    const result = await service.getParticipantsByStatus(1);
    assert.deepEqual(result, { confirmed: [], maybe: [], guests: [], waiting: [] });
  });
});
