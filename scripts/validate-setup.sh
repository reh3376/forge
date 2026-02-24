#!/bin/bash

# =============================================================================
# Validation Script for OpenAI Codex Environment Setup
# =============================================================================

# Remove set -e to prevent early exit on failures
# set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
PASSED=0
FAILED=0

# Test function
test_check() {
    local description="$1"
    local command="$2"
    local expected_exit_code="${3:-0}"
    
    echo -n "Testing: $description... "
    
    if eval "$command" >/dev/null 2>&1; then
        local exit_code=$?
        if [ $exit_code -eq $expected_exit_code ]; then
            echo -e "${GREEN}✅ PASS${NC}"
            ((PASSED++))
        else
            echo -e "${RED}❌ FAIL${NC}"
            ((FAILED++))
        fi
    else
        echo -e "${RED}❌ FAIL${NC}"
        ((FAILED++))
    fi
}

echo -e "${BLUE}🔍 Validating OpenAI Codex Environment Setup${NC}"
echo "=============================================="

# System Dependencies
echo -e "\n${BLUE}📦 System Dependencies${NC}"
test_check "Node.js installed" "command -v node"
test_check "npm installed" "command -v npm"
test_check "Docker installed" "command -v docker"
test_check "Docker Compose installed" "command -v docker compose"
test_check "Git installed" "command -v git"
test_check "curl installed" "command -v curl"

# Show Node.js version
if command -v node >/dev/null 2>&1; then
    echo -e "Node.js version: $(node --version) ${GREEN}✅${NC}"
fi

# Project Structure
echo -e "\n${BLUE}📁 Project Structure${NC}"
test_check "Root package.json exists" "test -f package.json"
test_check "Backend directory exists" "test -d apps/whk-recipe-configuration"
test_check "Frontend directory exists" "test -d apps/mes-ui"
test_check "Prisma schema exists" "test -f apps/whk-recipe-configuration/prisma/schema.prisma"

# Environment Configuration
echo -e "\n${BLUE}⚙️ Environment Configuration${NC}"
test_check ".env file exists" "test -f .env"
test_check "Docker Compose Codex file exists" "test -f docker-compose.codex.yml"
test_check "Setup script exists" "test -f scripts/deployment/setup-codex.sh"
test_check "Quick start script exists" "test -f scripts/deployment/quick-start-codex.sh"

# Docker Services
echo -e "\n${BLUE}🐳 Docker Services${NC}"
test_check "Docker daemon running" "docker info"

echo "Checking individual services..."
if docker ps --format "table {{.Names}}" | grep -q "whk-postgres"; then
    echo -e "PostgreSQL container: ${GREEN}✅ PASS${NC}"
    ((PASSED++))
else
    echo -e "PostgreSQL container: ${RED}❌ FAIL${NC}"
    ((FAILED++))
fi

if docker ps --format "table {{.Names}}" | grep -q "whk-redis"; then
    echo -e "Redis container: ${GREEN}✅ PASS${NC}"
    ((PASSED++))
else
    echo -e "Redis container: ${RED}❌ FAIL${NC}"
    ((FAILED++))
fi

if docker ps --format "table {{.Names}}" | grep -q "whk-rabbitmq"; then
    echo -e "RabbitMQ container: ${GREEN}✅ PASS${NC}"
    ((PASSED++))
else
    echo -e "RabbitMQ container: ${RED}❌ FAIL${NC}"
    ((FAILED++))
fi

# Service Health Checks
echo -e "\n${BLUE}🏥 Service Health Checks${NC}"
test_check "Backend API health" "curl -f http://localhost:3000/api/_health/live"
test_check "Frontend accessibility" "curl -f http://localhost:4000"
test_check "PgAdmin accessibility" "curl -f http://localhost:5051"
test_check "RabbitMQ Management" "curl -f http://localhost:15673"

# Database Connectivity
echo -e "\n${BLUE}🗄️ Database Connectivity${NC}"
test_check "Prisma client generated" "test -d apps/whk-recipe-configuration/node_modules/.prisma"
test_check "Database connection" "cd apps/whk-recipe-configuration && npx prisma db execute --stdin <<< 'SELECT 1;'"

# Dependencies
echo -e "\n${BLUE}📚 Dependencies${NC}"
test_check "Root dependencies installed" "test -d node_modules"
test_check "Backend dependencies installed" "test -d apps/whk-recipe-configuration/node_modules"
test_check "Frontend dependencies installed" "test -d apps/mes-ui/node_modules"

# Development Tools
echo -e "\n${BLUE}🛠️ Development Tools${NC}"
test_check "TypeScript available" "command -v tsc"
test_check "NestJS CLI available" "command -v nest"

# Summary
echo -e "\n${BLUE}📊 Validation Summary${NC}"
echo "===================="
echo -e "Tests passed: ${GREEN}$PASSED${NC}"
echo -e "Tests failed: ${RED}$FAILED${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "\n${GREEN}🎉 All tests passed! Your Codex environment is ready.${NC}"
    exit 0
else
    echo -e "\n${RED}❌ Some tests failed. Please check the issues above.${NC}"
    echo -e "\n${YELLOW}💡 Common solutions:${NC}"
    echo "  - Run ./scripts/deployment/setup-codex.sh for full setup"
    echo "  - Run ./scripts/deployment/quick-start-codex.sh to start services"
    echo "  - Check Docker daemon is running"
    echo "  - Ensure all required ports are available"
    exit 1
fi 