import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Group } from './Group';

/**
 * A location of the Spy game. `group_id = NULL` means a global location available to every group.
 *
 * The unique indexes `uq_spy_locations_group_name` (group_id, lower(name)) WHERE group_id IS NOT NULL and
 * `uq_spy_locations_global_name` (lower(name)) WHERE group_id IS NULL are partial expression indexes that
 * decorators cannot describe, so they are maintained by the AddSpy migration only.
 */
@Entity('spy_locations')
@Index('idx_spy_locations_pack', ['pack'])
export class SpyLocation {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  /** Pack id from SPY_PACKS (defined in code). */
  @Column({ type: 'varchar', length: 20, default: 'base' })
  pack!: string;

  // Nullable union-typed columns need an explicit type (see the comment in User.ts)
  @Column({ type: 'integer', nullable: true })
  group_id?: number | null;

  @ManyToOne(() => Group, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group?: Group | null;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @CreateDateColumn()
  created_at!: Date;
}
