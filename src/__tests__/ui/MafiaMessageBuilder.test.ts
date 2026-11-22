import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMafiaCard, mafiaButton } from '../../bot/ui/MafiaMessageBuilder';
import { MafiaEvent, MafiaStatus } from '../../models/MafiaEvent';
import { User } from '../../models/User';

function makeEvent(overrides: Partial<MafiaEvent> = {}): MafiaEvent {
  return {
    id: 7,
    title: 'Night <1>',
    description: null,
    starts_at: null,
    place: 'Cafe & Bar',
    status: MafiaStatus.REGISTRATION,
    max_players: 6,
    round: 0,
    host: { fullName: 'Hosty <h>' },
    ...overrides,
  } as unknown as MafiaEvent;
}

const people = (n: number): User[] => Array.from({ length: n }, (_, i) => ({ fullName: `P${i + 1} & x` }) as unknown as User);

type Button = { text: string; url?: string; callback_data?: string };
const buttonAt = (kb: { inline_keyboard: unknown[][] }, row: number, col: number): Button => kb.inline_keyboard[row][col] as Button;
const labels = (kb: { inline_keyboard: Button[][] }): string[][] => kb.inline_keyboard.map((row) => row.map((b) => b.text));

describe('formatMafiaCard', () => {
  test('registration: escaped header, counter, numbered players and the three action rows', () => {
    const { text, reply_markup } = formatMafiaCard(makeEvent(), people(2));

    assert.ok(text.includes('Мафия: Night &lt;1&gt;'));
    assert.ok(text.includes('📍 Cafe &amp; Bar'));
    assert.ok(text.includes('🎙 Ведущий: Hosty &lt;h&gt;'));
    assert.ok(text.includes('Игроки: 2 / 6'));
    assert.ok(text.includes('1. P1 &amp; x'));
    assert.ok(text.includes('2. P2 &amp; x'));

    assert.deepEqual(labels(reply_markup as never), [['✅ Записаться', '❌ Выйти'], ['🔒 Закрыть запись'], ['🎭 Открыть']]);
    assert.equal(buttonAt(reply_markup, 0, 0).callback_data, 'mafia_join_7');
    assert.equal(buttonAt(reply_markup, 0, 1).callback_data, 'mafia_leave_7');
    assert.equal(buttonAt(reply_markup, 1, 0).callback_data, 'mafia_close_7');
    assert.ok(buttonAt(reply_markup, 2, 0).url!.endsWith('startapp=mafia_7'));
  });

  test('registration with no players says so', () => {
    assert.ok(formatMafiaCard(makeEvent(), []).text.includes('Игроки: 0 / 6'));
  });

  test('registration, full: no join button and a "no seats" line', () => {
    const { text, reply_markup } = formatMafiaCard(makeEvent(), people(6));
    assert.ok(text.includes('Мест нет'));
    assert.deepEqual(labels(reply_markup as never), [['❌ Выйти'], ['🔒 Закрыть запись'], ['🎭 Открыть']]);
  });

  test('closed: only the open button and a closed line', () => {
    const { text, reply_markup } = formatMafiaCard(makeEvent({ status: MafiaStatus.CLOSED }), people(5));
    assert.ok(text.includes('Запись закрыта'));
    assert.deepEqual(labels(reply_markup as never), [['🎭 Открыть']]);
  });

  test('dealt: round and the card button, no roles in the text', () => {
    const { text, reply_markup } = formatMafiaCard(makeEvent({ status: MafiaStatus.DEALT, round: 2 }), people(5));
    assert.ok(text.includes('Роли розданы — партия №2'));
    assert.deepEqual(labels(reply_markup as never), [['🎭 Моя карточка']]);
    assert.ok(buttonAt(reply_markup, 0, 0).url!.endsWith('startapp=mafia_7'));
  });

  test('finished: no buttons', () => {
    const { text, reply_markup } = formatMafiaCard(makeEvent({ status: MafiaStatus.FINISHED }), people(5));
    assert.ok(text.includes('Вечер завершён'));
    assert.deepEqual(reply_markup.inline_keyboard, []);
  });
});

describe('mafiaButton', () => {
  test('is a single url button to the event page', () => {
    const kb = mafiaButton('Go', 9);
    assert.equal(kb.inline_keyboard.length, 1);
    assert.ok((kb.inline_keyboard[0][0] as Button).url!.endsWith('startapp=mafia_9'));
  });
});
