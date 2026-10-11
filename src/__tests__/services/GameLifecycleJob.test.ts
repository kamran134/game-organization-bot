import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startGameLifecycleJob } from '../../services/GameLifecycleJob';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('startGameLifecycleJob', () => {
  test('never starts a run while the previous one is still going', async () => {
    let started = 0;
    let concurrent = 0;
    let maxConcurrent = 0;
    const service = {
      runAutoTransitions: async (): Promise<{ cancelled: number[]; completed: number[] }> => {
        started += 1;
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await sleep(80);
        concurrent -= 1;
        return { cancelled: [], completed: [] };
      },
    };

    const stop = startGameLifecycleJob(service, { intervalMs: 10, firstRunDelayMs: 0 });
    await sleep(60);
    stop();

    assert.equal(started, 1);
    assert.equal(maxConcurrent, 1);
    await sleep(100); // let the in-flight run finish before the test ends
  });

  test('stop() cancels the first run and the interval', async () => {
    let runs = 0;
    const service = {
      runAutoTransitions: async (): Promise<{ cancelled: number[]; completed: number[] }> => {
        runs += 1;
        return { cancelled: [], completed: [] };
      },
    };

    const stop = startGameLifecycleJob(service, { intervalMs: 10, firstRunDelayMs: 0 });
    await sleep(35);
    stop();
    const runsAtStop = runs;
    await sleep(50);

    assert.ok(runsAtStop >= 1);
    assert.equal(runs, runsAtStop);
  });

  test('stopping before the first run means it never happens', async () => {
    let runs = 0;
    const service = {
      runAutoTransitions: async (): Promise<{ cancelled: number[]; completed: number[] }> => {
        runs += 1;
        return { cancelled: [], completed: [] };
      },
    };

    const stop = startGameLifecycleJob(service, { intervalMs: 10, firstRunDelayMs: 30 });
    stop();
    await sleep(60);

    assert.equal(runs, 0);
  });

  test('a failing run is logged and the next tick still runs', async () => {
    let runs = 0;
    const service = {
      runAutoTransitions: async (): Promise<{ cancelled: number[]; completed: number[] }> => {
        runs += 1;
        if (runs === 1) throw new Error('connection lost');
        return { cancelled: [], completed: [] };
      },
    };

    const { error } = console;
    console.error = (): void => undefined;
    const stop = startGameLifecycleJob(service, { intervalMs: 10, firstRunDelayMs: 0 });
    await sleep(60);
    stop();
    console.error = error;

    assert.ok(runs >= 2);
  });
});
