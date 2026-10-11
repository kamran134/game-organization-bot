# Game Organization Bot

Telegram-бот для организации спортивных игр и тренировок (футбол, волейбол и др.) в групповых чатах. Участники записываются кнопками (точно / не точно / гость), формы создания и редактирования открываются во встроенном WebApp внутри Telegram, есть учёт оплаты. Бот работает на long polling.

## Стек

| Слой | Технология |
|------|-----------|
| Бот | Telegraf 4 |
| HTTP / WebApp | Express 4, клиент — TypeScript, собирается в `public/js` |
| БД | PostgreSQL 16, TypeORM 0.3 |
| Язык / рантайм | TypeScript 5, Node.js 22 |
| AI | Groq SDK (шутки при отказе от игры, `JokeService`) |
| Деплой | Docker, GitHub Actions, GHCR |

## Локальная разработка

Нужны Node.js 22 и PostgreSQL 16 (проще всего через Docker).

```bash
npm ci
# создать .env.dev (см. ниже)
npm run dev      # nodemon + ts-node
```

### Переменные окружения

Файл `.env.dev` в корне репозитория (в git не попадает). `src/index.ts` читает `.env.prod`, если `NODE_ENV=production`, иначе `.env.dev`. В Docker-контейнере `.env.prod` нет — переменные приходят из `docker-compose.prod.yml`.

| Переменная | Обязательна | Назначение |
|------------|-------------|-----------|
| `BOT_TOKEN` | да | Токен бота от BotFather. Также используется для проверки подписи `initData` WebApp |
| `DB_USERNAME` (алиас `DB_USER`) | да | Пользователь PostgreSQL |
| `DB_PASSWORD` | да | Пароль |
| `DB_DATABASE` (алиас `DB_NAME`) | да | Имя базы |
| `DB_HOST` | нет, `localhost` | Хост БД |
| `DB_PORT` | нет, `5432` | Порт БД |
| `NODE_ENV` | см. ниже | `development` включает `synchronize`, SQL-логи и снимает проверку Origin в WebApp API |
| `WEBAPP_PORT` | нет, `3000` | Порт Express |
| `WEBAPP_URL` | нет | Origin WebApp-домена, добавляется в allow-list CORS. |
| `GROQ_API_KEY` | нет | Ключ Groq. Без него `JokeService` отдаёт фиксированные шутки |
| `SKIP_TELEGRAM_AUTH` | нет | `true` вместе с `NODE_ENV=development`: запросы к API без `initData` проходят как пользователь `dev` (id 0). Только для локальной отладки WebApp в обычном браузере |
| `CURRENCY_SYMBOL` | нет, `₼` | Символ валюты в сообщениях. |
| `TZ` | нет | Время игр хранится как `timestamptz`, а ввод даты в боте трактуется в локальной зоне процесса. В проде `TZ=Asia/Baku`; локально имеет смысл выставить то же |

**`NODE_ENV=development` обязателен для синхронизации схемы.** `synchronize` включается только при точном значении `development` (`Database.ts`, `index.ts`). Без него схема не создаётся и не обновляется: на пустой базе бот падает на старте, при инициализации видов спорта. Переменную можно положить прямо в `.env.dev`.

Минимальный `.env.dev`:

```ini
NODE_ENV=development
BOT_TOKEN=123456:ABC...
DB_USER=gamebot
DB_PASSWORD=gamebot
DB_NAME=gamebot
DB_PORT=5432
```

Имена `DB_USER` / `DB_NAME` / `DB_PORT` выбраны под `docker-compose.yml`, он читает именно их; приложение принимает их как алиасы.

### База данных

Вариант 1 — Postgres из `docker-compose.yml` (порт опубликован только на `127.0.0.1`):

```bash
docker compose --env-file .env.dev up -d db
```

Поднимать нужно только `db`: сервис `bot` в этом файле — образ из GHCR, локально он не нужен. Схему создаст `synchronize` при первом старте `npm run dev`.

