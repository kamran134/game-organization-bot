import { StateManager } from './StateManager';

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

export class LocationEditStateManager extends StateManager<LocationEditState> {}
