import { IsNull } from 'typeorm';
import { Database } from '../database/Database';
import { Sport } from '../models/Sport';
import { ValidationError } from '../utils/errors';

const MAX_NAME_LENGTH = 50;
const MAX_EMOJI_LENGTH = 10;

export class SportService {
  private db: Database;

  constructor(database: Database) {
    this.db = database;
  }

  /** Sports visible to a group: base sports (group_id IS NULL) plus the group's own active sports. */
  async getSportsForGroup(groupId: number): Promise<Sport[]> {
    const sportRepo = this.db.getRepository(Sport);
    return sportRepo.find({
      where: [
        { group_id: IsNull(), is_active: true },
        { group_id: groupId, is_active: true },
      ],
      order: { name: 'ASC' },
    });
  }

  async getSportById(sportId: number): Promise<Sport | null> {
    const sportRepo = this.db.getRepository(Sport);
    return sportRepo.findOne({ where: { id: sportId } });
  }

  /** Looks up a base (non-group) sport by name — used only by the default sports seed. */
  async getBaseSportByName(name: string): Promise<Sport | null> {
    const sportRepo = this.db.getRepository(Sport);
    return sportRepo.findOne({ where: { name, group_id: IsNull() } });
  }

  /** Creates a base sport. Only the default sports seed should call this. */
  async createSport(name: string, emoji: string): Promise<Sport> {
    const sportRepo = this.db.getRepository(Sport);
    const sport = sportRepo.create({ name, emoji, group_id: null });
    await sportRepo.save(sport);
    return sport;
  }

  /** Creates a sport owned by a group, reactivating a previously deactivated one instead of duplicating it. */
  async createGroupSport(groupId: number, name: string, emoji: string): Promise<Sport> {
    const trimmedName = name.trim();
    const trimmedEmoji = emoji.trim();

    if (!trimmedName) {
      throw new ValidationError('Название не может быть пустым');
    }
    if (!trimmedEmoji) {
      throw new ValidationError('Эмодзи не может быть пустым');
    }
    if (trimmedName.length > MAX_NAME_LENGTH) {
      throw new ValidationError(`Название не может быть длиннее ${MAX_NAME_LENGTH} символов`);
    }
    if (trimmedEmoji.length > MAX_EMOJI_LENGTH) {
      throw new ValidationError(`Эмодзи не может быть длиннее ${MAX_EMOJI_LENGTH} символов`);
    }

    const sportRepo = this.db.getRepository(Sport);

    const baseSport = await sportRepo.findOne({ where: { name: trimmedName, group_id: IsNull() } });
    if (baseSport) {
      throw new ValidationError('Такой вид уже есть среди базовых');
    }

    const existing = await sportRepo.findOne({ where: { name: trimmedName, group_id: groupId } });
    if (existing) {
      if (existing.is_active) {
        throw new ValidationError('Такой вид уже есть в вашей группе');
      }
      // Ранее деактивированный вид с этим именем — реактивируем вместо создания дубля
      existing.is_active = true;
      existing.emoji = trimmedEmoji;
      await sportRepo.save(existing);
      return existing;
    }

    const sport = sportRepo.create({ name: trimmedName, emoji: trimmedEmoji, group_id: groupId });
    await sportRepo.save(sport);
    return sport;
  }

  /** Soft-deletes a group-owned sport. Base sports and other groups' sports cannot be touched. */
  async deactivateGroupSport(sportId: number, groupId: number): Promise<void> {
    const sportRepo = this.db.getRepository(Sport);
    const sport = await sportRepo.findOne({ where: { id: sportId } });

    if (!sport) {
      throw new ValidationError('Вид не найден');
    }
    if (sport.group_id === null || sport.group_id === undefined) {
      throw new ValidationError('Базовый вид нельзя удалить');
    }
    if (sport.group_id !== groupId) {
      throw new ValidationError('Нет доступа к этому виду');
    }

    sport.is_active = false;
    await sportRepo.save(sport);
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
      const existing = await this.getBaseSportByName(sport.name);
      if (!existing) {
        await this.createSport(sport.name, sport.emoji);
      }
    }

    console.log('✅ Default sports initialized');
  }
}
