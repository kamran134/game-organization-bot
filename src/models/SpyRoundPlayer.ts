import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { SpyRound } from './SpyRound';
import { SpyRole } from './SpyRole';
import { User } from './User';

@Entity('spy_round_players')
@Index('uq_spy_round_players_round_user', ['round_id', 'user_id'], { unique: true })
@Index('idx_spy_round_players_user', ['user_id'])
export class SpyRoundPlayer {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  round_id!: number;

  @ManyToOne(() => SpyRound, (round) => round.players, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'round_id' })
  round!: SpyRound;

  @Column()
  user_id!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  /** Secret: never serialized except to the owner. */
  @Column({ type: 'varchar', length: 20 })
  role!: SpyRole;

  @Column({ type: 'boolean', default: false })
  is_eliminated!: boolean;
}
