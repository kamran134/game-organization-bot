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

/** Default TTL for creation states: 30 minutes */
const STATE_TTL_MS = 30 * 60 * 1000;

export class TrainingCreationStateManager {
  private states: Map<number, TrainingCreationState> = new Map();
  private timers: Map<number, ReturnType<typeof setTimeout>> = new Map();

  set(userId: number, state: TrainingCreationState): void {
    this.states.set(userId, state);
    const existing = this.timers.get(userId);
    if (existing) clearTimeout(existing);
    this.timers.set(userId, setTimeout(() => this.delete(userId), STATE_TTL_MS));
  }

  get(userId: number): TrainingCreationState | undefined {
    return this.states.get(userId);
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
