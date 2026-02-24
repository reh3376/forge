#!/bin/bash

# Development script to run frontend + backend locally with Railway database
# Usage: ./dev-railway.sh [backend|frontend|both]
# Note: Set RAILWAY_DB_URL environment variable before running

# Check if RAILWAY_DB_URL is set
if [ -z "$RAILWAY_DB_URL" ]; then
  echo "❌ Error: RAILWAY_DB_URL environment variable is not set"
  echo "Please set it with: export RAILWAY_DB_URL=<your-railway-db-url>"
  exit 1
fi

case "${1:-both}" in
  backend)
    echo "🚀 Starting backend with Railway database..."
    cd apps/whk-recipe-configuration
    DB_URL="$RAILWAY_DB_URL" npm run dev
    ;;
  frontend)
    echo "🎨 Starting frontend..."
    cd apps/mes-ui
    npm run dev
    ;;
  both)
    echo "🚀 Starting both backend and frontend..."
    echo ""
    echo "⚠️  You need to run these in separate terminals:"
    echo ""
    echo "Terminal 1 (Backend):"
    echo "  ./dev-railway.sh backend"
    echo ""
    echo "Terminal 2 (Frontend):"
    echo "  ./dev-railway.sh frontend"
    echo ""
    echo "Or use: make dev-railway (if implemented)"
    ;;
  *)
    echo "Usage: $0 [backend|frontend|both]"
    exit 1
    ;;
esac
