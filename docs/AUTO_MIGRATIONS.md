# Миграции БД

Описание процесса — в [README.md](../README.md), раздел «Схема БД»: как добавить миграцию, зачем её нужно регистрировать в `src/database/runMigrations.ts`, требование обратной совместимости и как перегенерировать `src/database/schema.sql`.

Коротко, как миграции попадают на прод:

- Деплой (`.github/workflows/deploy.yml`) после `docker compose pull` запускает одноразовый контейнер из нового образа: `docker compose -f docker-compose.prod.yml run --rm -T bot npm run migration:run`. Старый контейнер бота в это время продолжает работать.
- `npm run migration:run` выполняет `node dist/database/runMigrations.js`. Он применяет только миграции из явного списка в `runMigrations.ts`, которых ещё нет в таблице `migrations`, одной транзакцией (`migrationsTransactionMode: 'all'`).
- Если миграция упала, деплой прерывается до `up -d`, старая версия остаётся в работе.
- При старте приложение миграции **не** запускает; `synchronize` включён только при `NODE_ENV=development`.

Подробности деплоя — в [DEPLOYMENT.md](../DEPLOYMENT.md).
