import { Repository } from 'typeorm';
import { Location } from '../models/Location';
import { SportLocation } from '../models/SportLocation';
import { Database } from '../database/Database';

export class LocationService {
  private locationRepository: Repository<Location>;
  private sportLocationRepository: Repository<SportLocation>;

  constructor() {
    this.locationRepository = Database.getInstance().dataSource.getRepository(Location);
    this.sportLocationRepository = Database.getInstance().dataSource.getRepository(SportLocation);
  }

  async getAll(includeInactive: boolean = false): Promise<Location[]> {
    const queryBuilder = this.locationRepository
      .createQueryBuilder('location')
      .leftJoinAndSelect('location.sportLocations', 'sportLocations')
      .leftJoinAndSelect('sportLocations.sport', 'sport')
      .orderBy('location.name', 'ASC');

    if (!includeInactive) {
      queryBuilder.where('location.is_active = :active', { active: true });
    }

    return await queryBuilder.getMany();
  }

  async getByGroupAndSport(groupId: number, sportId: number, includeInactive: boolean = false): Promise<Location[]> {
    const queryBuilder = this.locationRepository
      .createQueryBuilder('location')
      .innerJoin('location.sportLocations', 'sportLocations')
      .innerJoinAndSelect('sportLocations.sport', 'sport')
      .where('location.group_id = :groupId', { groupId })
      .andWhere('sportLocations.sport_id = :sportId', { sportId })
      .orderBy('location.name', 'ASC');

    if (!includeInactive) {
      queryBuilder.andWhere('location.is_active = :active', { active: true });
    }

    return await queryBuilder.getMany();
  }

  async getByGroup(groupId: number, includeInactive: boolean = false): Promise<Location[]> {
    const queryBuilder = this.locationRepository
      .createQueryBuilder('location')
      .leftJoinAndSelect('location.sportLocations', 'sportLocations')
      .leftJoinAndSelect('sportLocations.sport', 'sport')
      .where('location.group_id = :groupId', { groupId })
      .orderBy('location.name', 'ASC');

    if (!includeInactive) {
      queryBuilder.andWhere('location.is_active = :active', { active: true });
    }

    return await queryBuilder.getMany();
  }

  async getById(id: number): Promise<Location | null> {
    return await this.locationRepository.findOne({
      where: { id },
      relations: ['sportLocations', 'sportLocations.sport'],
    });
  }

  async create(data: { 
    name: string; 
    group_id: number; 
    sport_ids?: number[];
    map_url?: string;
    is_active?: boolean;
  }): Promise<Location> {
    const location = this.locationRepository.create({
      name: data.name,
      group_id: data.group_id,
      map_url: data.map_url,
      is_active: data.is_active !== undefined ? data.is_active : true,
    });

    const savedLocation = await this.locationRepository.save(location);

    // Создаём связи с видами спорта
    if (data.sport_ids && data.sport_ids.length > 0) {
      for (const sportId of data.sport_ids) {
        const sportLocation = this.sportLocationRepository.create({
          location_id: savedLocation.id,
          sport_id: sportId,
        });
        await this.sportLocationRepository.save(sportLocation);
      }
    }

    // Возвращаем локацию со связями
    return (await this.getById(savedLocation.id))!;
  }

  async update(
    id: number,
    data: Partial<{
      name: string;
      map_url: string;
      is_active: boolean;
      sport_ids: number[];
    }>
  ): Promise<Location | null> {
    const location = await this.locationRepository.findOne({ where: { id } });
    if (!location) return null;

    if (data.name !== undefined) {
      location.name = data.name;
    }
    if (data.map_url !== undefined) {
      location.map_url = data.map_url;
    }
    if (data.is_active !== undefined) {
      location.is_active = data.is_active;
    }

    const savedLocation = await this.locationRepository.save(location);

    // Обновляем связи с видами спорта если указаны
    if (data.sport_ids !== undefined) {
      // Удаляем старые связи
      await this.sportLocationRepository.delete({ location_id: id });

      // Создаём новые
      for (const sportId of data.sport_ids) {
        const sportLocation = this.sportLocationRepository.create({
          location_id: id,
          sport_id: sportId,
        });
        await this.sportLocationRepository.save(sportLocation);
      }
    }

    return await this.getById(id);
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

  /**
   * Находит или создаёт локацию по имени и группе
   * Если локация существует - добавляет связь с указанным видом спорта (если нет)
   * Если не существует - создаёт новую с указанным видом спорта
   */
  async findOrCreate(name: string, sportId: number, groupId: number, mapUrl?: string): Promise<Location> {
    // Ищем существующую локацию с таким именем в группе
    const existing = await this.locationRepository.findOne({
      where: { name, group_id: groupId },
      relations: ['sportLocations'],
    });

    if (existing) {
      // Проверяем есть ли уже связь с этим видом спорта
      const hasSport = existing.sportLocations?.some(sl => sl.sport_id === sportId);
      
      if (!hasSport) {
        // Добавляем связь с видом спорта
        const sportLocation = this.sportLocationRepository.create({
          location_id: existing.id,
          sport_id: sportId,
        });
        await this.sportLocationRepository.save(sportLocation);
      }

      // Обновляем map_url если он передан и отличается
      if (mapUrl && existing.map_url !== mapUrl) {
        existing.map_url = mapUrl;
        await this.locationRepository.save(existing);
      }

      return (await this.getById(existing.id))!;
    }

    // Создаём новую локацию
    return await this.create({
      name,
      group_id: groupId,
      sport_ids: [sportId],
      map_url: mapUrl,
    });
  }

  /**
   * Добавляет вид спорта к существующей локации
   */
  async addSportToLocation(locationId: number, sportId: number): Promise<boolean> {
    // Проверяем что такая связь ещё не существует
    const existing = await this.sportLocationRepository.findOne({
      where: { location_id: locationId, sport_id: sportId },
    });

    if (existing) {
      return true; // Уже есть
    }

    const sportLocation = this.sportLocationRepository.create({
      location_id: locationId,
      sport_id: sportId,
    });

    await this.sportLocationRepository.save(sportLocation);
    return true;
  }

  /**
   * Удаляет вид спорта из локации
   */
  async removeSportFromLocation(locationId: number, sportId: number): Promise<boolean> {
    const result = await this.sportLocationRepository.delete({
      location_id: locationId,
      sport_id: sportId,
    });

    return result.affected ? result.affected > 0 : false;
  }
}
