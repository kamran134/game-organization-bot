import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { GroupMember } from './GroupMember';
import { Game } from './Game';
import { GameParticipant } from './GameParticipant';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'bigint', unique: true })
  telegram_id!: number;

  @Column({ nullable: true })
  username?: string;

  @Column({ nullable: true })
  first_name?: string;

  @Column({ nullable: true })
  last_name?: string;

  @Column({ nullable: true })
  phone?: string;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @OneToMany(() => GroupMember, (groupMember) => groupMember.user)
  groupMemberships!: GroupMember[];

  @OneToMany(() => Game, (game) => game.creator)
  createdGames!: Game[];

  @OneToMany(() => GameParticipant, (participant) => participant.user)
  gameParticipations!: GameParticipant[];

  get fullName(): string {
    const parts = [this.first_name, this.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : this.username || 'User';
  }

  get mention(): string {
    return this.username ? `@${this.username}` : this.fullName;
  }
}
