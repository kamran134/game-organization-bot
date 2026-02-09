import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Game } from './Game';
import { SportLocation } from './SportLocation';

@Entity('sports')
export class Sport {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  name!: string;

  @Column({ type: 'varchar', length: 10 })
  emoji!: string;

  @OneToMany(() => Game, (game) => game.sport)
  games!: Game[];

  @OneToMany(() => SportLocation, (sportLocation) => sportLocation.sport)
  sportLocations!: SportLocation[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
