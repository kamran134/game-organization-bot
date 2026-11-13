import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { SantaEvent } from './SantaEvent';
import { User } from './User';

@Entity('santa_participants')
@Index('uq_santa_participants_event_user', ['event_id', 'user_id'], { unique: true })
export class SantaParticipant {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  event_id!: number;

  @ManyToOne(() => SantaEvent, (event) => event.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event!: SantaEvent;

  @Column()
  user_id!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'text', nullable: true })
  wishlist?: string | null;

  /** Whom this participant gives a gift to; never serialized to the API. */
  @Column({ type: 'integer', nullable: true })
  receiver_id?: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'receiver_id' })
  receiver?: User | null;

  @CreateDateColumn()
  joined_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
