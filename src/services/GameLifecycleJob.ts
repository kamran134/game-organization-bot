import { GameLifecycleService } from './GameLifecycleService';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_FIRST_RUN_DELAY_MS = 30 * 1000;

export interface GameLifecycleJobOptions {
  intervalMs?: number;
  firstRunDelayMs?: number;
}

/** Runs the auto cancel/complete pass periodically; returns a function that stops the job. */
export function startGameLifecycleJob(
  service: Pick<GameLifecycleService, 'runAutoTransitions'>,
  options: GameLifecycleJobOptions = {},
): () => void {
  let running = false;

  const tick = async (): Promise<void> => {
    // A slow pass must not overlap with the next tick
    if (running) return;
    running = true;
    try {
      const { cancelled, completed } = await service.runAutoTransitions();
      if (cancelled.length > 0 || completed.length > 0) {
        console.log(`Game lifecycle: cancelled [${cancelled.join(', ')}], completed [${completed.join(', ')}]`);
      }
    } catch (error) {
      console.error('Game lifecycle job failed:', error);
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
