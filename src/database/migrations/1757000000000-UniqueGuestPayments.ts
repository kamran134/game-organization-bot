import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Guest game payments had no unique index, so the route's `ON CONFLICT DO NOTHING`
 * never fired and every "confirm payment" for a guest inserted another row,
 * inflating totals. Each upsert overwrites the amount, so the most recently
 * updated row is the current value — keep it and drop the older duplicates.
 *
 * down() only drops the index: deleted duplicates are not restorable.
 */
export class UniqueGuestPayments1757000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const deleted = await queryRunner.query(`
      DELETE FROM payments p
       USING payments q
       WHERE p.game_id IS NOT NULL
         AND p.user_id IS NULL
         AND q.user_id IS NULL
         AND p.game_id = q.game_id
         AND p.guest_name = q.guest_name
         AND (p.updated_at, p.id) < (q.updated_at, q.id)
      RETURNING p.id
    `);
    console.log(`UniqueGuestPayments: removed ${Array.isArray(deleted) ? deleted.length : 0} duplicate guest payment row(s)`);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_game_guest
        ON payments (game_id, guest_name)
        WHERE game_id IS NOT NULL AND user_id IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_payments_game_guest`);
  }
}
