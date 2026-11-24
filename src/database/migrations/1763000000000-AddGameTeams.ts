import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Splitting the roster of a game into teams: the team number lives on the participant row
 * (null = not assigned) and the game remembers how many teams it was split into
 * (null = not split yet). There is deliberately no separate teams table.
 */
export class AddGameTeams1763000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE game_participants ADD COLUMN IF NOT EXISTS team smallint NULL`);
    await queryRunner.query(`ALTER TABLE game_participants DROP CONSTRAINT IF EXISTS chk_game_participants_team`);
    await queryRunner.query(`
      ALTER TABLE game_participants
      ADD CONSTRAINT chk_game_participants_team CHECK (team IS NULL OR (team >= 1 AND team <= 4))
    `);

    await queryRunner.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS team_count smallint NULL`);
    await queryRunner.query(`ALTER TABLE games DROP CONSTRAINT IF EXISTS chk_games_team_count`);
    await queryRunner.query(`
      ALTER TABLE games
      ADD CONSTRAINT chk_games_team_count CHECK (team_count IS NULL OR (team_count >= 2 AND team_count <= 4))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE games DROP CONSTRAINT IF EXISTS chk_games_team_count`);
    await queryRunner.query(`ALTER TABLE games DROP COLUMN IF EXISTS team_count`);
    await queryRunner.query(`ALTER TABLE game_participants DROP CONSTRAINT IF EXISTS chk_game_participants_team`);
    await queryRunner.query(`ALTER TABLE game_participants DROP COLUMN IF EXISTS team`);
  }
}
