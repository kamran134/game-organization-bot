import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startSpyTurnJob } from '../../services/SpyTurnJob';
import type { SpyTurnTimeout } from '../../services/SpyService';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
/** Polls until the condition holds (or the deadline passes) so tests do not depend on machine load. */
async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition() && Date.now() < deadline) await sleep(10);
}
/** Lets pending timers fire for a short while, to prove that something does NOT happen. */
const settle = (): Promise<void> => sleep(100);
const moved: SpyTurnTimeout = { eventId: 1, roundId: 2, previousUserId: 3, currentUserId: 4 };

describe('startSpyTurnJob', () => {
  test('never starts a run while the previous one is still going', async () => {
    let started = 0;
    let concurrent = 0;
    let maxConcurrent = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const service = {
      runTurnTimeouts: async (): Promise<SpyTurnTimeout[]> => {
        started += 1;
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await gate; // the run stays in flight until the test releases it
        concurrent -= 1;
        return [];
      },
    };

    const stop = startSpyTurnJob(service, { intervalMs: 10, firstRunDelayMs: 0 });
    await waitFor(() => started >= 1);
    await sleep(100); // many 10ms interval ticks fire while the run is blocked
    assert.equal(started, 1);
    assert.equal(maxConcurrent, 1);

    release();
    await waitFor(() => started >= 2); // once the run is done, the next tick may start
    stop();
    release();
    assert.equal(maxConcurrent, 1);
  });

  test('hands the passed turns to onTimeouts', async () => {
    const seen: SpyTurnTimeout[][] = [];
    const service = { runTurnTimeouts: async (): Promise<SpyTurnTimeout[]> => [moved] };

    const { log } = console;
    console.log = (): void => undefined;
    const stop = startSpyTurnJob(service, {
      intervalMs: 1000,
      firstRunDelayMs: 0,
      onTimeouts: async (t) => {
        seen.push(t);
      },
    });
    await waitFor(() => seen.length >= 1);
    stop();
    console.log = log;

    assert.deepEqual(seen, [[moved]]);
  });

  test('stop() cancels the first run and the interval', async () => {
    let runs = 0;
    const service = {
      runTurnTimeouts: async (): Promise<SpyTurnTimeout[]> => {
        runs += 1;
        return [];
      },
    };

    const stop = startSpyTurnJob(service, { intervalMs: 10, firstRunDelayMs: 0 });
    await waitFor(() => runs >= 2);
    stop();
    const runsAtStop = runs;
    await settle();

    assert.ok(runsAtStop >= 1);
    assert.equal(runs, runsAtStop);
  });

  test('stopping before the first run means it never happens', async () => {
    let runs = 0;
    const service = {
      runTurnTimeouts: async (): Promise<SpyTurnTimeout[]> => {
        runs += 1;
        return [];
      },
    };

    const stop = startSpyTurnJob(service, { intervalMs: 10, firstRunDelayMs: 30 });
    stop();
    await sleep(120); // well past the 30ms first-run delay

    assert.equal(runs, 0);
  });

  test('a failing service or handler is logged and the next tick still runs', async () => {
    let runs = 0;
    const service = {
      runTurnTimeouts: async (): Promise<SpyTurnTimeout[]> => {
        runs += 1;
        if (runs === 1) throw new Error('connection lost');
        return [moved];
      },
    };

    const { error, log } = console;
    console.error = (): void => undefined;
    console.log = (): void => undefined;
    const stop = startSpyTurnJob(service, {
      intervalMs: 10,
      firstRunDelayMs: 0,
      onTimeouts: async () => {
        throw new Error('telegram down');
      },
    });
    await waitFor(() => runs >= 3);
    stop();
    console.error = error;
    console.log = log;

    assert.ok(runs >= 3);
  });
});
