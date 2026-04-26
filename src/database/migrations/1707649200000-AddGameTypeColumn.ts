import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Добавляет колонку type в таблицу games для разделения игр и тренировок
 */
export class AddGameTypeColumn1707649200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'game_type') THEN
          CREATE TYPE game_type AS ENUM ('GAME', 'TRAINING');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE games
      ADD COLUMN IF NOT EXISTS type game_type NOT NULL DEFAULT 'GAME'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Удаляем колонку
    await queryRunner.query(`
      ALTER TABLE games 
      DROP COLUMN type
    `);

    // Удаляем ENUM тип
    await queryRunner.query(`
      DROP TYPE game_type
    `);
  }
}
