import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGroupMemberIsActive1755000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE group_members
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE group_members
      DROP COLUMN IF EXISTS is_active
    `);
  }
}
