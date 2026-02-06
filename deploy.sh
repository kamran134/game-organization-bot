#!/bin/bash

# Deploy script for Game Organization Bot
# Usage: ./deploy.sh [prod|dev]

set -e

ENVIRONMENT=${1:-prod}

echo "🚀 Starting deployment for $ENVIRONMENT environment..."

# Load environment-specific variables
if [ "$ENVIRONMENT" = "prod" ]; then
    COMPOSE_FILE="docker-compose.prod.yml"
    echo "📦 Deploying to PRODUCTION"
elif [ "$ENVIRONMENT" = "dev" ]; then
    COMPOSE_FILE="docker-compose.dev.yml"
    echo "📦 Deploying to DEVELOPMENT"
else
    echo "❌ Invalid environment. Use 'prod' or 'dev'"
    exit 1
fi

# Pull latest images
echo "⬇️  Pulling latest images..."
docker-compose -f $COMPOSE_FILE pull

# Stop old containers
echo "🛑 Stopping old containers..."
docker-compose -f $COMPOSE_FILE down

# Start new containers
echo "▶️  Starting new containers..."
docker-compose -f $COMPOSE_FILE up -d

# Clean up old images
echo "🧹 Cleaning up old images..."
docker image prune -f

# Show status
echo "📊 Container status:"
docker-compose -f $COMPOSE_FILE ps

echo "✅ Deployment completed successfully!"
