import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../models/Game';
import { GameType } from '../../models/GameType';
import { GameParticipant, ParticipationStatus } from '../../models/GameParticipant';
import { GameMessageBuilder } from '../../bot/ui/GameMessageBuilder';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeGame(overrides: Partial<Game> = {}): Game {
  const g = new Game();
  g.game_date = new Date('2026-06-15T18:00:00Z');
  g.max_participants = 10;
  g.min_participants = 2;
  g.type = GameType.GAME;
  g.participants = [];
  g.sport = { emoji: '⚽', name: 'Футбол' } as any;
  g.location = { name: 'Стадион' } as any;
  Object.assign(g, overrides);
  return g;
}

function makeParticipant(status: ParticipationStatus): GameParticipant {
  const p = new GameParticipant();
  p.participation_status = status;
  p.joined_at = new Date();
  return p;
}

// ---------------------------------------------------------------------------
// formatGameCard
// ---------------------------------------------------------------------------
describe('GameMessageBuilder.formatGameCard', () => {
  test('includes sport name and emoji', () => {
    const g = makeGame();
    const result = GameMessageBuilder.formatGameCard(g);
    assert.match(result, /⚽/);
    assert.match(result, /Футбол/);
  });

  test('includes location name', () => {
    const result = GameMessageBuilder.formatGameCard(makeGame());
    assert.match(result, /Стадион/);
  });

  test('falls back to "Не указано" when location is absent', () => {
    const g = makeGame({ location: undefined, location_text: undefined });
    assert.match(GameMessageBuilder.formatGameCard(g), /Не указано/);
  });

  test('includes map_url link when present', () => {
    const g = makeGame({ location: { name: 'Парк', map_url: 'https://maps.example.com' } as any });
    assert.match(GameMessageBuilder.formatGameCard(g), /maps\.example\.com/);
  });

  test('does not include map_url line when absent', () => {
    const g = makeGame({ location: { name: 'Парк' } as any });
    assert.doesNotMatch(GameMessageBuilder.formatGameCard(g), /Открыть на карте/);
  });

  test('shows maybeCount in participants line', () => {
    const g = makeGame({
      participants: [makeParticipant(ParticipationStatus.MAYBE)],
    });
    assert.match(GameMessageBuilder.formatGameCard(g), /ещё 1 под вопросом/);
  });

  test('does not show maybe block when maybeCount is 0', () => {
    const g = makeGame({ participants: [] });
    assert.doesNotMatch(GameMessageBuilder.formatGameCard(g), /под вопросом/);
  });

  test('shows guest suffix for 1 guest', () => {
    const g = makeGame({ participants: [makeParticipant(ParticipationStatus.GUEST)] });
    assert.match(GameMessageBuilder.formatGameCard(g), /\+ 1 гость/);
  });

  test('shows guest suffix for 2 guests', () => {
    const guests = [1, 2].map(() => makeParticipant(ParticipationStatus.GUEST));
    const g = makeGame({ participants: guests });
    assert.match(GameMessageBuilder.formatGameCard(g), /\+ 2 гостя/);
  });

  test('shows guest suffix for 5 guests', () => {
    const guests = [1, 2, 3, 4, 5].map(() => makeParticipant(ParticipationStatus.GUEST));
    const g = makeGame({ participants: guests });
    assert.match(GameMessageBuilder.formatGameCard(g), /\+ 5 гостей/);
  });

  test('includes cost line when cost is set', () => {
    const g = makeGame({ cost: 500 as any });
    assert.match(GameMessageBuilder.formatGameCard(g), /500/);
  });

  test('does not include cost line when cost is absent', () => {
    const g = makeGame({ cost: undefined });
    assert.doesNotMatch(GameMessageBuilder.formatGameCard(g), /Стоимость/);
  });

  test('includes notes when set', () => {
    const g = makeGame({ notes: 'Приходите пораньше' });
    assert.match(GameMessageBuilder.formatGameCard(g), /Приходите пораньше/);
  });

  test('escapes markdown v1 in notes', () => {
    const g = makeGame({ notes: 'Зал_1' });
    assert.match(GameMessageBuilder.formatGameCard(g), /Зал\\_1/);
  });
});

// ---------------------------------------------------------------------------
// formatGameSummary
// ---------------------------------------------------------------------------
describe('GameMessageBuilder.formatGameSummary', () => {
  test('contains sport emoji and name', () => {
    const result = GameMessageBuilder.formatGameSummary(makeGame());
    assert.match(result, /⚽ Футбол/);
  });

  test('contains location name', () => {
    assert.match(GameMessageBuilder.formatGameSummary(makeGame()), /Стадион/);
  });

  test('contains confirmed/max ratio', () => {
    const g = makeGame({ participants: [makeParticipant(ParticipationStatus.CONFIRMED)], max_participants: 10 });
    assert.match(GameMessageBuilder.formatGameSummary(g), /1\/10/);
  });
});

