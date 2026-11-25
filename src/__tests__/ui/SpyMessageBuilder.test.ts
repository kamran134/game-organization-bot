import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { formatSpyCard, formatSpyReveal, spyButton } from '../../bot/ui/SpyMessageBuilder';
import type { SpyCardRound } from '../../bot/ui/SpyMessageBuilder';
import { SpyEvent, SpyStatus } from '../../models/SpyEvent';
import { SpyRound, SpyRoundStatus } from '../../models/SpyRound';
import { SpyRoundPlayer } from '../../models/SpyRoundPlayer';
import { SpyRole } from '../../models/SpyRole';
import { User } from '../../models/User';
import { SPY_ROLE_NAME } from '../../utils/spyDeal';

const LOCATION = 'Подводная лодка';

function makeEvent(overrides: Partial<SpyEvent> = {}): SpyEvent {
  return {
    id: 7,
    title: 'Night <1>',
    description: null,
    starts_at: null,
    place: 'Cafe & Bar',
    status: SpyStatus.REGISTRATION,
    max_players: 6,
    turn_seconds: null,
    round: 0,
    host: { fullName: 'Hosty <h>' },
    ...overrides,
  } as unknown as SpyEvent;
}

const makeUser = (id: number): User =>
  ({ id, telegram_id: String(1000 + id), username: null, first_name: `P${id}`, last_name: null, fullName: `P${id} & x` }) as unknown as User;

const people = (n: number): User[] => Array.from({ length: n }, (_, i) => makeUser(i + 1));

const ROLES = [SpyRole.SPY, SpyRole.CIVILIAN, SpyRole.CIVILIAN, SpyRole.DOUBLE_AGENT, SpyRole.MR_WHITE];

function makeRound(overrides: Partial<SpyRound> = {}, n = 5): SpyCardRound {
  const round = {
    id: 3,
    number: 2,
    location_name: LOCATION,
    location_pack: 'base',
    status: SpyRoundStatus.IN_PROGRESS,
    turn_order: Array.from({ length: n }, (_, i) => i + 1),
    turn_index: 1,
    cycle: 2,
    turn_started_at: null,
    outcome: null,
    outcome_reason: null,
    guess: null,
    guessed_by: null,
    ...overrides,
  } as unknown as SpyRound;
  const players = Array.from({ length: n }, (_, i) => ({
    user_id: i + 1,
    user: makeUser(i + 1),
    role: ROLES[i % ROLES.length],
    is_eliminated: false,
  })) as unknown as SpyRoundPlayer[];
  return { round, players };
}

type Button = { text: string; url?: string; callback_data?: string };
const buttonAt = (kb: { inline_keyboard: unknown[][] }, row: number, col: number): Button => kb.inline_keyboard[row][col] as Button;
const labels = (kb: { inline_keyboard: Button[][] }): string[][] => kb.inline_keyboard.map((row) => row.map((b) => b.text));
const allButtons = (kb: { inline_keyboard: unknown[][] }): Button[] => (kb.inline_keyboard as Button[][]).flat();

