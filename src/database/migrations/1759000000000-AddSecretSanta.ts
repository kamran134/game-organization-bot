import { MigrationInterface, QueryRunner } from 'typeorm';

/** Secret Santa: events and their participants. Only new tables, so it is backward compatible with the running code. */
export class AddSecretSanta1759000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS santa_events (
        id serial PRIMARY KEY,
        group_id integer NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        title varchar(100) NOT NULL,
        description text NULL,
        budget varchar(50) NULL,
        exchange_date date NULL,
        status varchar(20) NOT NULL DEFAULT 'registration',
        created_by integer NULL REFERENCES users(id) ON DELETE SET NULL,
        drawn_at timestamptz NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_santa_events_group_id ON santa_events (group_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS santa_participants (
        id serial PRIMARY KEY,
        event_id integer NOT NULL REFERENCES santa_events(id) ON DELETE CASCADE,
        user_id integer NOT NULL REFERENCES users(id),
        wishlist text NULL,
        receiver_id integer NULL REFERENCES users(id),
        joined_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_santa_participants_event_user ON santa_participants (event_id, user_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS santa_participants`);
    await queryRunner.query(`DROP TABLE IF EXISTS santa_events`);
  }
}
