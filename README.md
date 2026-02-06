# Game Organization Bot

Telegram бот для организации спортивных игр (футбол, волейбол и другие).

## Технологии

- **Backend**: Node.js + TypeScript
- **База данных**: PostgreSQL
- **Контейнеризация**: Docker + Docker Compose

## Структура проекта

```
game-organization-bot/
├── src/              # Исходный код
│   ├── bot/          # Логика бота
│   ├── database/     # Конфигурация БД
│   ├── models/       # Модели данных
│   ├── services/     # Бизнес-логика
│   ├── utils/        # Утилиты
│   └── index.ts      # Точка входа
├── docker-compose.dev.yml   # Dev окружение
├── docker-compose.prod.yml  # Prod окружение
└── Dockerfile        # Образ приложения
```

## Установка

1. Клонируйте репозиторий
2. Скопируйте `.env.example` в `.env.dev` (для локальной разработки)
3. Укажите токен бота и настройки БД в `.env.dev`

**Для деплоя**: все секреты хранятся в GitHub Secrets, файлы .env генерируются автоматически

## Запуск

### Development

```bash
# Запуск в dev режиме
docker-compose -f docker-compose.dev.yml up --build

# Или локально без Docker
npm install
npm run dev
```

### Production

```bash
# Запуск в prod режиме
docker-compose -f docker-compose.prod.yml up -d --build
```

## Команды npm

- `npm run dev` - Запуск в режиме разработки
- `npm run build` - Сборка проекта
- `npm start` - Запуск собранного проекта
- `npm run lint` - Проверка кода
- `npm run format` - Форматирование кода

## CI/CD

Проект использует GitHub Actions для автоматической сборки и деплоя:
- `main` → Production сервер
- `develop` → Development сервер

Подробная настройка в [CI-CD.md](CI-CD.md)

## Разработка

Подробности требований смотрите в [REQUIREMENTS.md](REQUIREMENTS.md)

## Лицензия

ISC
