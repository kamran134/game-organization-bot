import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

async function checkDatabaseStructure() {
  const db = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'game_org_bot',
    synchronize: false,
    logging: false,
  });

  try {
    console.log('🔌 Connecting to database...');
    await db.initialize();
    console.log('✅ Connected\n');

    // Check games table structure
    console.log('📋 Games table structure:');
    const gamesColumns = await db.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'games' 
      ORDER BY ordinal_position
    `);
    console.table(gamesColumns);

    // Check if locations table exists
    console.log('\n📋 Locations table:');
    const locationsExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'locations'
      )
    `);
    
    if (locationsExists[0].exists) {
      console.log('✅ Locations table exists');
      
      const locationColumns = await db.query(`
        SELECT column_name, data_type, is_nullable, column_default 
        FROM information_schema.columns 
        WHERE table_name = 'locations' 
        ORDER BY ordinal_position
      `);
      console.table(locationColumns);
      
      // Count locations
      const count = await db.query('SELECT COUNT(*) FROM locations');
      console.log(`\n📊 Total locations: ${count[0].count}`);
      
      // Sample locations
      const locations = await db.query('SELECT * FROM locations LIMIT 5');
      console.log('\n🔍 Sample locations:');
      console.table(locations);
    } else {
      console.log('❌ Locations table does not exist');
    }

    // Check for games with location_id vs location_text
    console.log('\n📊 Games data:');
    const gamesCount = await db.query('SELECT COUNT(*) FROM games');
    console.log(`Total games: ${gamesCount[0].count}`);
    
    const withLocationId = await db.query('SELECT COUNT(*) FROM games WHERE location_id IS NOT NULL');
    console.log(`Games with location_id: ${withLocationId[0].count}`);
    
    const withLocationText = await db.query('SELECT COUNT(*) FROM games WHERE location_text IS NOT NULL');
    console.log(`Games with location_text: ${withLocationText[0].count}`);

    await db.destroy();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkDatabaseStructure();
