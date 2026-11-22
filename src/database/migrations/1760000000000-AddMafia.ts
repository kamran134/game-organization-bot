import { MigrationInterface, QueryRunner } from 'typeorm';

/** Mafia evenings: events and their participants. Only new tables, so it is backward compatible with the running code. */
export class AddMafia1760000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mafia_events (
        id serial PRIMARY KEY,
        group_id integer NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        title varchar(100) NOT NULL,
        description text NULL,
        starts_at timestamptz NULL,
        place varchar(200) NULL,
        status varchar(20) NOT NULL DEFAULT 'registration',
        host_id integer NULL REFERENCES users(id) ON DELETE SET NULL,
        show_mafia_team boolean NOT NULL DEFAULT true,
        assign_seats boolean NOT NULL DEFAULT false,
        max_players integer NOT NULL DEFAULT 10 CONSTRAINT chk_mafia_events_max_players CHECK (max_players BETWEEN 4 AND 30),
        round integer NOT NULL DEFAULT 0,
        roles_config jsonb NULL,
        dealt_at timestamptz NULL,
        card_chat_id bigint NULL,
        card_message_id integer NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_mafia_events_group_id ON mafia_events (group_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mafia_participants (
        id serial PRIMARY KEY,
        event_id integer NOT NULL REFERENCES mafia_events(id) ON DELETE CASCADE,
        user_id integer NOT NULL REFERENCES users(id),
        role varchar(20) NULL,
        seat integer NULL,
        card_variant smallint NULL,
        joined_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_mafia_participants_event_user ON mafia_participants (event_id, user_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS mafia_participants`);
    await queryRunner.query(`DROP TABLE IF EXISTS mafia_events`);
  }
}
