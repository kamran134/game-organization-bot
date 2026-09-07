import 'reflect-metadata';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { ENTITIES } from '../../database/Database';

/**
 * Эти тесты закрывают слой маппинга сущностей, который юнит-тесты сервисов не трогают:
 * они мокают репозиторий и до построения метаданных TypeORM не доходят.
 *
 * Реальный инцидент: `username?: string` заменили на `string | null`, TS начал эмитить
 * design:type = Object, декоратор @Column() без явного type подставил Object как тип
 * колонки, и TypeORM упал с DataTypeNotSupportedError при старте. `tsc` был чист,
 * 235 юнит-тестов были зелёными, прод лежал.
 *
 * buildMetadatas() прогоняет полный билдер метаданных и валидацию, но не открывает
 * соединение — поэтому проверка работает в CI без базы.
 */
async function buildMetadatas(): Promise<DataSource> {
  const dataSource = new DataSource({
    type: 'postgres',
    host: 'localhost',
    database: 'metadata_check',
    entities: ENTITIES,
    synchronize: false,
  });

  // buildMetadatas объявлен protected, но это единственный способ прогнать билдер
  // метаданных без открытия соединения.
  await (dataSource as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
  return dataSource;
}

describe('entity metadata', () => {
  test('builds for every registered entity without connecting to a database', async () => {
    const dataSource = await buildMetadatas();

    assert.equal(dataSource.entityMetadatas.length, ENTITIES.length);
  });

  test('every column resolves to a concrete database type', async () => {
    const dataSource = await buildMetadatas();

    const unresolved: string[] = [];
    for (const entity of dataSource.entityMetadatas) {
      for (const column of entity.columns) {
        // Object — это то, что TS эмитит для union-типов вроде `string | null`.
        // Такой тип postgres-драйвер не умеет, и падение происходит только на старте.
        // Приведение нужно потому, что по типам ColumnType такого значения быть не может,
        // а в рантайме оно ровно так и приезжает — в этом и была авария.
        const columnType: unknown = column.type;
        if (columnType === Object || columnType === undefined) {
          unresolved.push(`${entity.name}.${column.propertyName}`);
        }
      }
    }

    assert.deepEqual(unresolved, [], `Columns without a usable type: ${unresolved.join(', ')}`);
  });

  test('every entity has a primary column', async () => {
    const dataSource = await buildMetadatas();

    const withoutPrimary = dataSource.entityMetadatas
      .filter((entity) => entity.primaryColumns.length === 0)
      .map((entity) => entity.name);

    assert.deepEqual(withoutPrimary, []);
  });

  test('every relation points at a registered entity', async () => {
    const dataSource = await buildMetadatas();

    const registered = new Set(dataSource.entityMetadatas.map((entity) => entity.name));
    const dangling: string[] = [];

    for (const entity of dataSource.entityMetadatas) {
      for (const relation of entity.relations) {
        if (!registered.has(relation.inverseEntityMetadata.name)) {
          dangling.push(`${entity.name}.${relation.propertyName}`);
        }
      }
    }

    assert.deepEqual(dangling, [], `Relations to unregistered entities: ${dangling.join(', ')}`);
  });
});
