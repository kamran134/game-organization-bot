# Multi-stage build для оптимизации размера образа
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript (server + client)
RUN npm run build:all

# Production образ
FROM node:22-alpine

WORKDIR /app

# Создаём непривилегированного пользователя для безопасности
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Копируем только production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Копируем скомпилированный код из builder (включая миграции)
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Копируем статические файлы для WebApp
COPY --from=builder --chown=nodejs:nodejs /app/public ./public

# Переключаемся на непривилегированного пользователя
USER nodejs

# Expose port (if needed for webhooks/health)
EXPOSE 3000

# Healthcheck — probe the HTTP /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s \
  CMD wget -qO- http://localhost:${WEBAPP_PORT:-3000}/health || exit 1

# Start the bot
CMD ["node", "dist/index.js"]