describe('formatSpyCard', () => {
  test('registration: escaped header, counter, numbered players and the action rows', () => {
    const { text, reply_markup } = formatSpyCard(makeEvent(), people(2));

    assert.ok(text.includes('Night &lt;1&gt;'));
    assert.ok(text.includes('📍 Cafe &amp; Bar'));
    assert.ok(text.includes('Организатор: Hosty &lt;h&gt;'));
    assert.ok(text.includes('Игроки: 2 / 6'));
    assert.ok(text.includes('1. P1 &amp; x'));
    assert.ok(text.includes('2. P2 &amp; x'));
    assert.ok(text.includes('Свободно мест: 4'));

    assert.deepEqual(labels(reply_markup as never), [['✅ Участвую', '🚪 Выйти'], ['🔒 Закрыть набор'], ['🕵️ Открыть']]);
    assert.equal(buttonAt(reply_markup, 0, 0).callback_data, 'spy_join_7');
    assert.equal(buttonAt(reply_markup, 0, 1).callback_data, 'spy_leave_7');
    assert.equal(buttonAt(reply_markup, 1, 0).callback_data, 'spy_close_7');
    assert.ok(buttonAt(reply_markup, 2, 0).url!.endsWith('startapp=spy_7'));
  });

  test('registration, full: no join button and a "no seats" line', () => {
    const { text, reply_markup } = formatSpyCard(makeEvent(), people(6));
    assert.ok(text.includes('Мест нет'));
    assert.deepEqual(labels(reply_markup as never), [['🚪 Выйти'], ['🔒 Закрыть набор'], ['🕵️ Открыть']]);
  });

  test('closed: the roster and the start button', () => {
    const { text, reply_markup } = formatSpyCard(makeEvent({ status: SpyStatus.CLOSED }), people(4));
    assert.ok(text.includes('Набор закрыт'));
    assert.ok(text.includes('4. P4 &amp; x'));
    assert.deepEqual(labels(reply_markup as never), [['🎬 Начать партию'], ['🕵️ Открыть']]);
    assert.equal(buttonAt(reply_markup, 0, 0).callback_data, 'spy_start_7');
  });

  test('in progress: round number, cycle, the current speaker mention and the turn buttons', () => {
    const current = makeRound();
    const { text, reply_markup } = formatSpyCard(makeEvent({ status: SpyStatus.IN_PROGRESS }), people(5), current);

    assert.ok(text.includes('Партия №2'));
    assert.ok(text.includes('круг 2'));
    // turn_index 1 = user 2, who has no username, so a tg:// link is used
    assert.ok(text.includes('Сейчас говорит: <a href="tg://user?id=1002">P2</a>'));
    assert.ok(!text.includes('⏱'));
    assert.deepEqual(labels(reply_markup as never), [['🗣 Я сказал', '🗳 Голосование'], ['🕵️ Открыть']]);
    assert.equal(buttonAt(reply_markup, 0, 0).callback_data, 'spy_next_7');
    assert.equal(buttonAt(reply_markup, 0, 1).callback_data, 'spy_voting_7');
  });

  test('in progress: shows the turn deadline when the evening has a timer', () => {
    const current = makeRound({ turn_started_at: new Date('2026-01-01T10:00:00Z') });
    const { text } = formatSpyCard(makeEvent({ status: SpyStatus.IN_PROGRESS, turn_seconds: 60 }), people(5), current);
    assert.ok(text.includes('⏱ Ход до'));
  });

  test('voting: who voted (without targets), the score and a button per living player', () => {
    const current = makeRound({ status: SpyRoundStatus.VOTING });
    current.players[4].is_eliminated = true;
    current.voting = { ballot: 1, voterIds: [1, 2], counts: [{ userId: 3, votes: 2 }] };

    const { text, reply_markup } = formatSpyCard(makeEvent({ status: SpyStatus.IN_PROGRESS }), people(5), current);
    assert.ok(text.includes('Проголосовали (2 из 4): P1 &amp; x, P2 &amp; x'));
    assert.ok(text.includes('• P3 &amp; x — 2'));

    const votes = allButtons(reply_markup).filter((b) => b.callback_data?.startsWith('spy_vote_'));
    assert.deepEqual(votes.map((b) => b.callback_data), ['spy_vote_7_1', 'spy_vote_7_2', 'spy_vote_7_3', 'spy_vote_7_4']);
    assert.equal(votes[0].text, 'P1 & x');
    assert.ok(!allButtons(reply_markup).some((b) => b.callback_data?.startsWith('spy_voting_')));
  });

  test('voting, second ballot: buttons only for the leaders', () => {
    const current = makeRound({ status: SpyRoundStatus.VOTING });
    current.voting = { ballot: 2, voterIds: [], counts: [], candidateIds: [2, 4] };

    const { text, reply_markup } = formatSpyCard(makeEvent({ status: SpyStatus.IN_PROGRESS }), people(5), current);
    assert.ok(text.includes('Тур 2'));
    const votes = allButtons(reply_markup).filter((b) => b.callback_data?.startsWith('spy_vote_'));
    assert.deepEqual(votes.map((b) => b.callback_data), ['spy_vote_7_2', 'spy_vote_7_4']);
  });

  test('voting with unknown ballots still offers every living player', () => {
    const current = makeRound({ status: SpyRoundStatus.VOTING });
    const { text, reply_markup } = formatSpyCard(makeEvent({ status: SpyStatus.IN_PROGRESS }), people(5), current);
    assert.ok(!text.includes('Проголосовали'));
    assert.equal(allButtons(reply_markup).filter((b) => b.callback_data?.startsWith('spy_vote_')).length, 5);
  });

  test('finished round: the reveal with the location, the roles and the outcome', () => {
    const current = makeRound({ status: SpyRoundStatus.FINISHED, outcome: 'town', outcome_reason: 'vote_hit' });
    const { text, reply_markup } = formatSpyCard(makeEvent({ status: SpyStatus.IN_PROGRESS }), people(5), current);

    assert.ok(text.includes(`Локация: <b>${LOCATION}</b>`));
    assert.ok(text.includes('• P1 &amp; x — Шпион'));
    assert.ok(text.includes('• P5 &amp; x — Мистер Белый'));
    assert.ok(text.includes('Победили мирные'));
    assert.ok(text.includes('шпион разоблачён голосованием'));
    assert.deepEqual(labels(reply_markup as never), [['🎬 Ещё партия'], ['🕵️ Открыть']]);
    assert.equal(buttonAt(reply_markup, 0, 0).callback_data, 'spy_start_7');
  });

  test('finished round by a guess shows what the spy said', () => {
    const current = makeRound({ status: SpyRoundStatus.FINISHED, outcome: 'spies', outcome_reason: 'guess_correct', guess: 'лодка <3', guessed_by: 1 });
    const { text } = formatSpyCard(makeEvent({ status: SpyStatus.IN_PROGRESS }), people(5), current);
    assert.ok(text.includes('Победили шпионы'));
    assert.ok(text.includes('P1 &amp; x назвал(а): «лодка &lt;3»'));
  });

  test('an evening in progress without any round offers only to start one', () => {
    const { reply_markup } = formatSpyCard(makeEvent({ status: SpyStatus.IN_PROGRESS }), people(3), null);
    assert.deepEqual(labels(reply_markup as never), [['🎬 Начать партию'], ['🕵️ Открыть']]);
  });

  test('finished evening: no keyboard', () => {
    const { text, reply_markup } = formatSpyCard(makeEvent({ status: SpyStatus.FINISHED }), people(3));
    assert.ok(text.includes('Вечер завершён'));
    assert.deepEqual(reply_markup.inline_keyboard, []);
  });

  test('INVARIANT: before the round is finished neither the location nor any role reaches the card', () => {
    const roleNames = Object.values(SPY_ROLE_NAME);
    const check = (label: string, event: SpyEvent, current: SpyCardRound | null): void => {
      const { text, reply_markup } = formatSpyCard(event, people(5), current);
      const everything = text + JSON.stringify(reply_markup);
      assert.ok(!everything.includes(LOCATION), `${label}: location leaked`);
      for (const name of roleNames) assert.ok(!everything.includes(name), `${label}: role "${name}" leaked`);
    };

    for (const status of [SpyStatus.REGISTRATION, SpyStatus.CLOSED]) check(status, makeEvent({ status }), null);
    check('in_progress round', makeEvent({ status: SpyStatus.IN_PROGRESS }), makeRound({ status: SpyRoundStatus.IN_PROGRESS }));
    const voting = makeRound({ status: SpyRoundStatus.VOTING });
    voting.voting = { ballot: 1, voterIds: [1], counts: [{ userId: 2, votes: 1 }] };
    check('voting round', makeEvent({ status: SpyStatus.IN_PROGRESS }), voting);
    // The same data, once finished, is exactly what is allowed to show
    const finished = formatSpyCard(makeEvent({ status: SpyStatus.IN_PROGRESS }), people(5), makeRound({ status: SpyRoundStatus.FINISHED, outcome: 'town', outcome_reason: 'vote_hit' }));
    assert.ok(finished.text.includes(LOCATION));
  });
});

describe('formatSpyReveal / spyButton', () => {
  test('an aborted round has no reason in brackets when none is stored', () => {
    const { round, players } = makeRound({ status: SpyRoundStatus.FINISHED, outcome: 'aborted' });
    const lines = formatSpyReveal(round, players as SpyRoundPlayer[]);
    assert.ok(lines.includes('⛔ Партия прервана'));
  });

  test('spyButton is a single url button to the event page', () => {
    const kb = spyButton('Go', 9);
    assert.equal(buttonAt(kb, 0, 0).text, 'Go');
    assert.ok(buttonAt(kb, 0, 0).url!.endsWith('startapp=spy_9'));
  });
});
