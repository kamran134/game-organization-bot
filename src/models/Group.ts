import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { User } from './User';
import { GroupMember } from './GroupMember';
import { Game } from './Game';

@Entity('groups')
export class Group {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'bigint', unique: true, nullable: true })
  telegram_chat_id?: number;

  @Column({ nullable: true })
  creator_id?: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'creator_id' })
  creator?: User;

  @Column({ default: false })
  is_private!: boolean;

  @Column({ unique: true, nullable: true })
  invite_code?: string;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @OneToMany(() => GroupMember, (member) => member.group)
  members!: GroupMember[];

  @OneToMany(() => Game, (game) => game.group)
  games!: Game[];
}
