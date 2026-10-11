# Деплой

Источник истины — `.github/workflows/deploy.yml`. Окружение одно: продакшн, dev-сервера и отдельного пайплайна для него нет.

## Пайплайн

**Триггер:** push в `main` или `master`, либо ручной запуск (`workflow_dispatch`).

**Concurrency:** группа `deploy-<ref>`, `cancel-in-progress: false`. Два быстрых пуша не гоняют миграции и `up -d` параллельно; второй запуск ждёт в очереди. Отмены нет намеренно: прерванный запуск мог бы остановиться между миграцией и перезапуском.

Задачи идут последовательно, каждая зависит от предыдущей:

1. **`test`** (Node 22): `npm ci`, `npx tsc --noEmit`, `npx tsc -p tsconfig.client.json --noEmit`, `npm run lint -- --quiet` (только ошибки, предупреждения не блокируют), `npm test`. Любая ошибка останавливает пайплайн до сборки образа.
2. **`build-and-push`**: сборка образа по `Dockerfile` (`linux/amd64`, кэш GHA) и push в GHCR как `ghcr.io/<owner>/<repo>`. Теги:
   - `latest` — только с default-ветки;
   - `<branch>` — например `main`;
   - `<branch>-<sha>` — например `main-a1b2c3d` (короткий sha), по нему делается откат.
3. **`deploy`** — только для `main` / `master`:
   1. `scp` копирует `docker-compose.prod.yml` в `DEPLOY_PATH`.
   2. По SSH: `docker login ghcr.io` (токеном `GITHUB_TOKEN` этого запуска), экспорт переменных из секретов, `docker compose -f docker-compose.prod.yml pull` (старый бот пока обслуживает трафик).
   3. **Миграции:** `docker compose ... run --rm -T bot npm run migration:run` — одноразовый контейнер из нового образа; `db` поднимается сам через `depends_on`. Если миграции упали, деплой прерывается, старый контейнер остаётся в строю.
   4. `docker compose ... up -d --remove-orphans` пересоздаёт только изменившиеся сервисы: `bot` переезжает на новый образ, `db` не трогается.
   5. `docker image prune -af` удаляет неиспользуемые образы, затем `docker compose ... ps`.
4. **Verify** (шаг внутри `deploy`): до 30 проверок с шагом 5 с (150 с). Деплой успешен, когда Docker-health контейнера `bot` стал `healthy`. Неуспех: контейнера нет; `RestartCount > 3` (crash loop — `restart: unless-stopped` иначе скрыл бы его); не стал `healthy` за 150 с. В каждом случае в лог выводятся последние 100 строк логов бота.
5. **`notify`**: при падении любой задачи только пишет в лог раннера ветку и коммит. Никуда ничего не отправляет.

Миграции выполняются при живом старом контейнере, поэтому каждая должна быть обратно совместима со старым кодом (см. README, «Схема БД»).

## Секреты GitHub Actions

Settings → Secrets and variables → Actions. Имена ровно такие, как в workflow:

| Секрет | Назначение |
|--------|-----------|
| `SSH_HOST` | Хост сервера |
| `SSH_USERNAME` | SSH-пользователь (должен быть в группе `docker`) |
| `SSH_PRIVATE_KEY` | Приватный ключ без passphrase |
| `SSH_PORT` | SSH-порт |
| `DEPLOY_PATH` | Каталог на сервере, куда копируется `docker-compose.prod.yml` |
| `BOT_TOKEN` | Токен Telegram-бота |
| `DB_HOST` | Хост БД для бота; в связке с `docker-compose.prod.yml` это `db` |
| `DB_PORT` | Порт БД (`5432`) |
| `DB_USERNAME` | Пользователь PostgreSQL; им же инициализируется контейнер `db` |
| `DB_PASSWORD` | Пароль PostgreSQL |
| `DB_DATABASE` | Имя базы |
| `WEBAPP_URL` | Публичный origin WebApp (попадает в allow-list CORS) |
| `GROQ_API_KEY` | Ключ Groq (без него бот использует фиксированные шутки) |

