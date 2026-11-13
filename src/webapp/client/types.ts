/** DTOs returned by the API — mirrors server-side models. */

export interface SportDto {
  id: number;
  name: string;
  emoji: string;
  /** true for a base sport (available to every group, not editable by a group admin). */
  is_base?: boolean;
  group_id?: number | null;
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

export interface PaymentPersonDto {
  user_id: number | null;
  guest_name: string | null;
  first_name?: string;
  last_name?: string;
  username?: string;
  payment_amount: number | null;
}

export interface PaymentsDto {
  people: PaymentPersonDto[];
  total: number;
  month: string; // 'YYYY-MM'
}

/** Alias – training payments endpoint returns the same shape. */
export type TrainingPaymentsDto = PaymentsDto;

export interface MemberDto {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

/** Shared navigation object passed to every page renderer. */
export interface Nav {
  goHome(): void;
  goGamesList(): void;
  goCreateForm(type: GameType): void;
  goEditGame(gameId: number): void;
  goCreateLocation(): void;
  goMembers(): void;
  goSports(): void;
  goSantaList(): void;
  goSantaEvent(eventId: number): void;
  goSantaCreate(): void;
}

export type SantaStatus = 'registration' | 'drawn' | 'finished';

export interface SantaEventSummaryDto {
  id: number;
  title: string;
  budget: string | null;
  exchange_date: string | null;
  status: SantaStatus;
  participants_count: number;
  joined: boolean;
}

export interface SantaEventDto {
  id: number;
  group_id: number;
  title: string;
  description: string | null;
  budget: string | null;
  exchange_date: string | null;
  status: SantaStatus;
  drawn_at: string | null;
}

export interface SantaPersonDto {
  first_name?: string;
  last_name?: string;
  username?: string | null;
}

export interface SantaParticipantDto extends SantaPersonDto {
  user_id: number;
}

export interface SantaDetailsDto {
  event: SantaEventDto;
  participants: SantaParticipantDto[];
  me: { joined: boolean; wishlist: string | null };
  assignment: { receiver: SantaPersonDto; wishlist: string | null } | null;
  isAdmin: boolean;
}
