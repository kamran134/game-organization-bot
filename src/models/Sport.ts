import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Game } from './Game';
import { SportLocation } from './SportLocation';
import { Group } from './Group';

@Entity('sports')
export class Sport {
  @PrimaryGeneratedColumn()
  id!: number;

  // Uniqueness is enforced via partial indexes (base vs per-group), not a column-level
  // constraint — see migration 1756000000000-AddGroupScopedSports.
  @Column({ type: 'varchar', length: 50 })
  name!: string;

  @Column({ type: 'varchar', length: 10 })
  emoji!: string;

  // NULL — base sport, available to every group. Set — sport created by that group's admin.
  @Column({ type: 'int', nullable: true })
  group_id?: number | null;

  @ManyToOne(() => Group, (group) => group.sports, { nullable: true })
  @JoinColumn({ name: 'group_id' })
  group?: Group;

  // Soft-delete flag: group-owned sports are deactivated instead of removed,
  // since games.sport_id is a NOT NULL FK.
  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @OneToMany(() => Game, (game) => game.sport)
  games!: Game[];

  @OneToMany(() => SportLocation, (sportLocation) => sportLocation.sport)
  sportLocations!: SportLocation[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