Вариант 2 — база, максимально похожая на прод: развернуть снимок схемы и применить только более новые миграции.

```bash
docker exec -i game-bot-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < src/database/schema.sql
npm run build && npm run migration:run
```

В этом режиме уберите `NODE_ENV=development` из `.env.dev`, иначе `synchronize` начнёт приводить схему к entity.

### Скрипты npm

| Команда | Что делает |
|---------|-----------|
| `npm run dev` | Разработка: nodemon + ts-node, следит за `src/` |
| `npm run build` | `tsc` — сервер в `dist/` |
| `npm run build:client` | `tsc -p tsconfig.client.json` — клиент WebApp в `public/js` |
| `npm run build:all` | оба шага (так собирает Dockerfile) |
| `npm start` | `node dist/index.js` |
| `npm run migration:run` | `node dist/database/runMigrations.js` — нужна предварительная сборка |
| `npm test` | Тесты |
| `npm run lint` | ESLint по `src/**/*.ts` |
| `npm run format` | Prettier |

Проверка типов: `npx tsc --noEmit` (сервер) и `npx tsc -p tsconfig.client.json --noEmit` (клиент).

## Тесты

Встроенный Node test runner с `ts-node/register`, без Jest. Команда `npm test` берёт все файлы по маске `src/__tests__/**/*.test.ts`, новые тесты подхватываются автоматически. База данных не нужна: сервисы тестируются на заглушках, а `entities.test.ts` строит метаданные TypeORM без подключения.

В CI (`.github/workflows/deploy.yml`) перед сборкой образа выполняются те же проверки, что и локально: `tsc --noEmit` для сервера и клиента, `npm run lint -- --quiet` (только ошибки), `npm test`.

## Архитектура

```
src/
├── index.ts                  # DB -> (sync в dev) -> SportService.initializeDefaultSports -> WebApp -> Bot; graceful shutdown
├── bot/
│   ├── Bot.ts                # Telegraf: команды, обработчики, текстовый ввод
│   ├── ServiceContainer.ts   # единственное место, где создаются сервисы, state-менеджеры и flow
│   ├── commands/             # /start /help /wiki /register /newgame /newtraining /games /trainings /players /payments ...
│   ├── flows/                # CreationFlow + creationConfig (мастер создания), Location*Flow
│   ├── handlers/             # callback_query и события чата
│   ├── ui/                   # билдеры сообщений и клавиатур
│   └── utils/
├── services/                 # бизнес-логика
├── models/                   # TypeORM entities
├── utils/                    # StateManager и состояния мастеров, helpers, errors
├── database/                 # Database.ts, runMigrations.ts, migrations/, schema.sql
└── webapp/
    ├── server.ts             # Express: Origin guard, CORS, rate limit 60 req/мин на IP, /health, статика
    ├── routes/               # games, sports, locations, user, payments
    ├── middleware/           # telegramAuth (проверка initData), requireUser
    ├── access.ts             # проверка доступа к данным группы
    ├── gameBodyValidator.ts  # валидация тела POST/PUT /api/games
    ├── serializers.ts        # DTO ответов (без phone, invite_code и т. п.)
    └── client/               # клиентский TypeScript, отдельная сборка
```

