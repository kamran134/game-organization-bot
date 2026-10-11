import './loadEnv';
import 'reflect-metadata';
import { Bot } from './bot/Bot';
import { Database } from './database/Database';
import { SportService } from './services/SportService';
import { startWebAppServer } from './webapp/server';

/** Docker sends SIGKILL 10s after SIGTERM; finish well before that. */
const SHUTDOWN_TIMEOUT_MS = 8000;

// A stray rejection must not take the whole bot down: log it and keep serving.
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection:', reason);
});

// After an uncaught exception the process state is unknown — exit and let Docker restart it.
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

async function main() {
  try {
    console.log('🚀 Starting Game Organization Bot...');

    const database = Database.getInstance();
    await database.connect(true); // Skip auto-sync
    console.log('✅ Database connected');

    // Schema changes in production go through migrations only (see runMigrations.ts).
    // Must match Database.ts, which also enables sync only for 'development'.
    if (process.env.NODE_ENV === 'development') {
      await database.synchronize();
      console.log('✅ Schema synchronized');
    }

    // Initialize default sports
    const sportService = new SportService(database);
    await sportService.initializeDefaultSports();

    // Start WebApp HTTP server
    const httpServer = startWebAppServer(database);

    // Initialize bot. Telegraf's launch() promise only settles when polling stops, so a
    // rejection here means the bot is dead (bad token, 409 from a second instance).
    // Exit so the container restarts instead of serving a healthy /health with no bot.
    const bot = new Bot();
    bot.start().catch((error) => {
      console.error('❌ Bot launch error:', error);
      process.exit(1);
    });

    let shuttingDown = false;
    const shutdown = async (signal: string): Promise<void> => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`\n${signal} received, shutting down...`);

      setTimeout(() => {
        console.error('⚠️ Shutdown timed out, forcing exit');
        process.exit(1);
      }, SHUTDOWN_TIMEOUT_MS).unref();

      try {
        bot.stop(signal);
        await new Promise<void>((resolve) => {
          httpServer.close(() => resolve());
          httpServer.closeIdleConnections();
        });
        console.log('✅ HTTP server closed');
        await database.close();
        console.log('✅ Database connection closed');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };
    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));

  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

main();
