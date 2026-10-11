import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { WikiCommand } from '../../bot/commands/WikiCommand';

function countOf(text: string, char: string): number {
  return text.split(char).length - 1;
}

describe('WikiCommand', () => {
  async function runWiki(): Promise<string[]> {
    const texts: string[] = [];
    const ctx = { reply: async (text: string) => { texts.push(text); } };
    await new WikiCommand({} as never).execute(ctx as never);
    return texts;
  }

  test('sends the wiki in several messages, each within the 4096-char Telegram limit', async () => {
    const texts = await runWiki();
    assert.ok(texts.length > 1, 'wiki is longer than one message');
    for (const text of texts) {
      assert.ok(text.length <= 4096, `chunk of ${text.length} chars exceeds the limit`);
      assert.ok(text.trim().length > 0);
    }
  });

  test('no Markdown entity is left open at a chunk boundary', async () => {
    for (const text of await runWiki()) {
      assert.equal(countOf(text, '*') % 2, 0, 'unbalanced bold markers');
      assert.equal(countOf(text, '`') % 2, 0, 'unbalanced code markers');
    }
  });
});
