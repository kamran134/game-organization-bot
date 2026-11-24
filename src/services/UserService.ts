import { Database } from '../database/Database';
import { User } from '../models/User';
import { Gender } from '../models/Gender';
import { GameStatus } from '../models/Game';

/** Profile fields a user (or an admin) may edit; an absent key is left untouched. */
export interface UserProfilePatch {
  first_name?: string;
  last_name?: string | null;
  gender?: Gender | null;
}

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
   * (см. updateUserName), автосинк затирал бы ручные правки. Пол Telegram не знает вовсе —
   * его задаёт админ или сам игрок (см. updateUserGender).
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

  /**
   * Single write path for the editable profile fields. An absent key is left untouched,
   * an empty / null `last_name` and a null `gender` clear the column.
   */
  async updateUserProfile(userId: number, patch: UserProfilePatch): Promise<void> {
    const update: Record<string, unknown> = {};
    if (patch.first_name !== undefined) update['first_name'] = patch.first_name;
    // last_name is nullable in the DB, but the entity types it as string | undefined
    if (patch.last_name !== undefined) update['last_name'] = patch.last_name || null;
    if (patch.gender !== undefined) update['gender'] = patch.gender;
    if (Object.keys(update).length === 0) return;

    await this.db.getRepository(User).update(userId, update);
  }

  /** `lastName`: undefined leaves it untouched, '' or null clears it. */
  async updateUserName(userId: number, firstName: string, lastName?: string | null): Promise<void> {
    await this.updateUserProfile(userId, { first_name: firstName, last_name: lastName });
  }

  /** `null` clears the gender; Telegram never supplies it, so nothing ever overwrites this value. */
  async updateUserGender(userId: number, gender: Gender | null): Promise<void> {
    await this.updateUserProfile(userId, { gender });
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
