import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { AddGameTypeColumn1707649200000 } from './migrations/1707649200000-AddGameTypeColumn';
import { MakeUserIdNullable1738000000000 } from './migrations/1738000000000-MakeUserIdNullable';

// Загружаем переменные окружения
dotenv.config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'game_bot',
  entities: [],
  migrations: [AddGameTypeColumn1707649200000, MakeUserIdNullable1738000000000],
  synchronize: false,
  logging: true,
  migrationsRun: false,
  migrationsTransactionMode: 'all',
});

async function runMigrations() {
  console.log('🔄 Initializing database connection...');
  
  try {
    await AppDataSource.initialize();
    console.log('✅ Database connection established');
    
    console.log('🔄 Running pending migrations...');
    const migrations = await AppDataSource.runMigrations();
    
    if (migrations.length === 0) {
      console.log('✅ No pending migrations');
    } else {
      console.log(`✅ Successfully ran ${migrations.length} migration(s):`);
      migrations.forEach(migration => {
        console.log(`   - ${migration.name}`);
      });
    }
    
    await AppDataSource.destroy();
    console.log('✅ Migration process completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
