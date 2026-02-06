import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User';
import { Group } from './Group';

export enum GroupRole {
  ADMIN = 'admin',
  MEMBER = 'member',
}

@Entity('group_members')
export class GroupMember {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  user_id!: number;

  @ManyToOne(() => User, (user) => user.groupMemberships)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column()
  group_id!: number;

  @ManyToOne(() => Group, (group) => group.members)
  @JoinColumn({ name: 'group_id' })
  group!: Group;

  @Column({ type: 'varchar', default: GroupRole.MEMBER })
  role!: GroupRole;

  @CreateDateColumn()
  joined_at!: Date;

  isAdmin(): boolean {
    return this.role === GroupRole.ADMIN;
  }
}
