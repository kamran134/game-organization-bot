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
  goMafiaList(): void;
  goMafiaEvent(eventId: number): void;
  goMafiaCreate(): void;
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

// ─── Mafia ───────────────────────────────────────────────────────────────────

export type MafiaStatus = 'registration' | 'closed' | 'dealt' | 'finished';
export type MafiaRole = 'civilian' | 'mafia' | 'don' | 'commissar' | 'doctor' | 'maniac' | 'lover';
export type MafiaRoleCounts = Record<MafiaRole, number>;

export interface MafiaEventSummaryDto {
  id: number;
  title: string;
  starts_at: string | null;
  place: string | null;
  status: MafiaStatus;
  round: number;
  max_players: number;
  host: SantaPersonDto | null;
  participants_count: number;
  joined: boolean;
  isHost: boolean;
}

export interface MafiaEventDto {
  id: number;
  group_id: number;
  title: string;
  description: string | null;
  starts_at: string | null;
  place: string | null;
  status: MafiaStatus;
  host: SantaPersonDto | null;
  show_mafia_team: boolean;
  assign_seats: boolean;
  max_players: number;
  round: number;
  dealt_at: string | null;
}

export interface MafiaParticipantDto extends SantaParticipantDto {
  seat: number | null;
}

export interface MafiaCardDto {
  round: number;
  role: MafiaRole;
  seat: number | null;
  variant: number;
  teammates: Array<{ name: string; role: MafiaRole; seat: number | null }>;
}

export interface MafiaDetailsDto {
  event: MafiaEventDto;
  participants: MafiaParticipantDto[];
  joined: boolean;
  isHost: boolean;
  canManage: boolean;
  myCard: MafiaCardDto | null;
  suggestedCounts: MafiaRoleCounts | null;
  rolesConfig: MafiaRoleCounts | null;
}

export interface MafiaLayoutDto {
  round: number;
  players: Array<MafiaParticipantDto & { role: MafiaRole | null }>;
}
