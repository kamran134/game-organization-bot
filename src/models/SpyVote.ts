import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { SpyRound } from './SpyRound';
import { User } from './User';

@Entity('spy_votes')
@Index('uq_spy_votes_round_ballot_voter', ['round_id', 'ballot', 'voter_id'], { unique: true })
export class SpyVote {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  round_id!: number;

  @ManyToOne(() => SpyRound, (round) => round.votes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'round_id' })
  round!: SpyRound;

  @Column()
  voter_id!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'voter_id' })
  voter!: User;

  @Column()
  target_id!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'target_id' })
  target!: User;

  /** Ballot number (a tie leads to ballot 2 between the leaders). */
  @Column({ type: 'smallint', default: 1 })
  ballot!: number;

  @CreateDateColumn()
  created_at!: Date;
}
