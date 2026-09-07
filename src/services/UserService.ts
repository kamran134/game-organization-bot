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

    const user = await userRepo.findOne({
      where: { telegram_id: telegramUser.id },
    });

    if (!user) {
      const created = userRepo.create({
        telegram_id: telegramUser.id,
        username: telegramUser.username,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name,
      });
      await userRepo.save(created);
      console.log(`New user registered: ${created.mention}`);
      return created;
    }

    await this.syncUsername(user, telegramUser.username);
    return user;
  }

  /**
   * Telegram — единственный владелец username: его могут завести, сменить или
   * снять в любой момент, поэтому при каждом контакте с ботом приводим его к актуальному.
   *
   * first_name/last_name намеренно НЕ синхронизируются: их правит админ через веб-апп
   * (см. updateUserName), автосинк затирал бы ручные правки.
   */
  async syncUsername(user: User, incomingUsername?: string): Promise<void> {
    const incoming = incomingUsername ?? null;
    const current = user.username ?? null;

    if (incoming === current) return;

    const userRepo = this.db.getRepository(User);
    user.username = incoming;
    await userRepo.save(user);

    console.log(`Username synced for user ${user.id}: ${current ?? '—'} → ${incoming ?? '—'}`);
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

  async updateUserName(userId: number, firstName: string, lastName?: string): Promise<void> {
    const userRepo = this.db.getRepository(User);
    await userRepo.update(userId, { first_name: firstName, last_name: lastName || undefined });
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
