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

export class LocationCreationStateManager {
  private states: Map<number, LocationCreationState>;

  constructor() {
    this.states = new Map();
  }

  get(userId: number): LocationCreationState | undefined {
    return this.states.get(userId);
  }

  set(userId: number, state: LocationCreationState): void {
    this.states.set(userId, state);
  }

  delete(userId: number): void {
    this.states.delete(userId);
  }

  has(userId: number): boolean {
    return this.states.has(userId);
  }

  clear(): void {
    this.states.clear();
  }
}
