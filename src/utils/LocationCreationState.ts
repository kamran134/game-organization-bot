export type LocationCreationStep = 'name' | 'sport' | 'location_selection' | 'map_url' | 'confirmation';

export interface LocationCreationData {
  name?: string;
  sportId?: number;
  sportName?: string;
  mapUrl?: string;
}

export interface LocationCreationState {
  step: LocationCreationStep;
  groupId: number;
  userId: number;
  data: LocationCreationData;
}

/** Default TTL for creation states: 30 minutes */
const STATE_TTL_MS = 30 * 60 * 1000;

export class LocationCreationStateManager {
  private states: Map<number, LocationCreationState>;
  private timers: Map<number, ReturnType<typeof setTimeout>>;

  constructor() {
    this.states = new Map();
    this.timers = new Map();
  }

  get(userId: number): LocationCreationState | undefined {
    return this.states.get(userId);
  }

  set(userId: number, state: LocationCreationState): void {
    this.states.set(userId, state);
    const existing = this.timers.get(userId);
    if (existing) clearTimeout(existing);
    this.timers.set(userId, setTimeout(() => this.delete(userId), STATE_TTL_MS));
  }

  delete(userId: number): void {
    this.states.delete(userId);
    const timer = this.timers.get(userId);
    if (timer) { clearTimeout(timer); this.timers.delete(userId); }
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
