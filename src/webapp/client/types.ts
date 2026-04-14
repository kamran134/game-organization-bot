/** DTOs returned by the API — mirrors server-side models. */

export interface SportDto {
  id: number;
  name: string;
  emoji: string;
}

export interface LocationDto {
  id: number;
  name: string;
}

export interface ParticipantDto {
  id?: number;
  participation_status: 'confirmed' | 'maybe' | 'guest';
  guest_name?: string;
  user?: {
    telegram_id: number | string;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
}

export type GameType = 'game' | 'training';

export interface GameDto {
  id: number;
  type: GameType;
  game_date: string;
  max_participants: number;
  min_participants: number;
  cost?: number;
  notes?: string;
  sport?: SportDto;
  location?: LocationDto;
  participants?: ParticipantDto[];
}

export interface UserRoleDto {
  isAdmin: boolean;
  userId: number;
}

/** Shared navigation object passed to every page renderer. */
export interface Nav {
  goHome(): void;
  goGamesList(): void;
  goCreateForm(type: GameType): void;
  goEditGame(gameId: number): void;
  goCreateLocation(): void;
}
