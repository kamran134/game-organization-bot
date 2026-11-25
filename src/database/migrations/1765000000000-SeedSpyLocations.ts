import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Global Spy locations (group_id = NULL) per pack. The `custom` pack is not seeded: it holds group locations.
 * Global names are unique case-insensitively across packs (uq_spy_locations_global_name), so no name repeats here.
 */
const SEED: Record<string, string[]> = {
  base: [
    'Больница', 'Школа', 'Банк', 'Ресторан', 'Аэропорт', 'Полиция', 'Театр', 'Супермаркет', 'Пляж', 'Кинотеатр',
    'Университет', 'Отель', 'Казино', 'Церковь', 'Библиотека', 'Парк', 'Зоопарк', 'Музей', 'Стадион', 'Метро',
    'Поезд', 'Самолёт', 'Корабль', 'Посольство', 'Военная база', 'Космическая станция', 'Подводная лодка', 'Цирк',
    'Завод', 'Ферма',
  ],
  city: [
    'Приморский бульвар', 'Ичери-шехер', 'Девичья башня', 'Чайхана', 'Центральный базар', 'Старый двор',
    'Башня Гейдара Алиева', 'Набережная Каспия', 'Хаммам', 'Дворец Ширваншахов', 'Парк Низами', 'Бакинский порт',
    'Нефтяные камни', 'Ковровый музей',
  ],
  movies: [
    'Хогвартс', 'Звезда Смерти', 'Бэт-пещера', 'Парк Юрского периода', 'Титаник',
    'Нарния', 'Мордор', 'Шир', 'Матрица', 'Хогвартс-экспресс', 'Остров Алькатрас', 'Кафе Монк', 'Башня Мстителей',
  ],
  work: [
    'Open space', 'Переговорная', 'Серверная', 'Склад', 'Стройплощадка', 'Колл-центр', 'Бухгалтерия',
    'Отдел кадров', 'Операционная', 'Редакция', 'Кухня ресторана', 'Лаборатория', 'Автосервис', 'Типография',
  ],
  adult: [
    'Сауна', 'Стриптиз-клуб', 'Кальянная', 'Ночной клуб', 'Караоке-бар', 'Винный погреб', 'Бильярдная',
    'Паб', 'Закрытая вечеринка', 'Банный комплекс', 'Ликёрная лавка', 'Гостиничный номер',
  ],
};

export class SeedSpyLocations1765000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [pack, names] of Object.entries(SEED)) {
      for (const name of names) {
        // Re-runnable: a global location with the same name (any pack) is left untouched
        await queryRunner.query(
          `INSERT INTO spy_locations (name, pack, group_id)
           SELECT $1::varchar, $2::varchar, NULL
           WHERE NOT EXISTS (SELECT 1 FROM spy_locations WHERE group_id IS NULL AND lower(name) = lower($1::varchar))`,
          [name, pack],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Only the seeded global rows: group locations and edited names are not touched
    for (const [pack, names] of Object.entries(SEED)) {
      await queryRunner.query(`DELETE FROM spy_locations WHERE group_id IS NULL AND pack = $1 AND name = ANY($2::varchar[])`, [
        pack,
        names,
      ]);
    }
  }
}
