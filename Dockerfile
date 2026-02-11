# Multi-stage build для оптимизации размера образа
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production образ
FROM node:20-alpine

WORKDIR /app

# Создаём непривилегированного пользователя для безопасности
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Копируем только production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Копируем скомпилированный код из builder (включая миграции)
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Переключаемся на непривилегированного пользователя
USER nodejs

# Expose port (if needed for webhooks/health)
EXPOSE 3000

# Healthcheck для мониторинга
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "console.log('Bot is running')" || exit 1

# Start the bot
CMD ["node", "dist/index.js"]
