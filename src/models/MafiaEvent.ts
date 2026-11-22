import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { Group } from './Group';
import { User } from './User';
import type { MafiaParticipant } from './MafiaParticipant';

export enum MafiaStatus {
  REGISTRATION = 'registration',
  /** Registration stopped early; roles not dealt yet. */
  CLOSED = 'closed',
  DEALT = 'dealt',
  FINISHED = 'finished',
}

@Entity('mafia_events')
@Index('idx_mafia_events_group_id', ['group_id'])
export class MafiaEvent {
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

  @Column({ type: 'varchar', length: 20, default: MafiaStatus.REGISTRATION })
  status!: MafiaStatus;

  /** The human game master: sees the full layout and does not play. */
  @Column({ type: 'integer', nullable: true })
  host_id?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'host_id' })
  host?: User | null;

  @Column({ type: 'boolean', default: true })
  show_mafia_team!: boolean;

  @Column({ type: 'boolean', default: false })
  assign_seats!: boolean;

  /** Player limit (MAFIA_MIN_PLAYERS..MAFIA_MAX_PLAYERS, enforced by a CHECK). */
  @Column({ type: 'integer', default: 10 })
  max_players!: number;

  /** Number of the last dealt game of the evening; 0 before the first deal. */
  @Column({ type: 'integer', default: 0 })
  round!: number;

  /** Role counts used at the last deal. */
  @Column({ type: 'jsonb', nullable: true })
  roles_config?: Record<string, number> | null;

  @Column({ type: 'timestamptz', nullable: true })
  dealt_at?: Date | null;

  /** Latest group message with the live event card (bigint comes back as a string). */
  @Column({ type: 'bigint', nullable: true })
  card_chat_id?: string | null;

  @Column({ type: 'integer', nullable: true })
  card_message_id?: number | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @OneToMany('MafiaParticipant', 'event')
  participants!: MafiaParticipant[];
}
