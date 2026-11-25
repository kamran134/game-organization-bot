import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { SpyEvent } from './SpyEvent';
import { SpyLocation } from './SpyLocation';
import { User } from './User';
import type { SpyRoundPlayer } from './SpyRoundPlayer';
import type { SpyVote } from './SpyVote';

export enum SpyRoundStatus {
  IN_PROGRESS = 'in_progress',
  VOTING = 'voting',
  FINISHED = 'finished',
}

/** Who won the round; `aborted` = the manager closed it without a result. */
export type SpyOutcome = 'town' | 'spies' | 'aborted';

/** How the round ended. */
export type SpyOutcomeReason = 'vote_hit' | 'vote_miss' | 'guess_correct' | 'guess_wrong' | 'manual';

/** One game inside an evening. */
@Entity('spy_rounds')
@Index('uq_spy_rounds_event_number', ['event_id', 'number'], { unique: true })
@Index('idx_spy_rounds_event_status', ['event_id', 'status'])
export class SpyRound {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  event_id!: number;

  @ManyToOne(() => SpyEvent, (event) => event.rounds, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event!: SpyEvent;

  /** 1-based number of the round within the evening. */
  @Column({ type: 'integer' })
  number!: number;

  // Nullable union-typed columns need an explicit type (see the comment in User.ts)
  @Column({ type: 'integer', nullable: true })
  location_id?: number | null;

  @ManyToOne(() => SpyLocation, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'location_id' })
  location?: SpyLocation | null;

  /** Snapshot of the location name: statistics survive the location's deletion. */
  @Column({ type: 'varchar', length: 100 })
  location_name!: string;

  /** Snapshot of the location pack (needed for the spy's hint). */
  @Column({ type: 'varchar', length: 20 })
  location_pack!: string;

  @Column({ type: 'varchar', length: 20, default: SpyRoundStatus.IN_PROGRESS })
  status!: SpyRoundStatus;

  /** user_id values in turn order. */
  @Column({ type: 'jsonb' })
  turn_order!: number[];

  @Column({ type: 'integer', default: 0 })
  turn_index!: number;

  @Column({ type: 'smallint', default: 1 })
  cycle!: number;

  /** Reference point of the turn timer. */
  @Column({ type: 'timestamptz', nullable: true })
  turn_started_at?: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  outcome?: SpyOutcome | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  outcome_reason?: SpyOutcomeReason | null;

  @Column({ type: 'text', nullable: true })
  guess?: string | null;

  @Column({ type: 'integer', nullable: true })
  guessed_by?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'guessed_by' })
  guesser?: User | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  started_at!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finished_at?: Date | null;

  @OneToMany('SpyRoundPlayer', 'round')
  players!: SpyRoundPlayer[];

  @OneToMany('SpyVote', 'round')
  votes!: SpyVote[];
}
