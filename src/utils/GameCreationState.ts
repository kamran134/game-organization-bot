import { StateManager } from './StateManager';

/** In-progress state for a game creation wizard. */
export interface GameCreationState {
  step: 'sport' | 'date' | 'location' | 'max_participants' | 'min_participants' | 'cost' | 'notes' | 'confirm';
  groupId: number;
  userId: number;
  data: {
    sportId?: number;
    sportName?: string;
    gameDate?: Date;
    locationId?: number;
    locationName?: string;
    maxParticipants?: number;
    minParticipants?: number;
    cost?: number;
    notes?: string;
  };
}

export class GameCreationStateManager extends StateManager<GameCreationState> {}
