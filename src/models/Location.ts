import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Sport } from './Sport';
import { Game } from './Game';
import { Group } from './Group';

@Entity('locations')
export class Location {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column()
  sport_id!: number;

  @ManyToOne(() => Sport, (sport) => sport.locations)
  @JoinColumn({ name: 'sport_id' })
  sport!: Sport;

  @Column()
  group_id!: number;

  @ManyToOne(() => Group, (group) => group.games)
  @JoinColumn({ name: 'group_id' })
  group!: Group;

  @Column({ type: 'varchar', length: 500, nullable: true })
  map_url?: string;

  @OneToMany(() => Game, (game) => game.location)
  games!: Game[];

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
