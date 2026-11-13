import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { formatSantaCard, formatSantaDate } from '../../bot/ui/SantaMessageBuilder';
import { SantaEvent, SantaStatus } from '../../models/SantaEvent';
import { User } from '../../models/User';

function makeEvent(overrides: Partial<SantaEvent> = {}): SantaEvent {
  return {
    id: 7,
    title: 'NY <2027>',
    budget: 'до 30 AZN',
    exchange_date: '2026-12-28',
    description: null,
    status: SantaStatus.REGISTRATION,
    ...overrides,
  } as SantaEvent;
}

const people = [{ fullName: 'Alice' }, { fullName: 'Bob & Co' }] as unknown as User[];

describe('formatSantaCard', () => {
  test('registration: escaped title, details, participant names and the join button', () => {
    const { text, reply_markup } = formatSantaCard(makeEvent(), people);

    assert.ok(text.includes('Тайный Санта: NY &lt;2027&gt;'));
    assert.ok(text.includes('💰 Бюджет: до 30 AZN'));
    assert.ok(text.includes('📅 Обмен подарками: 28.12.2026'));
    assert.ok(text.includes('👥 Участники (2): Alice, Bob &amp; Co'));
    assert.equal(reply_markup.inline_keyboard[0][0].text, '🎅 Участвовать');
    assert.ok(reply_markup.inline_keyboard[0][0].url.endsWith('startapp=santa_7'));
  });

  test('registration without participants says nobody joined yet', () => {
    const { text } = formatSantaCard(makeEvent({ budget: null, exchange_date: null }), []);

    assert.ok(text.includes('Пока никто не записался'));
    assert.ok(!text.includes('Бюджет'));
    assert.ok(!text.includes('Обмен'));
  });

  test('drawn: only the count, no names, and the "who do I give to" button', () => {
    const { text, reply_markup } = formatSantaCard(makeEvent({ status: SantaStatus.DRAWN }), people);

    assert.ok(text.includes('Пары распределены (участников: 2)'));
    assert.ok(!text.includes('Alice'));
    assert.equal(reply_markup.inline_keyboard[0][0].text, '🎁 Узнать, кому дарю');
  });
});

describe('formatSantaDate', () => {
  test('YYYY-MM-DD → DD.MM.YYYY', () => {
    assert.equal(formatSantaDate('2026-01-05'), '05.01.2026');
  });
});
