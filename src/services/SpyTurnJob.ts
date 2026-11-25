import { SpyService, SpyTurnTimeout } from './SpyService';

const DEFAULT_INTERVAL_MS = 20 * 1000;
const DEFAULT_FIRST_RUN_DELAY_MS = 30 * 1000;

export interface SpyTurnJobOptions {
  intervalMs?: number;
  firstRunDelayMs?: number;
  /** Called with the turns that were just passed on; keeps the job itself free of Telegram. */
  onTimeouts?: (timeouts: SpyTurnTimeout[]) => Promise<void>;
}

/** Passes the turn of expired Spy rounds periodically; returns a function that stops the job. */
export function startSpyTurnJob(
  service: Pick<SpyService, 'runTurnTimeouts'>,
  options: SpyTurnJobOptions = {},
): () => void {
  let running = false;

  const tick = async (): Promise<void> => {
    // A slow pass must not overlap with the next tick
    if (running) return;
    running = true;
    try {
      const timeouts = await service.runTurnTimeouts();
      if (timeouts.length > 0) {
        console.log(`Spy turns: ${timeouts.length} passed on after timeout`);
        await options.onTimeouts?.(timeouts);
      }
    } catch (error) {
      console.error('Spy turn job failed:', error);
    } finally {
      running = false;
    }
  };

  const first = setTimeout(() => void tick(), options.firstRunDelayMs ?? DEFAULT_FIRST_RUN_DELAY_MS);
  first.unref();
  const interval = setInterval(() => void tick(), options.intervalMs ?? DEFAULT_INTERVAL_MS);
  interval.unref();

  return () => {
    clearTimeout(first);
    clearInterval(interval);
  };
}
