import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../models/Game';
import { GameType } from '../../models/GameType';
import { GamesView } from '../../bot/ui/GamesView';

function makeGame(type: GameType, id: number = 1): Game {
  const g = new Game();
  g.id = id;
  g.type = type;
  return g;
}

// ---------------------------------------------------------------------------
// filterGames
// ---------------------------------------------------------------------------
describe('GamesView.filterGames', () => {
  const gameA = makeGame(GameType.GAME, 1);
  const gameB = makeGame(GameType.GAME, 2);
  const training = makeGame(GameType.TRAINING, 3);
  const all = [gameA, gameB, training];

  test('"games" filter returns only GAME type', () => {
    const result = GamesView.filterGames(all, 'games');
    assert.equal(result.length, 2);
    assert.ok(result.every((g) => g.type === GameType.GAME));
  });

  test('"trainings" filter returns only TRAINING type', () => {
    const result = GamesView.filterGames(all, 'trainings');
    assert.equal(result.length, 1);
    assert.equal(result[0].type, GameType.TRAINING);
  });

  test('"all" filter returns everything', () => {
    const result = GamesView.filterGames(all, 'all');
    assert.equal(result.length, 3);
  });

  test('returns empty array when nothing matches', () => {
    const result = GamesView.filterGames([gameA], 'trainings');
    assert.equal(result.length, 0);
  });
});

// ---------------------------------------------------------------------------
// buildFilterButtons
// ---------------------------------------------------------------------------
describe('GamesView.buildFilterButtons', () => {
  test('active "games" filter button has ✅ prefix', () => {
    const buttons = GamesView.buildFilterButtons('games', 42);
    const gamesBtn = buttons[0] as any;
    assert.ok(gamesBtn.text.startsWith('✅'));
  });

  test('inactive "trainings" button has no ✅ when "games" is active', () => {
    const buttons = GamesView.buildFilterButtons('games', 42);
    const trainingsBtn = buttons[1] as any;
    assert.ok(!trainingsBtn.text.startsWith('✅'));
  });

  test('active "trainings" filter button has ✅ prefix', () => {
    const buttons = GamesView.buildFilterButtons('trainings', 42);
    const trainingsBtn = buttons[1] as any;
    assert.ok(trainingsBtn.text.startsWith('✅'));
  });

  test('active "all" filter button has ✅ prefix', () => {
    const buttons = GamesView.buildFilterButtons('all', 42);
    const allBtn = buttons[2] as any;
    assert.ok(allBtn.text.startsWith('✅'));
  });

  test('callback_data includes groupId', () => {
    const buttons = GamesView.buildFilterButtons('all', 99);
    const allBtn = buttons[2] as any;
    assert.match(allBtn.callback_data, /99/);
  });
});

// ---------------------------------------------------------------------------
// getEmptyMessage
// ---------------------------------------------------------------------------
describe('GamesView.getEmptyMessage', () => {
  test('"games" mentions /newgame', () => {
    assert.match(GamesView.getEmptyMessage('games'), /\/newgame/);
  });

  test('"trainings" mentions /newtraining', () => {
    assert.match(GamesView.getEmptyMessage('trainings'), /\/newtraining/);
  });

  test('"all" mentions both commands', () => {
    const msg = GamesView.getEmptyMessage('all');
    assert.match(msg, /\/newgame/);
    assert.match(msg, /\/newtraining/);
  });

  test('each filter returns a distinct message', () => {
    const msgs = new Set([
      GamesView.getEmptyMessage('games'),
      GamesView.getEmptyMessage('trainings'),
      GamesView.getEmptyMessage('all'),
    ]);
    assert.equal(msgs.size, 3);
  });
});

// ---------------------------------------------------------------------------
// getTitle
// ---------------------------------------------------------------------------
describe('GamesView.getTitle', () => {
  test('"games" has 🎮 emoji', () => {
    assert.equal(GamesView.getTitle('games').emoji, '🎮');
  });

  test('"trainings" has 🏋️ emoji', () => {
    assert.equal(GamesView.getTitle('trainings').emoji, '🏋️');
  });

  test('"all" has 📋 emoji', () => {
    assert.equal(GamesView.getTitle('all').emoji, '📋');
  });

  test('each filter returns a distinct title', () => {
    const titles = new Set([
      GamesView.getTitle('games').title,
      GamesView.getTitle('trainings').title,
      GamesView.getTitle('all').title,
    ]);
    assert.equal(titles.size, 3);
  });
});
