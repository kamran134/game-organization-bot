import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Player gender on the shared user record: nullable, because it is opt-in — the bot
 * never learns it from Telegram, it is set by an admin or by the player themselves.
 */
export class AddUserGender1761000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender varchar(10) NULL`);
    // Guards the column against anything the application layer might let through
    await queryRunner.query(`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_gender
    `);
    await queryRunner.query(`
      ALTER TABLE users
      ADD CONSTRAINT chk_users_gender CHECK (gender IS NULL OR gender IN ('male', 'female'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_gender`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS gender`);
  }
}
