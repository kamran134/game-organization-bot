import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { MafiaEvent } from './MafiaEvent';
import { User } from './User';

export enum MafiaLogPhase {
  NIGHT = 'night',
  DAY = 'day',
}

export enum MafiaLogType {
  KILL = 'kill',
  HEAL = 'heal',
  CHECK = 'check',
  BLOCK = 'block',
  LYNCH = 'lynch',
  NOTE = 'note',
}

/** One line of the host's game log: who was killed / healed / checked / blocked / lynched, or a free note. */
@Entity('mafia_log_entries')
@Index('idx_mafia_log_entries_event_round', ['event_id', 'round', 'cycle'])
export class MafiaLogEntry {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  event_id!: number;

  @ManyToOne(() => MafiaEvent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event!: MafiaEvent;

  /** Game of the evening the entry belongs to (`mafia_events.round` at the time of writing). */
  @Column({ type: 'integer' })
  round!: number;

  /** 1 = the first night and the first day. */
  @Column({ type: 'integer' })
  cycle!: number;

  @Column({ type: 'varchar', length: 10 })
  phase!: MafiaLogPhase;

  @Column({ type: 'varchar', length: 20 })
  type!: MafiaLogType;

  @Column({ type: 'integer', nullable: true })
  target_user_id?: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'target_user_id' })
  target?: User | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
