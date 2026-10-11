import { Database } from '../../database/Database';

/**
 * Миграция: разделение локаций и видов спорта
 * 
 * Было: locations (id, name, sport_id, group_id, map_url)
 * Стало: 
 *   - locations (id, name, group_id, map_url)
 *   - sport_locations (id, location_id, sport_id)
 */
export async function migrateLocationsToManyToMany(): Promise<void> {
  const db = Database.getInstance();
  const queryRunner = db.dataSource.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    console.log('🔄 Starting locations migration...');

    // Проверяем есть ли sport_id в таблице locations
    const sportIdExists = await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name='locations' AND column_name='sport_id'
    `);

    if (sportIdExists.length === 0) {
      console.log('✅ Migration already completed (sport_id column not found)');
      await queryRunner.commitTransaction();
      return;
    }

    // 0. Делаем sport_id nullable чтобы можно было создавать новые записи
    await queryRunner.query(`
      ALTER TABLE locations ALTER COLUMN sport_id DROP NOT NULL
    `);
    console.log('✅ Made sport_id column nullable');

    // 1. Создаём таблицу sport_locations если её нет
    const sportLocationsExists = await queryRunner.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name='sport_locations'
    `);

    if (sportLocationsExists.length === 0) {
      await queryRunner.query(`
        CREATE TABLE sport_locations (
          id SERIAL PRIMARY KEY,
          sport_id INTEGER NOT NULL,
          location_id INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          CONSTRAINT fk_sport FOREIGN KEY (sport_id) REFERENCES sports(id),
          CONSTRAINT fk_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
          CONSTRAINT unique_sport_location UNIQUE (sport_id, location_id)
        )
      `);
      console.log('✅ Table sport_locations created');
    }

    // 2. Получаем все существующие локации с sport_id
    const existingLocations = await queryRunner.query(`
      SELECT id, name, sport_id, group_id, map_url, is_active, created_at, updated_at
      FROM locations
      WHERE sport_id IS NOT NULL
      ORDER BY created_at
    `);

    console.log(`📊 Found ${existingLocations.length} locations to migrate`);

    // 3. Группируем локации по (name, group_id, map_url)
    const locationGroups = new Map<string, any[]>();
    
    for (const loc of existingLocations) {
      const key = `${loc.name}|${loc.group_id}|${loc.map_url || ''}`;
      if (!locationGroups.has(key)) {
        locationGroups.set(key, []);
      }
      locationGroups.get(key)!.push(loc);
    }

    console.log(`📦 Grouped into ${locationGroups.size} unique locations`);

    // 4. Для каждой группы создаём одну локацию и связи
    const locationMapping = new Map<number, number>(); // old_id -> new_id

    for (const locs of locationGroups.values()) {
      const first = locs[0];
      
      // Создаём новую локацию без sport_id
      const result = await queryRunner.query(`
        INSERT INTO locations (name, group_id, map_url, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [first.name, first.group_id, first.map_url, first.is_active, first.created_at, first.updated_at]);
      
      const newLocationId = result[0].id;

      // Создаём связи для всех sport_id
      const sportIds = new Set(locs.map(l => l.sport_id));
      for (const sportId of sportIds) {
        await queryRunner.query(`
          INSERT INTO sport_locations (sport_id, location_id, created_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (sport_id, location_id) DO NOTHING
        `, [sportId, newLocationId]);
      }

      // Сохраняем маппинг всех старых id на новый
      for (const loc of locs) {
        locationMapping.set(loc.id, newLocationId);
      }
    }

    console.log(`✅ Created ${locationGroups.size} merged locations`);

    // 5. Обновляем ссылки в таблице games
    console.log('🔄 Updating games references...');
    for (const [oldId, newId] of locationMapping.entries()) {
      await queryRunner.query(`
        UPDATE games
        SET location_id = $1
        WHERE location_id = $2
      `, [newId, oldId]);
    }

    // 6. Удаляем старые дубликаты локаций
    const oldIds = Array.from(locationMapping.keys());
    if (oldIds.length > 0) {
      await queryRunner.query(`
        DELETE FROM locations
        WHERE id = ANY($1::int[])
      `, [oldIds]);
      console.log(`🗑️  Removed ${oldIds.length} duplicate locations`);
    }

    // 7. Удаляем колонку sport_id из locations
    await queryRunner.query(`
      ALTER TABLE locations DROP COLUMN IF EXISTS sport_id
    `);
    console.log('✅ Removed sport_id column from locations');

    await queryRunner.commitTransaction();
    console.log('✅ Locations migration completed successfully');

  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await queryRunner.release();
  }
}
