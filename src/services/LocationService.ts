import { Repository } from 'typeorm';
import { Location } from '../models/Location';
import { Database } from '../database/Database';

export class LocationService {
  private locationRepository: Repository<Location>;

  constructor() {
    this.locationRepository = Database.getInstance().dataSource.getRepository(Location);
  }

  async getAll(includeInactive: boolean = false): Promise<Location[]> {
    const queryBuilder = this.locationRepository
      .createQueryBuilder('location')
      .leftJoinAndSelect('location.sport', 'sport')
      .orderBy('location.name', 'ASC');

    if (!includeInactive) {
      queryBuilder.where('location.is_active = :active', { active: true });
    }

    return await queryBuilder.getMany();
  }

  async getBySportId(sportId: number, includeInactive: boolean = false): Promise<Location[]> {
    const queryBuilder = this.locationRepository
      .createQueryBuilder('location')
      .leftJoinAndSelect('location.sport', 'sport')
      .where('location.sport_id = :sportId', { sportId })
      .orderBy('location.name', 'ASC');

    if (!includeInactive) {
      queryBuilder.andWhere('location.is_active = :active', { active: true });
    }

    return await queryBuilder.getMany();
  }

  async getByGroupAndSport(groupId: number, sportId: number, includeInactive: boolean = false): Promise<Location[]> {
    const queryBuilder = this.locationRepository
      .createQueryBuilder('location')
      .leftJoinAndSelect('location.sport', 'sport')
      .leftJoinAndSelect('location.group', 'group')
      .where('location.group_id = :groupId', { groupId })
      .andWhere('location.sport_id = :sportId', { sportId })
      .orderBy('location.name', 'ASC');

    if (!includeInactive) {
      queryBuilder.andWhere('location.is_active = :active', { active: true });
    }

    return await queryBuilder.getMany();
  }

  async getByGroup(groupId: number, includeInactive: boolean = false): Promise<Location[]> {
    const queryBuilder = this.locationRepository
      .createQueryBuilder('location')
      .leftJoinAndSelect('location.sport', 'sport')
      .leftJoinAndSelect('location.group', 'group')
      .where('location.group_id = :groupId', { groupId })
      .orderBy('location.sport.name', 'ASC')
      .addOrderBy('location.name', 'ASC');

    if (!includeInactive) {
      queryBuilder.andWhere('location.is_active = :active', { active: true });
    }

    return await queryBuilder.getMany();
  }

  async getById(id: number): Promise<Location | null> {
    return await this.locationRepository.findOne({
      where: { id },
      relations: ['sport'],
    });
  }

  async create(data: { name: string; sport_id: number; group_id: number; map_url?: string; is_active?: boolean }): Promise<Location> {
    const location = this.locationRepository.create({
      name: data.name,
      sport_id: data.sport_id,
      group_id: data.group_id,
      map_url: data.map_url,
      is_active: data.is_active !== undefined ? data.is_active : true,
    });

    return await this.locationRepository.save(location);
  }

  async update(id: number, data: { name?: string; sport_id?: number; map_url?: string; is_active?: boolean }): Promise<Location | null> {
    const location = await this.locationRepository.findOne({ where: { id } });
    if (!location) {
      return null;
    }

    if (data.name !== undefined) {
      location.name = data.name;
    }
    if (data.sport_id !== undefined) {
      location.sport_id = data.sport_id;
    }
    if (data.map_url !== undefined) {
      location.map_url = data.map_url;
    }
    if (data.is_active !== undefined) {
      location.is_active = data.is_active;
    }

    return await this.locationRepository.save(location);
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.locationRepository.delete(id);
    return result.affected ? result.affected > 0 : false;
  }

  async deactivate(id: number): Promise<boolean> {
    const location = await this.update(id, { is_active: false });
    return location !== null;
  }

  async activate(id: number): Promise<boolean> {
    const location = await this.update(id, { is_active: true });
    return location !== null;
  }

  async findOrCreate(name: string, sportId: number, groupId: number): Promise<Location> {
    const existing = await this.locationRepository.findOne({
      where: { name, sport_id: sportId, group_id: groupId },
    });

    if (existing) {
      return existing;
    }

    return await this.create({ name, sport_id: sportId, group_id: groupId });
  }
}
