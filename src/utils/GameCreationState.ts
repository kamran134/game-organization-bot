/**
 * Временное хранилище состояний создания игр
 * В продакшене лучше использовать Redis или БД
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

/** Default TTL for creation states: 30 minutes */
const STATE_TTL_MS = 30 * 60 * 1000;

export class GameCreationStateManager {
  private states: Map<number, GameCreationState> = new Map();
  private timers: Map<number, ReturnType<typeof setTimeout>> = new Map();

  set(userId: number, state: GameCreationState): void {
    this.states.set(userId, state);
    // Reset TTL
    const existing = this.timers.get(userId);
    if (existing) clearTimeout(existing);
    this.timers.set(userId, setTimeout(() => this.delete(userId), STATE_TTL_MS));
  }

  get(userId: number): GameCreationState | undefined {
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
