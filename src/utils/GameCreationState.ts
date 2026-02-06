/**
 * Временное хранилище состояний создания игр
 * В продакшне лучше использовать Redis или БД
 */

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

export class GameCreationStateManager {
  private states: Map<number, GameCreationState> = new Map();

  set(userId: number, state: GameCreationState): void {
    this.states.set(userId, state);
  }

  get(userId: number): GameCreationState | undefined {
    return this.states.get(userId);
  }

  delete(userId: number): void {
    this.states.delete(userId);
  }

  has(userId: number): boolean {
    return this.states.has(userId);
  }
}
