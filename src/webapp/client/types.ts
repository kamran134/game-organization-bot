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
  /** 1-based team number; null / absent = not assigned. */
  team?: number | null;
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
  /** Number of teams the roster is split into; null / absent = not split yet. */
  team_count?: number | null;
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

export type Gender = 'male' | 'female';

export interface MemberDto {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string | null;
  gender?: Gender | null;
}

/** The caller's own profile: only the gender is editable here, the rest is set by an admin. */
export type MyProfileDto = MemberDto;

/** Shared navigation object passed to every page renderer. */
export interface Nav {
  goHome(): void;
  goGamesList(): void;
  goCreateForm(type: GameType): void;
  goEditGame(gameId: number): void;
  goCreateLocation(): void;
  goMembers(): void;
  goProfile(): void;
  goSports(): void;
  goManage(): void;
  goSantaList(): void;
  goSantaEvent(eventId: number): void;
  goSantaCreate(): void;
  goMafiaList(): void;
  goMafiaEvent(eventId: number): void;
  goMafiaCreate(): void;
  goMafiaDeck(): void;
  goSpyList(): void;
  goSpyEvent(eventId: number): void;
  goSpyCreate(): void;
  goSpyLocations(): void;
  goSpyStats(): void;
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
  gender?: Gender | null;
  seat: number | null;
}

export interface MafiaCardDto {
  round: number;
  role: MafiaRole;
  /** The card owner's own gender — the role name on the card follows it. */
  gender?: Gender | null;
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

export type MafiaLogPhase = 'night' | 'day';
export type MafiaLogType = 'kill' | 'heal' | 'check' | 'block' | 'lynch' | 'note';

export interface MafiaLogEntryDto {
  id: number;
  cycle: number;
  phase: MafiaLogPhase;
  type: MafiaLogType;
  target_user_id: number | null;
  target: { first_name?: string; last_name?: string | null; username?: string | null; gender?: Gender | null } | null;
  /** Only set for `check` entries. */
  target_role: MafiaRole | null;
  note: string | null;
  created_at: string;
}

export interface MafiaLogStateDto {
  alive: number[];
  dead: number[];
  counts: { alive: number; mafia: number; town: number; solo: number };
  /** The game result (`solo` = the maniac); null = the game goes on. The host still finishes the evening manually. */
  outcome: 'town' | 'mafia' | 'solo' | null;
  /** Per dealt role: last cycle whose night it can act in; null = no limit. */
  rolesLastNight: Partial<Record<MafiaRole, number | null>>;
}

export interface MafiaLogDto {
  round: number;
  entries: MafiaLogEntryDto[];
  state: MafiaLogStateDto;
}

// ─── Spy ─────────────────────────────────────────────────────────────────────

export type SpyStatus = 'registration' | 'closed' | 'in_progress' | 'finished';
export type SpyRoundStatus = 'in_progress' | 'voting' | 'finished';
export type SpyRole = 'civilian' | 'spy' | 'double_agent' | 'mr_white';
export type SpyOutcome = 'town' | 'spies' | 'aborted';
export type SpyOutcomeReason = 'vote_hit' | 'vote_miss' | 'guess_correct' | 'guess_wrong' | 'manual';

export interface SpyLocationDto {
  id: number;
  name: string;
  pack: string;
  /** null = a global location, shared by every group. */
  group_id: number | null;
  is_active: boolean;
}

export interface SpyPackDto {
  id: string;
  title: string;
  emoji: string;
  adult: boolean;
}

export interface SpyEventSummaryDto {
  id: number;
  title: string;
  starts_at: string | null;
  place: string | null;
  status: SpyStatus;
  round: number;
  max_players: number;
  host: SantaPersonDto | null;
  participants_count: number;
  joined: boolean;
  isHost: boolean;
}

export interface SpyEventDto {
  id: number;
  group_id: number;
  title: string;
  description: string | null;
  starts_at: string | null;
  place: string | null;
  status: SpyStatus;
  host_id: number | null;
  host: SantaPersonDto | null;
  max_players: number;
  /** null = chosen automatically from the number of players. */
  spy_count: number | null;
  double_agent: boolean;
  mr_white: boolean;
  packs: string[];
  /** null = no turn timer. */
  turn_seconds: number | null;
  /** null = the spy never gets a hint. */
  hint_after_cycles: number | null;
  round: number;
}

export interface SpyParticipantDto extends SantaParticipantDto {
  is_active: boolean;
}

export interface SpyRoundPlayerDto extends SantaParticipantDto {
  is_eliminated: boolean;
  /** Present only once the round is finished. */
  role?: SpyRole;
}

export interface SpyRoundDto {
  id: number;
  number: number;
  status: SpyRoundStatus;
  cycle: number;
  turn_order: number[];
  current_user_id: number | null;
  deadline: string | null;
  started_at: string;
  finished_at: string | null;
  players: SpyRoundPlayerDto[];
  // The reveal: absent from the response until the round is finished.
  location_name?: string;
  location_pack?: string;
  outcome?: SpyOutcome | null;
  outcome_reason?: SpyOutcomeReason | null;
  guess?: string | null;
  guessed_by?: number | null;
}

export interface SpyCardDto {
  round: number;
  role: SpyRole;
  /** null for the spy and for Mr. White. */
  location: string | null;
  /** The pack title, once the spy has earned a hint. */
  hint: string | null;
  cycle: number;
  current_user_id: number | null;
  is_my_turn: boolean;
  deadline: string | null;
}

export interface SpyVotingStateDto {
  round_id: number;
  ballot: number;
  voter_ids: number[];
  counts: Array<{ user_id: number; votes: number }>;
  leaders: number[];
  /** Set for the runoff ballot: only these players may be voted for. */
  candidate_ids: number[] | null;
}

export interface SpyLimitsDto {
  min_players: number;
  max_players: number;
  turn_seconds: { min: number; max: number };
  hint_cycles: { min: number; max: number };
}

/** GET /api/spy/meta: what the create form and the settings panel need before any event exists. */
export interface SpyMetaDto {
  packs: SpyPackDto[];
  limits: SpyLimitsDto;
}

export interface SpyDetailsDto {
  event: SpyEventDto;
  /** The caller, so the screen knows whom not to offer as a vote candidate. */
  me: { userId: number };
  participants: SpyParticipantDto[];
  joined: boolean;
  isHost: boolean;
  canManage: boolean;
  myCard: SpyCardDto | null;
  round: SpyRoundDto | null;
  votingState: SpyVotingStateDto | null;
  suggestedSpyCount: number;
  packs: SpyPackDto[];
}

export interface SpyStatsRowDto extends SantaParticipantDto {
  rounds: number;
  wins: number;
  spy_rounds: number;
  spy_wins: number;
  exposed: number;
  guessed: number;
  /** A fraction 0..1. */
  win_rate: number;
}
