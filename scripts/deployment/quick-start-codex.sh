#!/bin/bash

# =============================================================================
# Quick Start Script for OpenAI Codex Development Environment
# =============================================================================

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🚀 Quick Start for WHK Recipe Configuration in Codex${NC}"
echo "=================================================="

# Check if full setup has been run
if [ ! -f ".setup-complete" ]; then
    echo -e "${YELLOW}⚠️  Full setup not detected. Running complete setup first...${NC}"
    chmod +x scripts/deployment/setup-codex.sh
    ./scripts/deployment/setup-codex.sh
    touch .setup-complete
fi

echo -e "${BLUE}📦 Starting services with Docker Compose...${NC}"

# Use Codex-optimized compose file
if [ -f "docker-compose.codex.yml" ]; then
    docker compose -f docker-compose.codex.yml up -d postgres redis rabbitmq mosquitto
    echo -e "${GREEN}✅ Infrastructure services started${NC}"
    
    # Wait for services to be ready
    echo -e "${BLUE}⏳ Waiting for services to be ready...${NC}"
    sleep 15
    
    # Start application services
    echo -e "${BLUE}🔧 Starting application services...${NC}"
    docker compose -f docker-compose.codex.yml up -d backend frontend admin
    
else
    echo -e "${YELLOW}⚠️  Using fallback docker-compose setup${NC}"
    docker compose up -d
fi

echo -e "${BLUE}🗄️  Setting up database...${NC}"
cd backend

# Generate Prisma client
npx prisma generate

# Deploy database schema
npx prisma db push --accept-data-loss

# Run migrations if available
if npm run db:prod:deploy 2>/dev/null; then
    echo -e "${GREEN}✅ Database migrations deployed${NC}"
else
    npx prisma migrate deploy 2>/dev/null || echo -e "${YELLOW}⚠️  No migrations to deploy${NC}"
fi

cd ../..

echo -e "${GREEN}🎉 Setup complete! Your services are running:${NC}"
echo ""
echo -e "${BLUE}📱 Frontend (Next.js):${NC}     http://localhost:3001"
echo -e "${BLUE}🔧 Backend API (NestJS):${NC}   http://localhost:3000"
echo -e "${BLUE}⚙️  Admin Panel (React):${NC}   http://localhost:3002"
echo -e "${BLUE}🗄️  Database Admin:${NC}        http://localhost:5050"
echo -e "${BLUE}📊 RabbitMQ Management:${NC}    http://localhost:15672"
echo ""
echo -e "${BLUE}🔍 Useful commands:${NC}"
echo "  docker compose -f docker-compose.codex.yml logs -f [service]"
echo "  docker compose -f docker-compose.codex.yml ps"
echo "  docker compose -f docker-compose.codex.yml down"
echo ""
echo -e "${GREEN}Happy coding! 🎯${NC}" 