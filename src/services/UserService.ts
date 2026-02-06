import { Database } from '../database/Database';
import { User } from '../models/User';
import { GameStatus } from '../models/Game';

export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export class UserService {
  private db: Database;

  constructor(database: Database) {
    this.db = database;
  }

  async findOrCreateUser(telegramUser: TelegramUser): Promise<User> {
    const userRepo = this.db.getRepository(User);
    
    let user = await userRepo.findOne({
      where: { telegram_id: telegramUser.id },
    });

    if (!user) {
      user = userRepo.create({
        telegram_id: telegramUser.id,
        username: telegramUser.username,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name,
      });
      await userRepo.save(user);
      console.log(`New user registered: ${user.mention}`);
    }

    return user;
  }

  async getUserById(userId: number): Promise<User | null> {
    const userRepo = this.db.getRepository(User);
    return userRepo.findOne({ where: { id: userId } });
  }

  async getUserByTelegramId(telegramId: number): Promise<User | null> {
    const userRepo = this.db.getRepository(User);
    return userRepo.findOne({ where: { telegram_id: telegramId } });
  }

  async updateUserPhone(userId: number, phone: string): Promise<void> {
    const userRepo = this.db.getRepository(User);
    await userRepo.update(userId, { phone });
  }

  async getUserStats(userId: number): Promise<{
    totalGames: number;
    upcomingGames: number;
  }> {
    const userRepo = this.db.getRepository(User);
    const user = await userRepo.findOne({
      where: { id: userId },
      relations: ['gameParticipations', 'gameParticipations.game'],
    });

    if (!user) {
      return { totalGames: 0, upcomingGames: 0 };
    }

    const totalGames = user.gameParticipations.length;
    const upcomingGames = user.gameParticipations.filter(
      (p) => p.game.game_date > new Date() && p.game.status === GameStatus.PLANNED
    ).length;

    return { totalGames, upcomingGames };
  }
}
