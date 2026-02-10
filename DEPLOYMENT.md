# 🚀 Инструкция по деплою

## 📋 Требования на сервере

- Ubuntu 20.04+ / Debian 11+
- Docker 24.0+
- Docker Compose 2.20+
- Git
- SSH доступ

## 🔐 Секреты GitHub Actions

Перейдите в **Settings → Secrets and variables → Actions → New repository secret** и добавьте:

### Обязательные секреты:

| Секрет | Описание | Пример |
|--------|----------|--------|
| `SSH_HOST` | IP или домен сервера | `123.45.67.89` |
| `SSH_USERNAME` | SSH пользователь | `deploy` |
| `SSH_PRIVATE_KEY` | SSH приватный ключ (без passphrase!) | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `SSH_PORT` | SSH порт | `22` |
| `DEPLOY_PATH` | Путь к проекту на сервере | `/opt/game-organization-bot` |
| `BOT_TOKEN` | Telegram Bot Token | `1234567890:ABCdef...` |
| `DB_HOST` | Хост БД (для production обычно `db`) | `db` |
| `DB_PORT` | Порт БД | `5432` |
| `DB_USERNAME` | Имя пользователя БД | `gamebot` |
| `DB_PASSWORD` | Пароль БД | `secure_password_123` |
| `DB_DATABASE` | Имя базы данных | `game_organization_bot` |

### Автоматический секрет (уже есть):
- `GITHUB_TOKEN` - автоматически доступен в Actions для push в GHCR

## 🔑 Права в GitHub Container Registry (GHCR)

### Автоматическая настройка (рекомендуется):
1. После первого деплоя перейдите: **GitHub → Packages → game-organization-bot**
2. Нажмите **Package settings**
3. В разделе **Manage Actions access** добавьте:
   - Repository: `Read and Write` (уже должно быть)
4. Сделайте пакет публичным (опционально):
   - **Change visibility → Public**

### Права в workflow:
```yaml
permissions:
  contents: read    # Читать код
  packages: write   # Писать в GHCR
```
Эти права уже настроены в `.github/workflows/deploy.yml`

## 🖥️ Настройка сервера

### 1. Создайте пользователя для деплоя:
```bash
sudo adduser deploy
sudo usermod -aG docker deploy
```

### 2. Настройте SSH ключ:
```bash
# На вашем компьютере
ssh-keygen -t ed25519 -C "deploy@game-bot" -f ~/.ssh/game-bot-deploy
# Не указывайте passphrase!

# Копируйте публичный ключ на сервер
ssh-copy-id -i ~/.ssh/game-bot-deploy.pub deploy@YOUR_SERVER_IP

# Приватный ключ добавьте в GitHub Secrets (SSH_PRIVATE_KEY)
cat ~/.ssh/game-bot-deploy
```

### 3. Создайте директорию проекта:
```bash
ssh deploy@YOUR_SERVER_IP
sudo mkdir -p /opt/game-organization-bot
sudo chown deploy:deploy /opt/game-organization-bot
cd /opt/game-organization-bot

# Клонируйте репозиторий
git clone https://github.com/YOUR_USERNAME/game-organization-bot.git .
```

### 4. Создайте .env файл:
```bash
nano .env
```

Скопируйте содержимое из `.env.example` и заполните реальными значениями.

## 🚀 Первый деплой

### Автоматический (через GitHub Actions):
1. Сделайте commit и push в `main` или `master`:
   ```bash
   git add .
   git commit -m "feat: setup deployment"
   git push origin main
   ```

2. Перейдите: **Actions** → следите за прогрессом

3. При успехе увидите: ✅ Deployment successful!

### Ручной (для тестирования):
```bash
# На сервере
cd /opt/game-organization-bot

# Авторизация в GHCR
echo "YOUR_GITHUB_PAT" | docker login ghcr.io -u YOUR_USERNAME --password-stdin

# Подтягиваем образ
export GITHUB_REPOSITORY=your-username/game-organization-bot
docker-compose -f docker-compose.prod.yml pull

# Запускаем
docker-compose -f docker-compose.prod.yml up -d

# Проверяем логи
docker-compose -f docker-compose.prod.yml logs -f bot
```

## 📊 Мониторинг

### Проверка статуса:
```bash
docker-compose -f docker-compose.prod.yml ps
```

### Логи:
```bash
# Все логи
docker-compose -f docker-compose.prod.yml logs -f

# Только бот
docker-compose -f docker-compose.prod.yml logs -f bot

# Последние 100 строк
docker-compose -f docker-compose.prod.yml logs --tail=100 bot
```

### Рестарт:
```bash
docker-compose -f docker-compose.prod.yml restart bot
```

### Остановка:
```bash
docker-compose -f docker-compose.prod.yml down
```

### Полная переустановка:
```bash
docker-compose -f docker-compose.prod.yml down -v
docker-compose -f docker-compose.prod.yml up -d
```

## 🔧 Troubleshooting

### Проблема: "Permission denied" при деплое
**Решение:**
```bash
sudo usermod -aG docker deploy
# Перелогиньтесь
```

### Проблема: "Connection refused" к БД
**Решение:**
```bash
# Проверьте, что DB_HOST=db в .env
# Проверьте что контейнер БД запущен
docker-compose -f docker-compose.prod.yml ps db
```

### Проблема: Образ не обновляется
**Решение:**
```bash
# Принудительно удалите старый образ
docker-compose -f docker-compose.prod.yml down
docker rmi ghcr.io/YOUR_USERNAME/game-organization-bot:latest
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

## 🔄 Workflow

1. **Разработка** → работаете локально
2. **Commit & Push** → `git push origin main`
3. **GitHub Actions** → автоматически собирает Docker образ
4. **GHCR** → публикует образ в registry
5. **Deploy** → подключается по SSH и обновляет сервер
6. **Verify** → проверяет что бот запустился

## 📈 Оптимизация

### Добавьте проверку здоровья (healthcheck):
```typescript
// src/index.ts
import express from 'express';

const app = express();
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});
app.listen(3000);
```

### Настройте логирование в файл:
```yaml
# docker-compose.prod.yml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

## 🛡️ Безопасность

1. ✅ Используйте непривилегированного пользователя в Docker
2. ✅ Храните секреты в GitHub Secrets, не в коде
3. ✅ Используйте SSH ключи без passphrase для автодеплоя
4. ✅ Регулярно обновляйте зависимости
5. ✅ Используйте `.dockerignore` для исключения лишних файлов