`GITHUB_TOKEN` создаётся Actions автоматически: им workflow пушит образ в GHCR (`permissions: packages: write` задано в задаче `build-and-push`) и логинится на сервере для `pull`. Токен живёт только пока идёт запуск.

`TZ=Asia/Baku` и `WEBAPP_PORT=3000` зашиты прямо в `docker-compose.prod.yml`.

## Подготовка сервера

Один раз:

- Docker с плагином Compose; пользователь из `SSH_USERNAME` добавлен в группу `docker`.
- Каталог `DEPLOY_PATH` существует и доступен этому пользователю. Сам `docker-compose.prod.yml` кладёт туда pipeline.
- Публичный ключ из пары `SSH_PRIVATE_KEY` лежит в `~/.ssh/authorized_keys`.
- Пакет в GHCR доступен серверу: либо публичный, либо используется токен с правом `read:packages` (для ручных `pull` вне пайплайна).
- Перед ботом стоит reverse proxy с TLS (Telegram WebApp требует HTTPS). В репозитории его конфигурации нет. Контейнер публикует порт только на `127.0.0.1:3000`, а Express настроен на ровно один прокси (`trust proxy 1`) — иначе rate limiter видел бы адрес прокси вместо клиента.

## Что проверяет `/health`

`GET /health` выполняет `SELECT 1` в PostgreSQL. Ответ `200 {"status":"ok"}` — БД доступна; `503 {"status":"db_unavailable"}` — нет. К Telegram он не обращается, но если запуск бота не удался (неверный токен, 409 от второго инстанса), процесс сам завершается с кодом 1 и контейнер перезапускается, так что «healthy при мёртвом long polling» исключён.

`HEALTHCHECK` в `Dockerfile`: `wget -qO- http://localhost:${WEBAPP_PORT:-3000}/health`, интервал 30 с, таймаут 5 с, `start-period` 45 с.

## Откат

Образы тегируются `main-<sha>`, поэтому вернуть предыдущую версию можно, не пересобирая:

```bash
cd $DEPLOY_PATH
IMG=ghcr.io/<owner>/<repo>

docker pull $IMG:main-<sha>            # если образа нет локально
docker tag  $IMG:main-<sha> $IMG:latest
docker compose -f docker-compose.prod.yml up -d bot   # БЕЗ предварительного pull
```

`docker-compose.prod.yml` ссылается на `:latest`, поэтому нужен `tag`, а `pull` перед `up` затёр бы откат.

- `docker image prune -af` в конце каждого деплоя удаляет все неиспользуемые образы, включая предыдущий релиз. Локально старого образа, как правило, не будет: его придётся тянуть из GHCR (нужен `docker login ghcr.io` с токеном `read:packages`, если пакет не публичный).
- `compose` на сервере интерполирует переменные (`BOT_TOKEN`, `DB_*`, `WEBAPP_URL`, `GITHUB_REPOSITORY` и др.) из окружения. Пайплайн экспортирует их только на время своего SSH-сеанса, поэтому для ручных команд их нужно экспортировать или положить в `.env` рядом с `docker-compose.prod.yml` (pipeline такой файл не создаёт).
- Откат образа не откатывает схему БД. Это безопасно, пока миграции обратно совместимы — поэтому они обязаны такими быть. Если нужно откатить саму миграцию, это отдельная ручная операция.
- Следующий push в `main` задеплоит свежий `latest` поверх отката.

## Полезные команды на сервере

Все — из `DEPLOY_PATH`, переменные окружения для compose заданы (см. выше).

```bash
# статус и логи
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f --tail=100 bot
docker inspect --format '{{.State.Health.Status}} restarts={{.RestartCount}}' game-bot

# psql в базе
docker exec -it game-bot-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

# дамп базы
docker exec game-bot-db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > backup_$(date +%F).sql

# ручной прогон миграций (то же, что делает пайплайн)
docker compose -f docker-compose.prod.yml run --rm -T bot npm run migration:run

# перезапуск только бота
docker compose -f docker-compose.prod.yml restart bot
```

**Не выполняйте `docker compose down -v`**: флаг `-v` удаляет том `postgres-data`, то есть всю базу. Обычный `down` тоже не нужен: пайплайн обновляет сервисы через `up -d`, без остановки БД.
