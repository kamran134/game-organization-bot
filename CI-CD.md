# CI/CD Configuration Guide

## GitHub Actions Secrets

**Все чувствительные данные хранятся ТОЛЬКО в GitHub Secrets!**

Для работы автоматического деплоя необходимо настроить следующие секреты в GitHub (Settings → Secrets and variables → Actions):

### Production Environment

#### SSH подключение:
1. `PROD_HOST` - IP адрес или домен продакшн сервера
2. `PROD_USER` - пользователь для SSH подключения
3. `PROD_SSH_KEY` - приватный SSH ключ для подключения
4. `PROD_PORT` - порт SSH (опционально, по умолчанию 22)
5. `PROD_DEPLOY_PATH` - путь к папке с проектом на сервере (например: `/home/user/game-organization-bot`)

#### Приложение:
6. `PROD_BOT_TOKEN` - токен Telegram бота для продакшн
7. `PROD_DB_USER` - пользователь PostgreSQL
8. `PROD_DB_PASSWORD` - пароль PostgreSQL
9. `PROD_DB_NAME` - имя базы данных (например: `gamebot_prod`)

### Development Environment

#### SSH подключение:
1. `DEV_HOST` - IP адрес или домен dev сервера
2. `DEV_USER` - пользователь для SSH подключения
3. `DEV_SSH_KEY` - приватный SSH ключ для подключения
4. `DEV_PORT` - порт SSH (опционально, по умолчанию 22)
5. `DEV_DEPLOY_PATH` - путь к папке с проектом на сервере

#### Приложение:
6. `DEV_BOT_TOKEN` - токен Telegram бота для dev
7. `DEV_DB_USER` - пользователь PostgreSQL
8. `DEV_DB_PASSWORD` - пароль PostgreSQL
9. `DEV_DB_NAME` - имя базы данных (например: `gamebot_dev`)

## Настройка SSH ключей

### Генерация SSH ключа

```bash
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github-actions
```

### Добавление публичного ключа на сервер

```bash
ssh-copy-id -i ~/.ssh/github

## Добавление секретов в GitHub

1. Откройте ваш репозиторий на GitHub
2. Перейдите в **Settings** → **Secrets and variables** → **Actions**
3. Нажмите **New repository secret** для каждого секрета
4. Введите имя и значение секрета
5. Повторите для всех секретов из списка выше

**⚠️ ВАЖНО**: Файлы `.env.dev` и `.env.prod` автоматически генерируются при деплое из GitHub Secrets. НЕ добавляйте их в репозиторий!-actions.pub user@server
```

Или вручную:
```bash
cat ~/.ssh/github-actions.pub >> ~/.ssh/authorized_keys
```

### Добавление приватного ключа в GitHub Secrets

1. Скопируйте содержимое приватного ключа:
   ```bash
   cat ~/.ssh/github-actions
   ```
2. Перейдите в Settings → Secrets and variables → Actions
3. Создайте новый secret с именем `PROD_SSH_KEY` или `DEV_SSH_KEY`
4. Вставьте содержимое ключа

## Workflow процесс

### Ветка `main` → Production
- Триггер: push в ветку `main`
- Собирается Docker образ с тегом `latest`
- Пушится в GitHub Container Registry
- Деплоится на продакшн сервер

### Ветка `develop` → Development
- Триггер: push в ветку `develop`
- Собирается Docker образ с тегом `develop`
- Пушится в GitHub Container Registry
- Деплоится на dev сервер

## Подготовка сервера
копируется автоматически)
├── .env.prod (генерируется автоматически)
└── (остальные файлы не нужны)
```

### Первичная настройка на сервере

```bash
# Создать папку проекта
mkdir -p /home/user/game-organization-bot

# Всё остальное GitHub Actions сделает автоматически при первом деплое
```

**Важно**: Все файлы (docker-compose и .env) копируются и создаются автоматически при деплое. Вручную ничего не нужно!оздать папку проекта
mkdir -p /home/user/game-organization-bot
cd /home/user/game-organization-bot

# Скопировать docker-compose и env файлы
# (эти файлы должны быть на сервере постоянно)
scp docker-compose.prod.yml .env.prod user@server:/home/user/game-organization-bot/

# Логин в GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
```

## Ручной деплой

Если нужно задеплоить вручную, используйте скрипт:

```bash
# На сервере
./deploy.sh prod  # для продакшн
./deploy.sh dev   # для dev
```

## Отладка

Просмотр логов на сервере:
```bash
docker-compose -f docker-compose.prod.yml logs -f
```

Статус контейнеров:
```bash
docker-compose -f docker-compose.prod.yml ps
```
