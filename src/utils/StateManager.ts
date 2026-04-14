/** Default TTL for wizard states: 30 minutes. */
const STATE_TTL_MS = 30 * 60 * 1000;

/**
 * Generic in-memory wizard-state store with per-entry TTL.
 * All four creation/edit state managers extend this class.
 */
export class StateManager<T> {
  private states: Map<number, T> = new Map();
  private timers: Map<number, ReturnType<typeof setTimeout>> = new Map();

  get(userId: number): T | undefined {
    return this.states.get(userId);
  }

  set(userId: number, state: T): void {
    this.states.set(userId, state);
    const existing = this.timers.get(userId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => this.delete(userId), STATE_TTL_MS);
    timer.unref();
    this.timers.set(userId, timer);
  }

  delete(userId: number): void {
    this.states.delete(userId);
    const timer = this.timers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(userId);
    }
  }

  has(userId: number): boolean {
    return this.states.has(userId);
  }

  clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.states.clear();
    this.timers.clear();
  }
}
