import { DataSource } from 'typeorm';
import { User } from '../models/User';
import { Group } from '../models/Group';
import { GroupMember } from '../models/GroupMember';
import { Game } from '../models/Game';
import { GameParticipant } from '../models/GameParticipant';
import { Sport } from '../models/Sport';
import { Location } from '../models/Location';
import { SportLocation } from '../models/SportLocation';

/** Base connection config read from environment variables.
 *  Shared by Database and standalone CLI scripts (e.g. runMigrations.ts). */
export function getDbConnectionConfig() {
  const host     = process.env.DB_HOST || 'localhost';
  const port     = parseInt(process.env.DB_PORT || '5432', 10);
  const username = process.env.DB_USERNAME || process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_DATABASE || process.env.DB_NAME;

  if (!username || password === undefined || !database) {
    throw new Error(
      'Database credentials are not properly configured. ' +
      `Missing: ${!username ? 'DB_USERNAME/DB_USER ' : ''}${password === undefined ? 'DB_PASSWORD ' : ''}${!database ? 'DB_DATABASE/DB_NAME' : ''}`
    );
  }

  return { type: 'postgres' as const, host, port, username, password, database };
}

export class Database {
  private static instance: Database;
  public dataSource: DataSource;

  constructor() {
    const conn = getDbConnectionConfig();

    this.dataSource = new DataSource({
      ...conn,
      entities: [User, Group, GroupMember, Game, GameParticipant, Sport, Location, SportLocation],
      synchronize: process.env.NODE_ENV === 'development', // Auto-sync schema in dev
      logging: process.env.NODE_ENV === 'development',
    });
  }

  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  async connect(skipSync = false): Promise<void> {
    try {
      // Temporarily disable sync if requested (for migrations)
      const originalSync = this.dataSource.options.synchronize;
      if (skipSync) {
        (this.dataSource.options as any).synchronize = false;
      }
      
      await this.dataSource.initialize();
      
      // Restore original sync setting
      if (skipSync) {
        (this.dataSource.options as any).synchronize = originalSync;
      }
      
      console.log('✅ Database connected and initialized');
    } catch (error) {
      console.error('❌ Database connection error:', error);
      throw error;
    }
  }
  
  async synchronize(): Promise<void> {
    try {
      await this.dataSource.synchronize();
      console.log('✅ Database schema synchronized');
    } catch (error) {
      console.error('❌ Database synchronization error:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.dataSource.isInitialized) {
      await this.dataSource.destroy();
    }
  }

  getRepository<T extends object>(entity: new () => T) {
    return this.dataSource.getRepository<T>(entity);
  }
}
