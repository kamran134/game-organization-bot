import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { JokeService } from '../../services/JokeService';

// JokeService reads process.env.GROQ_API_KEY in the constructor.
// We manipulate the env var before each instantiation.

describe('JokeService — no API key', () => {
  test('getDeclineJoke returns a non-empty string when no GROQ_API_KEY', async () => {
    delete process.env.GROQ_API_KEY;
    const service = new JokeService();
    const joke = await service.getDeclineJoke('Alice');
    assert.equal(typeof joke, 'string');
    assert.ok(joke.length > 0);
  });

  test('always returns non-empty string across multiple calls', async () => {
    delete process.env.GROQ_API_KEY;
    const service = new JokeService();
    for (let i = 0; i < 10; i++) {
      const joke = await service.getDeclineJoke('Bob');
      assert.equal(typeof joke, 'string');
      assert.ok(joke.length > 0, `call #${i} returned empty string`);
    }
  });
});

describe('JokeService — Groq API mock', () => {
  test('returns fallback when Groq returns empty content', async () => {
    delete process.env.GROQ_API_KEY;
    const service = new JokeService();

    // Inject a fake Groq client that returns an empty message
    (service as any).groq = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: '' } }],
          }),
        },
      },
    };

    const joke = await service.getDeclineJoke('Alice');
    assert.equal(typeof joke, 'string');
    assert.ok(joke.length > 0);
  });

  test('returns fallback when Groq throws an error', async () => {
    delete process.env.GROQ_API_KEY;
    const service = new JokeService();

    (service as any).groq = {
      chat: {
        completions: {
          create: async () => { throw new Error('Network error'); },
        },
      },
    };

    // Must not throw
    const joke = await service.getDeclineJoke('Alice');
    assert.equal(typeof joke, 'string');
    assert.ok(joke.length > 0);
  });

  test('returns Groq response when API succeeds', async () => {
    delete process.env.GROQ_API_KEY;
    const service = new JokeService();

    (service as any).groq = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: 'Funny joke here' } }],
          }),
        },
      },
    };

    const joke = await service.getDeclineJoke('Alice');
    assert.equal(joke, 'Funny joke here');
  });
});
