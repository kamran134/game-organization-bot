import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Group } from './Group';
import { User } from './User';
import { GameParticipant } from './GameParticipant';
import { Sport } from './Sport';
import { Location } from './Location';
import { GameType } from './GameType';

export enum GameStatus {
  PLANNED = 'planned',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

@Entity('games')
export class Game {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  group_id!: number;

  @ManyToOne(() => Group, (group) => group.games)
  @JoinColumn({ name: 'group_id' })
  group!: Group;

  @Column({ nullable: true })
  creator_id?: number;

  @ManyToOne(() => User, (user) => user.createdGames, { nullable: true })
  @JoinColumn({ name: 'creator_id' })
  creator?: User;

  @Column()
  sport_id!: number;

  @ManyToOne(() => Sport, (sport) => sport.games)
  @JoinColumn({ name: 'sport_id' })
  sport!: Sport;

  @Column({ type: 'timestamp' })
  game_date!: Date;

  // Новое поле для связи с таблицей locations
  @Column({ nullable: true })
  location_id?: number;

  @ManyToOne(() => Location, (location) => location.games, { nullable: true })
  @JoinColumn({ name: 'location_id' })
  location?: Location;

  // Старое текстовое поле location - сохраняем для миграции
  @Column({ type: 'varchar', nullable: true })
  location_text?: string;

  @Column({ default: 2 })
  min_participants!: number;

  @Column()
  max_participants!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  cost?: number;

  @Column({ type: 'varchar', default: GameStatus.PLANNED })
  status!: GameStatus;

  @Column({
    type: 'enum',
    enum: GameType,
    default: GameType.GAME
  })
  type!: GameType;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @OneToMany(() => GameParticipant, (participant) => participant.game)
  participants!: GameParticipant[];

  isActive(): boolean {
    return this.status === GameStatus.PLANNED && this.game_date > new Date();
  }

  isFull(): boolean {
    return this.participants?.length >= this.max_participants;
  }
}
