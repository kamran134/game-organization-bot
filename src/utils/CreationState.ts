import { GameType } from '../models/GameType';
import { StateManager } from './StateManager';

export type CreationStep =
  | 'sport'
  | 'date'
  | 'location'
  | 'min_participants'
  | 'max_participants'
  | 'cost'
  | 'notes'
  | 'confirm';

export interface CreationData {
  sportId?: number;
  sportName?: string;
  gameDate?: Date;
  locationId?: number;
  locationName?: string;
  /** Set when the location was typed (not picked): it is created on confirm, so a cancel leaves no orphan row. */
  locationMapUrl?: string;
  minParticipants?: number;
  maxParticipants?: number;
  cost?: number;
  notes?: string;
}

/** In-progress state of the game/training creation wizard. */
export interface CreationState {
  type: GameType;
  step: CreationStep;
  groupId: number;
  userId: number;
  data: CreationData;
}

export class CreationStateManager extends StateManager<CreationState> {}
