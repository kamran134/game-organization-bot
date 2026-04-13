export type LocationEditStep = 'menu' | 'name' | 'map_url' | 'sports';

export interface LocationEditData {
  locationId: number;
  locationName: string;
  name?: string;
  mapUrl?: string;
  sportIds?: number[];
}

export interface LocationEditState {
  step: LocationEditStep;
  groupId: number;
  data: LocationEditData;
}

/** Default TTL for edit states: 30 minutes */
const STATE_TTL_MS = 30 * 60 * 1000;

export class LocationEditStateManager {
  private states: Map<number, LocationEditState>;
  private timers: Map<number, ReturnType<typeof setTimeout>>;

  constructor() {
    this.states = new Map();
    this.timers = new Map();
  }

  get(userId: number): LocationEditState | undefined {
    return this.states.get(userId);
  }

  set(userId: number, state: LocationEditState): void {
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
}
