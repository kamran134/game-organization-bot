import { DataSource } from 'typeorm';
import { User } from '../models/User';
import { Group } from '../models/Group';
import { GroupMember } from '../models/GroupMember';
import { Game } from '../models/Game';
import { GameParticipant } from '../models/GameParticipant';
import { Sport } from '../models/Sport';
import { Location } from '../models/Location';
import { SportLocation } from '../models/SportLocation';

export class Database {
  private static instance: Database;
  public dataSource: DataSource;

  constructor() {
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = parseInt(process.env.DB_PORT || '5432', 10);
    const dbUser = process.env.DB_USER;
    const dbPassword = process.env.DB_PASSWORD;
    const dbName = process.env.DB_NAME;

    if (!dbUser || dbPassword === undefined || !dbName) {
      throw new Error(
        'Database credentials are not properly configured. ' +
        `Missing: ${!dbUser ? 'DB_USER ' : ''}${dbPassword === undefined ? 'DB_PASSWORD ' : ''}${!dbName ? 'DB_NAME' : ''}`
      );
    }

    this.dataSource = new DataSource({
      type: 'postgres',
      host: dbHost,
      port: dbPort,
      username: dbUser,
      password: dbPassword,
      database: dbName,
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
