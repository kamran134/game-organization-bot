import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentsTable1748000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id           SERIAL PRIMARY KEY,
        game_id      INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
        guest_name   VARCHAR,
        amount       DECIMAL(10, 2) NOT NULL,
        confirmed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        confirmed_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_payments_game_user
          UNIQUE (game_id, user_id),
        CONSTRAINT chk_payments_user_or_guest
          CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_game_id ON payments(game_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS payments`);
  }
}
