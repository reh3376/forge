#!/bin/bash
echo "🚀 Starting WHK Recipe Configuration Development Environment"

# Start Docker services if available
if command -v docker &> /dev/null && [[ -f "docker-compose.codex.yml" ]]; then
    echo "📦 Starting Docker services..."
    docker compose -f docker-compose.codex.yml up -d postgres redis
fi

# Build shared package first
echo "🔨 Building shared package..."
npm run build:shared

# Start backend and frontend applications concurrently
echo "🔧 Starting backend and frontend applications..."
npm run dev
