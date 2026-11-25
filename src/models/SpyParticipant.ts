import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { SpyEvent } from './SpyEvent';
import { User } from './User';

/** The roster of an evening; lives between rounds. */
@Entity('spy_participants')
@Index('uq_spy_participants_event_user', ['event_id', 'user_id'], { unique: true })
export class SpyParticipant {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  event_id!: number;

  @ManyToOne(() => SpyEvent, (event) => event.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event!: SpyEvent;

  @Column()
  user_id!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  /** false = does not get a role in the following rounds. */
  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @CreateDateColumn()
  joined_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
