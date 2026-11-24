import { MigrationInterface, QueryRunner } from 'typeorm';

/** The host's game log of a Mafia evening. Only a new table, so it is backward compatible with the running code. */
export class AddMafiaLog1762000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mafia_log_entries (
        id serial PRIMARY KEY,
        event_id integer NOT NULL REFERENCES mafia_events(id) ON DELETE CASCADE,
        round integer NOT NULL,
        cycle integer NOT NULL,
        phase varchar(10) NOT NULL,
        type varchar(20) NOT NULL,
        target_user_id integer NULL REFERENCES users(id),
        note text NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_mafia_log_entries_event_round ON mafia_log_entries (event_id, round, cycle)`,
    );
    // Guard the columns against anything the application layer might let through
    await queryRunner.query(`ALTER TABLE mafia_log_entries DROP CONSTRAINT IF EXISTS chk_mafia_log_entries_phase`);
    await queryRunner.query(`
      ALTER TABLE mafia_log_entries
      ADD CONSTRAINT chk_mafia_log_entries_phase CHECK (phase IN ('night', 'day'))
    `);
    await queryRunner.query(`ALTER TABLE mafia_log_entries DROP CONSTRAINT IF EXISTS chk_mafia_log_entries_type`);
    await queryRunner.query(`
      ALTER TABLE mafia_log_entries
      ADD CONSTRAINT chk_mafia_log_entries_type CHECK (type IN ('kill', 'heal', 'check', 'block', 'lynch', 'note'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS mafia_log_entries`);
  }
}
