import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

dotenv.config();

interface GameWithLocation {
  id: number;
  location: string;
  sport_id: number;
}

interface LocationMap {
  [key: string]: number; // "location_name|sport_id" => location_id
}

async function migrateLocations() {
  console.log('🚀 Starting location migration...');

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    synchronize: false,
    logging: false,
  });

  try {
    await dataSource.initialize();
    console.log('✅ Connected to database');

    // 1. Переименуем старое поле location в location_text
    console.log('\n📝 Step 1: Renaming location column to location_text...');
    try {
      await dataSource.query(`ALTER TABLE games RENAME COLUMN location TO location_text`);
      console.log('✅ Column renamed');
    } catch (error: any) {
      if (error.code === '42701' || error.message?.includes('already exists')) {
        console.log('⚠️  Column already renamed, skipping');
      } else {
        throw error;
      }
    }

    // 2. Добавим новое поле location_id
    console.log('\n📝 Step 2: Adding location_id column...');
    try {
      await dataSource.query(`ALTER TABLE games ADD COLUMN location_id INTEGER`);
      console.log('✅ Column added');
    } catch (error: any) {
      if (error.code === '42701' || error.message?.includes('already exists')) {
        console.log('⚠️  Column already exists, skipping');
      } else {
        throw error;
      }
    }

    // 3. Создаем таблицу locations если не существует
    console.log('\n📝 Step 3: Creating locations table...');
    await dataSource.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        sport_id INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_sport FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ Locations table ready');

    // 4. Получаем все игры с локациями
    console.log('\n📝 Step 4: Fetching existing games...');
    const games: GameWithLocation[] = await dataSource.query(`
      SELECT id, location_text as location, sport_id 
      FROM games 
      WHERE location_text IS NOT NULL AND location_text != ''
    `);
    console.log(`📊 Found ${games.length} games with locations`);

    if (games.length === 0) {
      console.log('✅ No games to migrate');
      await dataSource.destroy();
      return;
    }

    // 5. Создаем записи в locations и маппинг
    console.log('\n📝 Step 5: Creating location records...');
    const locationMap: LocationMap = {};
    let createdCount = 0;

    for (const game of games) {
      const key = `${game.location}|${game.sport_id}`;
      
      if (!locationMap[key]) {
        // Проверяем, существует ли уже такая локация
        const existing = await dataSource.query(
          `SELECT id FROM locations WHERE name = $1 AND sport_id = $2 LIMIT 1`,
          [game.location, game.sport_id]
        );

        if (existing.length > 0) {
          locationMap[key] = existing[0].id;
          console.log(`  ♻️  Found existing location: "${game.location}" (sport_id: ${game.sport_id}) -> id: ${existing[0].id}`);
        } else {
          // Создаем новую локацию
          const result = await dataSource.query(
            `INSERT INTO locations (name, sport_id, is_active) VALUES ($1, $2, $3) RETURNING id`,
            [game.location, game.sport_id, true]
          );
          locationMap[key] = result[0].id;
          createdCount++;
          console.log(`  ✅ Created location: "${game.location}" (sport_id: ${game.sport_id}) -> id: ${result[0].id}`);
        }
      }
    }

    console.log(`\n📊 Created ${createdCount} new locations`);

    // 6. Обновляем games таблицу - устанавливаем location_id
    console.log('\n📝 Step 6: Updating games with location_id...');
    let updatedCount = 0;
    
    for (const game of games) {
      const key = `${game.location}|${game.sport_id}`;
      const locationId = locationMap[key];
      
      await dataSource.query(
        `UPDATE games SET location_id = $1 WHERE id = $2`,
        [locationId, game.id]
      );
      updatedCount++;
    }

    console.log(`✅ Updated ${updatedCount} games`);

    // 7. Добавляем foreign key constraint
    console.log('\n📝 Step 7: Adding foreign key constraint...');
    try {
      await dataSource.query(`
        ALTER TABLE games 
        ADD CONSTRAINT fk_game_location 
        FOREIGN KEY (location_id) 
        REFERENCES locations(id) 
        ON DELETE SET NULL
      `);
      console.log('✅ Foreign key constraint added');
    } catch (error: any) {
      if (error.code === '42710' || error.message?.includes('already exists')) {
        console.log('⚠️  Constraint already exists, skipping');
      } else {
        throw error;
      }
    }

    console.log('\n🎉 Migration completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`  - Games migrated: ${updatedCount}`);
    console.log(`  - New locations created: ${createdCount}`);
    console.log(`  - Total unique locations: ${Object.keys(locationMap).length}`);

    await dataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await dataSource.destroy();
    process.exit(1);
  }
}

migrateLocations();
