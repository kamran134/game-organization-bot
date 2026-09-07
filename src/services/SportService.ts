import { Database } from '../database/Database';
import { Sport } from '../models/Sport';

export class SportService {
  private db: Database;

  constructor(database: Database) {
    this.db = database;
  }

  async getAllSports(): Promise<Sport[]> {
    const sportRepo = this.db.getRepository(Sport);
    return sportRepo.find({ order: { name: 'ASC' } });
  }

  async getSportById(sportId: number): Promise<Sport | null> {
    const sportRepo = this.db.getRepository(Sport);
    return sportRepo.findOne({ where: { id: sportId } });
  }

  async getSportByName(name: string): Promise<Sport | null> {
    const sportRepo = this.db.getRepository(Sport);
    return sportRepo.findOne({ where: { name } });
  }

  async createSport(name: string, emoji: string): Promise<Sport> {
    const sportRepo = this.db.getRepository(Sport);
    const sport = sportRepo.create({ name, emoji });
    await sportRepo.save(sport);
    return sport;
  }

  async initializeDefaultSports(): Promise<void> {
    const defaultSports = [
      { name: 'Футбол', emoji: '⚽' },
      { name: 'Волейбол', emoji: '🏐' },
      { name: 'Баскетбол', emoji: '🏀' },
      { name: 'Бадминтон', emoji: '🏸' },
      { name: 'Теннис', emoji: '🎾' },
      { name: 'Настольные игры', emoji: '🎲' },
      { name: 'Другое', emoji: '🎮' },
    ];

    for (const sport of defaultSports) {
      const existing = await this.getSportByName(sport.name);
      if (!existing) {
        await this.createSport(sport.name, sport.emoji);
      }
    }

    console.log('✅ Default sports initialized');
  }
}
