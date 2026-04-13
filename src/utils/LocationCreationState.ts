import { StateManager } from './StateManager';

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

export class LocationCreationStateManager extends StateManager<LocationCreationState> {}
