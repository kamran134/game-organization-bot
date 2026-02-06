import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

async function addGroupIdToLocations() {
  const db = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'game_org_bot',
    synchronize: false,
    logging: true,
  });

  try {
    console.log('🔌 Connecting to database...');
    await db.initialize();
    console.log('✅ Connected\n');

    // Проверяем есть ли уже колонка group_id
    const hasGroupId = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='locations' AND column_name='group_id'
    `);

    if (hasGroupId.length > 0) {
      console.log('ℹ️  Column group_id already exists in locations table');
      
      // Проверяем есть ли локации без group_id
      const locationsWithoutGroup = await db.query(`
        SELECT COUNT(*) as count FROM locations WHERE group_id IS NULL
      `);

      if (locationsWithoutGroup[0].count === 0) {
        console.log('✅ All locations already have group_id set');
        await db.destroy();
        return;
      }

      console.log(`Found ${locationsWithoutGroup[0].count} locations without group_id`);
    } else {
      console.log('📝 Step 1: Adding group_id column...');
      await db.query(`
        ALTER TABLE locations 
        ADD COLUMN IF NOT EXISTS group_id INTEGER
      `);
      console.log('✅ Column added\n');
    }

    // Проверяем есть ли колонка map_url
    const hasMapUrl = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='locations' AND column_name='map_url'
    `);

    if (hasMapUrl.length === 0) {
      console.log('📝 Step 2: Adding map_url column...');
      await db.query(`
        ALTER TABLE locations 
        ADD COLUMN IF NOT EXISTS map_url VARCHAR(500)
      `);
      console.log('✅ Column added\n');
    } else {
      console.log('ℹ️  Column map_url already exists\n');
    }

    // Получаем все игры с локациями
    console.log('📝 Step 3: Assigning group_id to existing locations based on games...');
    
    const result = await db.query(`
      UPDATE locations l
      SET group_id = subquery.group_id
      FROM (
        SELECT DISTINCT ON (g.location_id) 
          g.location_id, 
          g.group_id
        FROM games g
        WHERE g.location_id IS NOT NULL
        ORDER BY g.location_id, g.created_at DESC
      ) AS subquery
      WHERE l.id = subquery.location_id 
        AND l.group_id IS NULL
      RETURNING l.id, l.name, l.group_id
    `);

    if (result.length > 0) {
      console.log(`✅ Updated ${result.length} locations with group_id`);
      result.forEach((loc: any) => {
        console.log(`  - Location "${loc.name}" (id: ${loc.id}) → group_id: ${loc.group_id}`);
      });
    } else {
      console.log('ℹ️  No locations needed group_id assignment');
    }

    // Проверяем есть ли локации всё ещё без group_id
    const remainingLocations = await db.query(`
      SELECT id, name, sport_id 
      FROM locations 
      WHERE group_id IS NULL
    `);

    if (remainingLocations.length > 0) {
      console.log(`\n⚠️  Warning: ${remainingLocations.length} locations still without group_id:`);
      remainingLocations.forEach((loc: any) => {
        console.log(`  - Location "${loc.name}" (id: ${loc.id}, sport_id: ${loc.sport_id})`);
      });
      console.log('\nThese locations were never used in any game and will need to be manually assigned or deleted.');
    }

    // Делаем group_id NOT NULL только если все локации имеют group_id
    if (remainingLocations.length === 0) {
      console.log('\n📝 Step 4: Making group_id NOT NULL...');
      await db.query(`
        ALTER TABLE locations 
        ALTER COLUMN group_id SET NOT NULL
      `);
      console.log('✅ Column constraint updated\n');

      // Добавляем FK к groups если его еще нет
      const hasFk = await db.query(`
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name='locations' 
          AND constraint_type='FOREIGN KEY'
          AND constraint_name LIKE '%group%'
      `);

      if (hasFk.length === 0) {
        console.log('📝 Step 5: Adding foreign key constraint to groups...');
        await db.query(`
          ALTER TABLE locations 
          ADD CONSTRAINT fk_location_group 
          FOREIGN KEY (group_id) REFERENCES groups(id)
        `);
        console.log('✅ Foreign key added\n');
      } else {
        console.log('ℹ️  Foreign key to groups already exists\n');
      }
    } else {
      console.log('\n⚠️  Skipping NOT NULL constraint and FK due to locations without group_id');
    }

    console.log('✅ Migration completed successfully!');
    await db.destroy();
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await db.destroy();
    process.exit(1);
  }
}

addGroupIdToLocations();
