import { StateManager } from './StateManager';

/** In-progress state for a training creation wizard. */
export interface TrainingCreationState {
  step: 'sport' | 'date' | 'location' | 'min_participants' | 'max_participants' | 'cost' | 'notes' | 'confirm';
  groupId: number;
  userId: number;
  data: {
    sportId?: number;
    sportName?: string;
    gameDate?: Date;
    locationId?: number;
    locationName?: string;
    minParticipants?: number;
    maxParticipants?: number;
    cost?: number;
    notes?: string;
  };
}

export class TrainingCreationStateManager extends StateManager<TrainingCreationState> {}
