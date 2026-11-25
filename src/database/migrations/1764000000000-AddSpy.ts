import { MigrationInterface, QueryRunner } from 'typeorm';

/** The Spy game: locations, evenings, participants, rounds, per-round players and votes. Only new tables. */
export class AddSpy1764000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS spy_locations (
        id serial PRIMARY KEY,
        name varchar(100) NOT NULL,
        pack varchar(20) NOT NULL DEFAULT 'base',
        group_id integer NULL REFERENCES groups(id) ON DELETE CASCADE,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_spy_locations_group_name ON spy_locations (group_id, lower(name)) WHERE group_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_spy_locations_global_name ON spy_locations (lower(name)) WHERE group_id IS NULL`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_spy_locations_pack ON spy_locations (pack)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS spy_events (
        id serial PRIMARY KEY,
        group_id integer NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        title varchar(100) NOT NULL,
        description text NULL,
        starts_at timestamptz NULL,
        place varchar(200) NULL,
        status varchar(20) NOT NULL DEFAULT 'registration',
        host_id integer NULL REFERENCES users(id) ON DELETE SET NULL,
        max_players integer NOT NULL DEFAULT 10,
        spy_count integer NULL,
        double_agent boolean NOT NULL DEFAULT false,
        mr_white boolean NOT NULL DEFAULT false,
        packs jsonb NOT NULL DEFAULT '["base"]',
        turn_seconds integer NULL,
        hint_after_cycles smallint NULL,
        round integer NOT NULL DEFAULT 0,
        card_chat_id bigint NULL,
        card_message_id integer NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_spy_events_group_id ON spy_events (group_id)`);
    // Guard the columns against anything the application layer might let through
    await this.addCheck(queryRunner, 'spy_events', 'chk_spy_events_max_players', 'max_players BETWEEN 3 AND 20');
    await this.addCheck(queryRunner, 'spy_events', 'chk_spy_events_spy_count', 'spy_count IS NULL OR spy_count >= 1');
    await this.addCheck(
      queryRunner,
      'spy_events',
      'chk_spy_events_turn_seconds',
      'turn_seconds IS NULL OR turn_seconds BETWEEN 15 AND 300',
    );
    await this.addCheck(
      queryRunner,
      'spy_events',
      'chk_spy_events_hint_after_cycles',
      'hint_after_cycles IS NULL OR hint_after_cycles BETWEEN 1 AND 10',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS spy_participants (
        id serial PRIMARY KEY,
        event_id integer NOT NULL REFERENCES spy_events(id) ON DELETE CASCADE,
        user_id integer NOT NULL REFERENCES users(id),
        is_active boolean NOT NULL DEFAULT true,
        joined_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_spy_participants_event_user ON spy_participants (event_id, user_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS spy_rounds (
        id serial PRIMARY KEY,
        event_id integer NOT NULL REFERENCES spy_events(id) ON DELETE CASCADE,
        number integer NOT NULL,
        location_id integer NULL REFERENCES spy_locations(id) ON DELETE SET NULL,
        location_name varchar(100) NOT NULL,
        location_pack varchar(20) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'in_progress',
        turn_order jsonb NOT NULL,
        turn_index integer NOT NULL DEFAULT 0,
        cycle smallint NOT NULL DEFAULT 1,
        turn_started_at timestamptz NULL,
        outcome varchar(20) NULL,
        outcome_reason varchar(20) NULL,
        guess text NULL,
        guessed_by integer NULL REFERENCES users(id) ON DELETE SET NULL,
        started_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz NULL
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_spy_rounds_event_number ON spy_rounds (event_id, number)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_spy_rounds_event_status ON spy_rounds (event_id, status)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS spy_round_players (
        id serial PRIMARY KEY,
        round_id integer NOT NULL REFERENCES spy_rounds(id) ON DELETE CASCADE,
        user_id integer NOT NULL REFERENCES users(id),
        role varchar(20) NOT NULL,
        is_eliminated boolean NOT NULL DEFAULT false
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_spy_round_players_round_user ON spy_round_players (round_id, user_id)`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_spy_round_players_user ON spy_round_players (user_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS spy_votes (
        id serial PRIMARY KEY,
        round_id integer NOT NULL REFERENCES spy_rounds(id) ON DELETE CASCADE,
        voter_id integer NOT NULL REFERENCES users(id),
        target_id integer NOT NULL REFERENCES users(id),
        ballot smallint NOT NULL DEFAULT 1,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_spy_votes_round_ballot_voter ON spy_votes (round_id, ballot, voter_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS spy_votes`);
    await queryRunner.query(`DROP TABLE IF EXISTS spy_round_players`);
    await queryRunner.query(`DROP TABLE IF EXISTS spy_rounds`);
    await queryRunner.query(`DROP TABLE IF EXISTS spy_participants`);
    await queryRunner.query(`DROP TABLE IF EXISTS spy_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS spy_locations`);
  }

  /** Drop-and-add keeps the migration re-runnable: ADD CONSTRAINT has no IF NOT EXISTS form. */
  private async addCheck(queryRunner: QueryRunner, table: string, name: string, expression: string): Promise<void> {
    await queryRunner.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}`);
    await queryRunner.query(`ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (${expression})`);
  }
}
