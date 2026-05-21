import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recreates the payments table with the revised schema:
 *  - group_id NOT NULL (needed for training monthly payments)
 *  - game_id nullable (set for GAME, NULL for TRAINING)
 *  - period_month VARCHAR(7) (set for TRAINING 'YYYY-MM', NULL for GAME)
 *
 * Any existing data in the old payments table is intentionally dropped.
 */
export class FixPaymentsTableSchema1748100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS payments`);

    await queryRunner.query(`
      CREATE TABLE payments (
        id           SERIAL PRIMARY KEY,
        group_id     INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        game_id      INTEGER REFERENCES games(id) ON DELETE CASCADE,
        period_month VARCHAR(7),
        user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
        guest_name   VARCHAR,
        amount       DECIMAL(10, 2) NOT NULL,
        confirmed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        confirmed_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_payments_user_or_guest
          CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL),
        CONSTRAINT chk_payments_game_or_period
          CHECK (
            (game_id IS NOT NULL AND period_month IS NULL) OR
            (game_id IS NULL     AND period_month IS NOT NULL)
          )
      )
    `);

    // Unique: one payment per user per game
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_payments_game_user
        ON payments (game_id, user_id)
        WHERE game_id IS NOT NULL AND user_id IS NOT NULL
    `);

    // Unique: one payment per user per group per month (training)
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_payments_training_user
        ON payments (group_id, period_month, user_id)
        WHERE game_id IS NULL AND user_id IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX idx_payments_game_id     ON payments(game_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_payments_group_month ON payments(group_id, period_month)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_payments_user_id     ON payments(user_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS payments`);
  }
}