- **Один процесс — бот и WebApp.** `index.ts` поднимает Express и Telegraf в одном процессе. Если запуск бота падает (неверный токен, 409 от второго инстанса), процесс завершается и контейнер перезапускается.
- **`ServiceContainer`** собирает зависимости: `UserService`, `GroupService`, `GameService`, `SportService`, `LocationService`, `JokeService`, `PaymentService`, `NotificationService`. `Bot` получает контейнер, а не создаёт сервисы сам. WebApp-сервер создаёт собственные экземпляры нужных ему сервисов в `server.ts`.
- **Мастер создания.** Игры и тренировки создаёт один `CreationFlow`; различия описаны конфигами в `creationConfig.ts` (набор шагов, лимиты, тексты). `/newgame` и `/newtraining` отличаются только выбранным конфигом.
- **`NotificationService`** — единственное место, где бот пишет в групповые чаты (запись, отказ, создание и удаление игры, упоминания участников). Ошибки отправки он проглатывает: упавшее уведомление не должно ломать действие, которое его вызвало.
- **`PaymentService`** — учёт оплат игр и помесячных оплат тренировок (таблица `payments`), общий для команд бота и `/api/payments`.
- **`StateManager`** хранит состояние многошаговых диалогов (мастер создания, создание и редактирование площадок) в памяти процесса с TTL 30 минут. При перезапуске бота все незавершённые диалоги теряются; бот сообщает об этом, если пользователь отвечает на сообщение мастера после рестарта.
- **WebApp-аутентификация.** Заголовок `x-telegram-init-data` проверяется по HMAC от `BOT_TOKEN`, `auth_date` не старше 24 часов; доступ к данным группы даёт активное членство либо проверка через `getChatMember`.
- **`/health`** выполняет `SELECT 1`; при потере БД отвечает 503, и Docker помечает контейнер unhealthy.

## Деплой

Push в `main` (или `master`) запускает GitHub Actions: проверки, сборка образа в GHCR, миграции в одноразовом контейнере, `docker compose up -d` на сервере по SSH, ожидание `healthy`. Окружение одно — продакшн; отдельного dev-пайплайна нет. Подробности, список секретов и откат — в [DEPLOYMENT.md](DEPLOYMENT.md).

## Схема БД

В проде схема меняется **только миграциями**; `synchronize` там выключен. Файл `src/database/schema.sql` — справочный снимок прод-схемы (см. ниже), не источник истины для деплоя.

### Как добавить миграцию

1. Создать файл `src/database/migrations/<timestamp-мс>-<DescriptionOfChange>.ts`, например `1759000000000-AddGameTitle.ts`. Класс называется `<DescriptionOfChange><timestamp>` (`AddGameTitle1759000000000`) и реализует `MigrationInterface` с `up` и `down`.
2. **Зарегистрировать класс вручную в `src/database/runMigrations.ts`** — импорт и элемент массива `migrations`. Автоподхвата файлов нет: незарегистрированная миграция на проде просто не выполнится. Тест `src/__tests__/database/migrations.test.ts` проверяет формат имени класса и наличие в массиве, поэтому `npm test` и CI на этом упадут.
3. Новые колонки — `nullable` или с `DEFAULT`; SQL по возможности идемпотентный (`IF NOT EXISTS`).
4. **Миграция должна быть обратно совместима со старым кодом.** В деплое миграции выполняются *до* старта нового контейнера, пока старый ещё обслуживает трафик. Нельзя в одной миграции удалять или переименовывать колонки, которые читает текущая версия: сначала релиз, который перестаёт их использовать, потом релиз с удалением.
5. Обновить `src/database/schema.sql` (ниже) и закоммитить вместе с миграцией.

Если миграция упала, деплой прерывается, старый контейнер продолжает работать. Миграции идут в одной транзакции (`migrationsTransactionMode: 'all'`).

### Как перегенерировать `schema.sql`

Снимок состоит из `pg_dump --schema-only` и строк таблицы `migrations`. Дамп снимается внутри контейнера `game-bot-db` (на проде — на сервере) из bash; в PowerShell 5.1 редирект `>` пишет UTF-16:

```bash
{
  docker exec game-bot-db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --schema-only --no-owner --no-privileges'
  docker exec game-bot-db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --data-only -t migrations --inserts --no-owner --no-privileges'
} > schema.sql.new
```

Затем перенести результат в `src/database/schema.sql` под комментарий-шапку (обновить в ней дату и последнюю миграцию).

Переменные `POSTGRES_*` уже заданы внутри контейнера (в `docker-compose.prod.yml` — из `DB_USERNAME` / `DB_DATABASE`), поэтому учётные данные в командах не нужны.

## Что нельзя коммитить

`.env.*`, `dist/`, `node_modules/`, любые файлы с токеном бота, паролями БД и API-ключами.

## Лицензия

ISC