// ---------------------------------------------------------------------------
// formatJoinSuccessMessage
// ---------------------------------------------------------------------------
describe('GameMessageBuilder.formatJoinSuccessMessage', () => {
  test('confirmed returns join message', () => {
    const msg = GameMessageBuilder.formatJoinSuccessMessage('confirmed');
    assert.match(msg, /Вы записаны/);
  });

  test('maybe returns maybe message', () => {
    const msg = GameMessageBuilder.formatJoinSuccessMessage('maybe');
    assert.match(msg, /Возможно/);
  });
});

// ---------------------------------------------------------------------------
// buildConfirmationMessage
// ---------------------------------------------------------------------------
describe('GameMessageBuilder.buildConfirmationMessage', () => {
  const date = new Date('2026-06-15T18:00:00Z');

  test('contains sport name', () => {
    const msg = GameMessageBuilder.buildConfirmationMessage('Футбол', date, 'Стадион', 2, 10);
    assert.match(msg, /Футбол/);
  });

  test('renders max=999 as "Безлимит"', () => {
    const msg = GameMessageBuilder.buildConfirmationMessage('Футбол', date, 'Стадион', 2, 999);
    assert.match(msg, /Безлимит/);
  });

  test('renders normal max as number', () => {
    const msg = GameMessageBuilder.buildConfirmationMessage('Футбол', date, 'Стадион', 2, 12);
    assert.match(msg, /12/);
    assert.doesNotMatch(msg, /Безлимит/);
  });

  test('includes cost when > 0', () => {
    const msg = GameMessageBuilder.buildConfirmationMessage('Футбол', date, 'Стадион', 2, 10, 300);
    assert.match(msg, /300/);
  });

  test('skips cost when 0 or absent', () => {
    const msg = GameMessageBuilder.buildConfirmationMessage('Футбол', date, 'Стадион', 2, 10, 0);
    assert.doesNotMatch(msg, /Стоимость/);
  });

  test('includes notes when provided', () => {
    const msg = GameMessageBuilder.buildConfirmationMessage('Футбол', date, 'Стадион', 2, 10, 0, 'Заметка');
    assert.match(msg, /Заметка/);
  });

  test('uses custom prefix', () => {
    const msg = GameMessageBuilder.buildConfirmationMessage('Футбол', date, 'Стадион', 2, 10, 0, undefined, '🏋️ ТРЕНИРОВКА');
    assert.match(msg, /ТРЕНИРОВКА/);
  });
});

// ---------------------------------------------------------------------------
// buildTrainingCard
// ---------------------------------------------------------------------------
describe('GameMessageBuilder.buildTrainingCard', () => {
  test('uses 🏋️ prefix for training', () => {
    const g = makeGame({ type: GameType.TRAINING, max_participants: 999 });
    assert.match(GameMessageBuilder.buildTrainingCard(g), /🏋️/);
  });

  test('renders max=999 as "Безлимит" in training card', () => {
    const g = makeGame({ type: GameType.TRAINING, max_participants: 999 });
    assert.match(GameMessageBuilder.buildTrainingCard(g), /Безлимит/);
  });

  test('renders normal max as number in training card', () => {
    const g = makeGame({ type: GameType.TRAINING, max_participants: 15 });
    assert.match(GameMessageBuilder.buildTrainingCard(g), /15/);
  });
});

// ---------------------------------------------------------------------------
// Markdown escaping of user-controlled names (cards are sent with parse_mode: 'Markdown')
// ---------------------------------------------------------------------------
const BS = String.fromCharCode(92);

describe('GameMessageBuilder — Markdown escaping', () => {
  const sport = { emoji: '⚽', name: 'Mini_football*' } as any;
  const location = { name: 'Arena_1 *VIP*', map_url: 'https://maps.example.com/a(b)' } as any;

  test('formatGameCard escapes sport and location names', () => {
    const result = GameMessageBuilder.formatGameCard(makeGame({ sport, location }));
    assert.ok(result.includes(`Mini${BS}_football${BS}*`));
    assert.ok(result.includes(`Arena${BS}_1 ${BS}*VIP${BS}*`));
  });

  test('formatGameCard escapes a free-text location', () => {
    const result = GameMessageBuilder.formatGameCard(makeGame({ location: undefined, location_text: 'Gym_2' }));
    assert.ok(result.includes(`Gym${BS}_2`));
  });

  test('a ")" in map_url cannot terminate the Markdown link early', () => {
    const result = GameMessageBuilder.formatGameCard(makeGame({ sport, location }));
    assert.ok(result.includes('(https://maps.example.com/a(b%29)'));
  });

  test('buildTrainingCard escapes sport, location and notes', () => {
    const result = GameMessageBuilder.buildTrainingCard(
      makeGame({ type: GameType.TRAINING, sport, location, notes: 'bring_water' })
    );
    assert.ok(result.includes(`Mini${BS}_football${BS}*`));
    assert.ok(result.includes(`Arena${BS}_1 ${BS}*VIP${BS}*`));
    assert.ok(result.includes(`bring${BS}_water`));
    assert.ok(result.includes('(https://maps.example.com/a(b%29)'));
  });
});
