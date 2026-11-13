import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { Group } from './Group';
import { User } from './User';
import type { SantaParticipant } from './SantaParticipant';

export enum SantaStatus {
  REGISTRATION = 'registration',
  DRAWN = 'drawn',
  FINISHED = 'finished',
}

@Entity('santa_events')
@Index('idx_santa_events_group_id', ['group_id'])
export class SantaEvent {
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

  @Column({ type: 'varchar', length: 50, nullable: true })
  budget?: string | null;

  /** pg returns a `date` column as 'YYYY-MM-DD'. */
  @Column({ type: 'date', nullable: true })
  exchange_date?: string | null;

  @Column({ type: 'varchar', length: 20, default: SantaStatus.REGISTRATION })
  status!: SantaStatus;

  @Column({ type: 'integer', nullable: true })
  created_by?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator?: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  drawn_at?: Date | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @OneToMany('SantaParticipant', 'event')
  participants!: SantaParticipant[];
}
