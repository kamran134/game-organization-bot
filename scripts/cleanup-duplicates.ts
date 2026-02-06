import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

async function cleanupDuplicates() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
  });

  try {
    await dataSource.initialize();
    console.log('✅ Connected to database');

    const result = await dataSource.query(`
      DELETE FROM game_participants
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM game_participants
        GROUP BY game_id, user_id
      );
    `);

    console.log(`✅ Deleted ${result[1]} duplicate records`);

    await dataSource.destroy();
    console.log('✅ Done');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await dataSource.destroy();
    process.exit(1);
  }
}

cleanupDuplicates();
