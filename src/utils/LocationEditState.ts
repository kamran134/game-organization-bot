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

export class LocationEditStateManager {
  private states: Map<number, LocationEditState>;

  constructor() {
    this.states = new Map();
  }

  get(userId: number): LocationEditState | undefined {
    return this.states.get(userId);
  }

  set(userId: number, state: LocationEditState): void {
    this.states.set(userId, state);
  }

  delete(userId: number): void {
    this.states.delete(userId);
  }

  has(userId: number): boolean {
    return this.states.has(userId);
  }
}
