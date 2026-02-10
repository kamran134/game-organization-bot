# 🚀 CI/CD Setup - Quick Guide

## 📋 GitHub Secrets (обязательные)

Перейдите: **Settings → Secrets and variables → Actions → New repository secret**

### SSH доступ к серверу:
```
SSH_HOST          = IP или домен сервера (например: 123.45.67.89)
SSH_USERNAME      = SSH пользователь (например: deploy)
SSH_PRIVATE_KEY   = SSH приватный ключ (весь ключ, включая BEGIN/END)
SSH_PORT          = SSH порт (обычно: 22)
DEPLOY_PATH       = Путь на сервере (например: /opt/game-organization-bot)
```

### База данных и приложение:
```
BOT_TOKEN         = Telegram Bot Token от @BotFather
DB_HOST           = db (для docker-compose)
DB_PORT           = 5432
DB_USERNAME       = имя пользователя БД (например: gamebot)
DB_PASSWORD       = пароль БД (сгенерируйте сложный!)
DB_DATABASE       = имя базы (например: game_organization_bot)
```

## 🔑 GitHub Container Registry (GHCR) - Права

### Автоматические права (уже настроены):
- `GITHUB_TOKEN` - **НЕ НУЖНО добавлять**, доступен автоматически
- Права в workflow: `packages: write` - **уже прописано**

### После первого деплоя:
1. Перейдите: **GitHub → Packages → game-organization-bot**
2. **Package settings** → **Change visibility** → **Public** (опционально)
3. В **Manage Actions access** проверьте: `Read and Write` ✅

## 🖥️ Подготовка сервера (5 минут)

### 1. Установите Docker:
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo systemctl enable docker
sudo systemctl start docker
```

### 2. Создайте пользователя:
```bash
sudo adduser deploy
sudo usermod -aG docker deploy
sudo usermod -aG sudo deploy  # если нужен sudo доступ
```

### 3. Настройте SSH ключ:
```bash
# На ВАШЕМ компьютере:
ssh-keygen -t ed25519 -C "deploy-bot" -f ~/.ssh/game-bot-deploy
# НЕ указывайте passphrase! (просто Enter)

# Скопируйте публичный ключ на сервер:
ssh-copy-id -i ~/.ssh/game-bot-deploy.pub deploy@YOUR_SERVER_IP

# Проверьте подключение:
ssh -i ~/.ssh/game-bot-deploy deploy@YOUR_SERVER_IP

# ПРИВАТНЫЙ ключ добавьте в GitHub Secrets (SSH_PRIVATE_KEY):
cat ~/.ssh/game-bot-deploy
# Скопируйте ВЕСЬ вывод (от BEGIN до END включительно)
```

### 4. Создайте директорию:
```bash
ssh deploy@YOUR_SERVER_IP
sudo mkdir -p /opt/game-organization-bot
sudo chown deploy:deploy /opt/game-organization-bot
cd /opt/game-organization-bot

# Клонируйте репозиторий:
git clone https://github.com/YOUR_USERNAME/game-organization-bot.git .
```

## ✅ Запуск

### Просто сделайте push:
```bash
git add .
git commit -m "feat: setup deployment"
git push origin main
```

### Что происходит автоматически:
1. ✅ GitHub Actions собирает Docker образ
2. ✅ Публикует в GHCR
3. ✅ Подключается к серверу по SSH
4. ✅ Останавливает старый контейнер
5. ✅ Подтягивает новый образ
6. ✅ Запускает бота
7. ✅ Проверяет что всё работает

### Следите за процессом:
**GitHub → Actions → последний workflow**

## 🔍 Мониторинг на сервере

```bash
# Проверка статуса:
docker-compose -f docker-compose.prod.yml ps

# Логи в реальном времени:
docker-compose -f docker-compose.prod.yml logs -f bot

# Последние 100 строк:
docker-compose -f docker-compose.prod.yml logs --tail=100 bot

# Рестарт:
docker-compose -f docker-compose.prod.yml restart bot

# Остановка:
docker-compose -f docker-compose.prod.yml down
```

## 🆘 Troubleshooting

### "Permission denied" при деплое:
```bash
sudo usermod -aG docker deploy
# Перелогиньтесь: exit и снова ssh
```

### "Connection refused" к БД:
Проверьте что `DB_HOST=db` в secrets

### Образ не обновляется:
```bash
cd /opt/game-organization-bot
docker-compose -f docker-compose.prod.yml down
docker rmi ghcr.io/YOUR_USERNAME/game-organization-bot:latest
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

### Бот не запускается:
```bash
# Проверьте логи на ошибки:
docker-compose -f docker-compose.prod.yml logs bot

# Проверьте что БД запущена:
docker-compose -f docker-compose.prod.yml ps db

# Перезапустите всё:
docker-compose -f docker-compose.prod.yml restart
```

## 📦 Структура файлов

```
game-organization-bot/
├── .github/
│   └── workflows/
│       └── deploy.yml          # ← CI/CD pipeline
├── Dockerfile                  # ← Production образ
├── .dockerignore              # ← Исключения для Docker
├── docker-compose.prod.yml    # ← Production конфигурация
└── DEPLOYMENT.md              # ← Полная документация
```

## 🎉 Готово!

После настройки любой push в `main` будет автоматически деплоиться на продакшн!
