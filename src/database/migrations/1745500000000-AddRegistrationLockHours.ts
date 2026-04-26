import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRegistrationLockHours1745500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE games
      ADD COLUMN IF NOT EXISTS registration_lock_hours INTEGER NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE games
      DROP COLUMN IF EXISTS registration_lock_hours
    `);
  }
}
