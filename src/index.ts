import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { Bot } from './bot/Bot';
import { Database } from './database/Database';
import { SportService } from './services/SportService';
import { runMigration } from './database/migrations/001_sport_refactor';
import { migrateLocationsToManyToMany } from './database/migrations/migrateLocations';
import { startWebAppServer } from './webapp/server';
import * as path from 'path';

// Load environment variables
const envFile = process.env.NODE_ENV === 'production' 
  ? '.env.prod' 
  : '.env.dev';
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

async function main() {
  try {
    console.log('🚀 Starting Game Organization Bot...');

    // Initialize database without sync (migration will be run first)
    const database = Database.getInstance();
    await database.connect(true); // Skip auto-sync
    console.log('✅ Database connected');

    // Run migration to clean up old schema
    await runMigration();
    console.log('✅ Migration completed');

    // Run locations migration (many-to-many)
    await migrateLocationsToManyToMany();
    console.log('✅ Locations migration completed');

    // Now synchronize schema with new models
    await database.synchronize();
    console.log('✅ Schema synchronized');

    // Initialize default sports
    const sportService = new SportService(database);
    await sportService.initializeDefaultSports();

    // Start WebApp HTTP server
    const httpServer = startWebAppServer(database);

    // Initialize bot
    const bot = new Bot();
    bot.start().then(() => {
      console.log('✅ Bot started successfully');
      console.log('📱 Waiting for messages...');
    }).catch((error) => {
      console.error('❌ Bot launch error:', error);
    });

    // Graceful shutdown
    const shutdown = (signal: string) => {
      console.log(`\n${signal} received, shutting down...`);
      bot.stop(signal);
      httpServer.close(() => console.log('✅ HTTP server closed'));
    };
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));

  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

main();
