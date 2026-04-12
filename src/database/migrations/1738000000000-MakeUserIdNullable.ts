import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes user_id nullable in game_participants to support guest participants
 * who don't have a Telegram account.
 * 
 * PostgreSQL NULL semantics: NULLs are never equal, so the existing
 * UNIQUE(game_id, user_id) constraint still prevents duplicate user registrations
 * while allowing multiple guests (NULL user_id) per game.
 */
export class MakeUserIdNullable1738000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the existing unique constraint
    await queryRunner.query(`
      ALTER TABLE game_participants
      DROP CONSTRAINT IF EXISTS "UQ_game_participants_game_user"
    `);

    // Also try the default TypeORM-generated constraint name
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'game_participants_game_id_user_id_key'
            AND conrelid = 'game_participants'::regclass
        ) THEN
          ALTER TABLE game_participants DROP CONSTRAINT game_participants_game_id_user_id_key;
        END IF;
      END $$;
    `);

    // Make user_id nullable
    await queryRunner.query(`
      ALTER TABLE game_participants
      ALTER COLUMN user_id DROP NOT NULL
    `);

    // Re-create unique constraint that only applies when user_id IS NOT NULL
    // This is a partial unique index (standard PostgreSQL feature)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_game_participants_unique_user
      ON game_participants (game_id, user_id)
      WHERE user_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove the partial index
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_game_participants_unique_user
    `);

    // Delete guest rows (have no user_id) before making it NOT NULL
    await queryRunner.query(`
      DELETE FROM game_participants WHERE user_id IS NULL
    `);

    // Make user_id NOT NULL again
    await queryRunner.query(`
      ALTER TABLE game_participants
      ALTER COLUMN user_id SET NOT NULL
    `);

    // Restore full unique constraint
    await queryRunner.query(`
      ALTER TABLE game_participants
      ADD CONSTRAINT game_participants_game_id_user_id_key UNIQUE (game_id, user_id)
    `);
  }
}
