import { Database } from '../Database';

export async function runMigration() {
  const db = Database.getInstance();
  const queryRunner = db.dataSource.createQueryRunner();
  
  try {
    await queryRunner.connect();
    
    // Проверяем, нужна ли миграция (есть ли старая колонка sport_type)
    const hasOldColumn = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='games' AND column_name='sport_type'
    `);
    
    // Если колонки sport_type нет - миграция уже выполнена
    if (hasOldColumn.length === 0) {
      console.log('✅ Migration already completed (sport_type column not found)');
      return;
    }
    
    console.log('🔄 Running migration: sport_type to sport_id...');
    await queryRunner.startTransaction();

    // Удаляем все существующие игры (только если миграция действительно нужна)
    await queryRunner.query(`DELETE FROM game_participants`);
    await queryRunner.query(`DELETE FROM games`);
    console.log('✅ Cleared games table');

    // Удаляем старую колонку sport_type
    await queryRunner.query(`ALTER TABLE games DROP COLUMN sport_type`);
    console.log('✅ Dropped sport_type column');

    await queryRunner.commitTransaction();
    console.log('✅ Migration completed successfully');
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await queryRunner.release();
  }
}
