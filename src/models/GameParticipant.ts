import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Game } from './Game';
import { User } from './User';

export enum ParticipationStatus {
  CONFIRMED = 'confirmed',    // ✅ Точно иду
  MAYBE = 'maybe',           // ❓ Не точно
  GUEST = 'guest',           // 👤 Гость (добавлен админом)
}

@Entity('game_participants')
@Unique(['game_id', 'user_id']) // Один пользователь может быть записан на игру только один раз
export class GameParticipant {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  game_id!: number;

  @ManyToOne(() => Game, (game) => game.participants)
  @JoinColumn({ name: 'game_id' })
  game!: Game;

  @Column()
  user_id!: number;

  @ManyToOne(() => User, (user) => user.gameParticipations)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar' })
  participation_status!: ParticipationStatus;

  @Column({ nullable: true })
  guest_name?: string;

  @Column({ nullable: true })
  position?: number;

  @CreateDateColumn()
  joined_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  getPriority(): number {
    switch (this.participation_status) {
      case ParticipationStatus.CONFIRMED:
        return 1;
      case ParticipationStatus.MAYBE:
        return 2;
      case ParticipationStatus.GUEST:
        return 3;
      default:
        return 999;
    }
  }

  getStatusEmoji(): string {
    switch (this.participation_status) {
      case ParticipationStatus.CONFIRMED:
        return '✅';
      case ParticipationStatus.MAYBE:
        return '❓';
      case ParticipationStatus.GUEST:
        return '👤';
      default:
        return '';
    }
  }
}
