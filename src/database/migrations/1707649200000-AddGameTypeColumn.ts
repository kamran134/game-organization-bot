import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Добавляет колонку type в таблицу games для разделения игр и тренировок
 */
export class AddGameTypeColumn1707649200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Создаём ENUM тип
    await queryRunner.query(`
      CREATE TYPE game_type AS ENUM ('GAME', 'TRAINING')
    `);

    // Добавляем колонку с NOT NULL и default значением
    await queryRunner.query(`
      ALTER TABLE games 
      ADD COLUMN type game_type NOT NULL DEFAULT 'GAME'
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
