/**
 * Временное хранилище состояний создания тренировок
 * Аналогично GameCreationState, но с опциональными max_participants и cost
 */

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
    maxParticipants?: number; // Опционально для тренировок
    cost?: number; // Опционально для тренировок
    notes?: string;
  };
}

export class TrainingCreationStateManager {
  private states: Map<number, TrainingCreationState> = new Map();

  set(userId: number, state: TrainingCreationState): void {
    this.states.set(userId, state);
  }

  get(userId: number): TrainingCreationState | undefined {
    return this.states.get(userId);
  }

  delete(userId: number): void {
    this.states.delete(userId);
  }

  has(userId: number): boolean {
    return this.states.has(userId);
  }
}
