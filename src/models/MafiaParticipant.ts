import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { MafiaEvent } from './MafiaEvent';
import { MafiaRole } from './MafiaRole';
import { User } from './User';

@Entity('mafia_participants')
@Index('uq_mafia_participants_event_user', ['event_id', 'user_id'], { unique: true })
export class MafiaParticipant {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  event_id!: number;

  @ManyToOne(() => MafiaEvent, (event) => event.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event!: MafiaEvent;

  @Column()
  user_id!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  /** Secret: never serialized except to the owner and in the host's layout. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  role?: MafiaRole | null;

  @Column({ type: 'integer', nullable: true })
  seat?: number | null;

  /** Secret (reveals the role): which card image of the role this player got. */
  @Column({ type: 'smallint', nullable: true })
  card_variant?: number | null;

  @CreateDateColumn()
  joined_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
