import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn, Index, Check } from 'typeorm';
import { Group } from './Group';
import { User } from './User';
import type { SpyParticipant } from './SpyParticipant';
import type { SpyRound } from './SpyRound';

export enum SpyStatus {
  REGISTRATION = 'registration',
  /** Registration stopped early; no round started yet. */
  CLOSED = 'closed',
  IN_PROGRESS = 'in_progress',
  FINISHED = 'finished',
}

/** An evening of the Spy game: a set of participants and the rounds played with them. */
@Entity('spy_events')
@Index('idx_spy_events_group_id', ['group_id'])
@Check('chk_spy_events_max_players', 'max_players BETWEEN 3 AND 20')
@Check('chk_spy_events_spy_count', 'spy_count IS NULL OR spy_count >= 1')
@Check('chk_spy_events_turn_seconds', 'turn_seconds IS NULL OR turn_seconds BETWEEN 15 AND 300')
@Check('chk_spy_events_hint_after_cycles', 'hint_after_cycles IS NULL OR hint_after_cycles BETWEEN 1 AND 10')
export class SpyEvent {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  group_id!: number;

  @ManyToOne(() => Group, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group!: Group;

  @Column({ type: 'varchar', length: 100 })
  title!: string;

  // Nullable union-typed columns need an explicit type (see the comment in User.ts)
  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  starts_at?: Date | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  place?: string | null;

  @Column({ type: 'varchar', length: 20, default: SpyStatus.REGISTRATION })
  status!: SpyStatus;

  /** The organizer. Unlike Mafia, the host plays like everyone else. */
  @Column({ type: 'integer', nullable: true })
  host_id?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'host_id' })
  host?: User | null;

  /** Player limit (3..20, enforced by a CHECK). */
  @Column({ type: 'integer', default: 10 })
  max_players!: number;

  /** Fixed number of spies; NULL = automatic (20 %). */
  @Column({ type: 'integer', nullable: true })
  spy_count?: number | null;

  @Column({ type: 'boolean', default: false })
  double_agent!: boolean;

  @Column({ type: 'boolean', default: false })
  mr_white!: boolean;

  /** Selected location pack ids. */
  @Column({ type: 'jsonb', default: () => `'["base"]'` })
  packs!: string[];

  /** Turn timer in seconds; NULL = no timer. */
  @Column({ type: 'integer', nullable: true })
  turn_seconds?: number | null;

  /** After how many full cycles the spy gets a hint; NULL = never. */
  @Column({ type: 'smallint', nullable: true })
  hint_after_cycles?: number | null;

  /** Number of rounds played so far. */
  @Column({ type: 'integer', default: 0 })
  round!: number;

  /** Latest group message with the live event card (bigint comes back as a string). */
  @Column({ type: 'bigint', nullable: true })
  card_chat_id?: string | null;

  @Column({ type: 'integer', nullable: true })
  card_message_id?: number | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @OneToMany('SpyParticipant', 'event')
  participants!: SpyParticipant[];

  @OneToMany('SpyRound', 'event')
  rounds!: SpyRound[];
}
