import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { AddGameTypeColumn1707649200000 } from './migrations/1707649200000-AddGameTypeColumn';
import { MakeUserIdNullable1738000000000 } from './migrations/1738000000000-MakeUserIdNullable';
import { AddRegistrationLockHours1745500000000 } from './migrations/1745500000000-AddRegistrationLockHours';
import { getDbConnectionConfig } from './Database';

dotenv.config({ path: path.resolve(process.cwd(), process.env.NODE_ENV === 'production' ? '.env.prod' : '.env.dev') });

const AppDataSource = new DataSource({
  ...getDbConnectionConfig(),
  entities: [],
  migrations: [AddGameTypeColumn1707649200000, MakeUserIdNullable1738000000000, AddRegistrationLockHours1745500000000],
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
