import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Brings the production schema in line with what the code assumes.
 *
 * - game_participants.game_id FK was NO ACTION, so deleting a game that had
 *   participants failed; both delete paths rely on the DB cascading. Same FK
 *   name as TypeORM generates, so dev `synchronize` sees no difference.
 * - Unique (user_id, group_id) on group_members and (sport_id, location_id) on
 *   sport_locations: the services do find-then-insert, which races. Prod had no
 *   duplicates when this was written (checked 2026-10-11).
 * - games.game_date becomes timestamptz. Existing values are wall-clock times
 *   written under TZ=Asia/Baku (server and DB), so they are interpreted in that zone.
 *   Old code keeps working during the deploy window: node-pg sends Dates with an
 *   offset and parses timestamptz correctly.
 * - Plain indexes for the hot lookups (games by group/date, participants by game,
 *   members by group).
 */
export class HardenSchema1758000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE game_participants
        DROP CONSTRAINT IF EXISTS "FK_1f734478543677e66383f1f5bd4"
    `);
    await queryRunner.query(`
      ALTER TABLE game_participants
        ADD CONSTRAINT "FK_1f734478543677e66383f1f5bd4"
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_group_members_user_group
        ON group_members (user_id, group_id)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sport_locations_sport_location
        ON sport_locations (sport_id, location_id)
    `);

    await queryRunner.query(`
      ALTER TABLE games
        ALTER COLUMN game_date TYPE timestamptz
        USING game_date AT TIME ZONE 'Asia/Baku'
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_games_group_date ON games (group_id, game_date)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_game_participants_game_id ON game_participants (game_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members (group_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_group_members_group_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_game_participants_game_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_games_group_date`);

    await queryRunner.query(`
      ALTER TABLE games
        ALTER COLUMN game_date TYPE timestamp
        USING game_date AT TIME ZONE 'Asia/Baku'
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS uq_sport_locations_sport_location`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_group_members_user_group`);

    await queryRunner.query(`
      ALTER TABLE game_participants
        DROP CONSTRAINT IF EXISTS "FK_1f734478543677e66383f1f5bd4"
    `);
    await queryRunner.query(`
      ALTER TABLE game_participants
        ADD CONSTRAINT "FK_1f734478543677e66383f1f5bd4"
        FOREIGN KEY (game_id) REFERENCES games(id)
    `);
  }
}
