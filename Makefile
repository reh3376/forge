# WHK Recipe Configuration Monorepo Makefile
# Convenient aliases for npm workspace scripts

.PHONY: help dev dev-backend dev-frontend dev-shared build build-backend build-frontend build-shared
.PHONY: start start-backend start-frontend start-shared
.PHONY: test test-backend test-frontend test-shared test-e2e lint lint-fix format
.PHONY: db-dev db-init db-seed db-deploy db-migrate db-studio restart-db stop-db prisma-generate
.PHONY: docker-up docker-down docker-logs install clean clean-all docs-generate
.PHONY: status ports logs turbo-cache turbo-info turbo-dry
.PHONY: setup kill-all validate

## Development Commands
help:           ## Show this help message
	@echo "WHK Recipe Configuration Monorepo - Available Commands:"
	@echo "⚡ Powered by Turborepo for intelligent caching and parallel builds"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Applications:"
	@echo "  Backend:   http://localhost:3000 (API + GraphQL)"
	@echo "  Frontend:  http://localhost:3001 (Next.js MES UI)"
	@echo "  Shared:    Library package"
	@echo ""
	@echo "Quick Start: make setup && make db-dev && make db-init && make dev"
	@echo "Documentation: See README.md and docs/ for more details"

dev:            ## Start all applications in development mode with Turbo
	npx turbo dev

dev-backend:    ## Start only backend (NestJS) in development mode
	npx turbo dev --filter=whk-recipe-configuration

dev-frontend:   ## Start only frontend (Next.js) in development mode
	npx turbo dev --filter=mes-ui

dev-shared:     ## Start only shared library in development mode
	npx turbo dev --filter=shared

## Build Commands
build:          ## Build all applications for production with Turbo
	npx turbo build

build-backend:  ## Build only backend for production
	npx turbo build --filter=whk-recipe-configuration

build-frontend: ## Build only frontend for production
	npx turbo build --filter=mes-ui

build-shared:   ## Build only shared library for production
	npx turbo build --filter=shared

## Production Start Commands
start:          ## Start all applications in production mode with Turbo
	npx turbo start

start-backend:  ## Start only backend in production mode
	npx turbo start --filter=whk-recipe-configuration

start-frontend: ## Start only frontend in production mode
	npx turbo start --filter=mes-ui

start-shared:   ## Start only shared library in production mode
	npx turbo start --filter=shared

## Testing Commands
test:           ## Run tests for all applications with Turbo
	npx turbo test

test-backend:   ## Run backend unit tests
	npx turbo test --filter=whk-recipe-configuration

test-frontend:  ## Run frontend tests
	npx turbo test --filter=mes-ui

test-shared:    ## Run shared library tests
	npx turbo test --filter=shared

test-e2e:       ## Run frontend E2E tests
	npx turbo test:e2e --filter=mes-ui

## Code Quality Commands
lint:           ## Lint all applications with Turbo
	npx turbo lint

lint-fix:       ## Fix linting issues in all applications
	npx turbo lint:fix

format:         ## Format code with Prettier in all applications
	npx turbo format

## Database Commands
db-dev:         ## Start development databases (PostgreSQL, Redis, etc.)
	cd apps/whk-recipe-configuration && docker compose -f docker-compose.dev.yml up -d

db-init:        ## Initialize database with migrations and seed data
	npm run db:migrate && npm run db:seed

db-seed:        ## Run seed data
	npm run db:seed

db-migrate:     ## Run database migrations
	npm run db:migrate

db-deploy:      ## Deploy database changes to production
	npm run db:deploy

db-studio:      ## Open Prisma Studio
	npm run db:studio

restart-db:     ## Restart development databases
	cd apps/whk-recipe-configuration && docker compose -f docker-compose.dev.yml down && docker compose -f docker-compose.dev.yml up -d

stop-db:        ## Stop development databases
	cd apps/whk-recipe-configuration && docker compose -f docker-compose.dev.yml down

prisma-generate: ## Generate Prisma client
	npm run prisma:generate

## Docker Commands
docker-up:      ## Start development databases and services
	npm run docker:up

docker-down:    ## Stop development databases and services
	npm run docker:down

docker-logs:    ## Show Docker container logs
	npm run docker:logs

## Documentation Commands
docs-generate:  ## Generate documentation (ERD, stakeholder docs)
	npm run docs:generate

## Dependency Management
install:        ## Install dependencies for all workspaces
	npm install

clean:          ## Clean built files with Turbo
	npx turbo clean

clean-all:      ## Clean all node_modules and built files
	npm run clean && rm -rf node_modules && rm -rf .turbo

## Utility Commands
status:         ## Show running processes and port usage
	@echo "=== Docker Containers ==="
	@docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" || echo "Docker not running"
	@echo ""
	@echo "=== Port Usage (3000, 3001, 5432, 6379, 5672) ==="
	@lsof -i :3000 -i :3001 -i :5432 -i :6379 -i :5672 2>/dev/null | head -20 || echo "No processes found on expected ports"

ports:          ## Check which processes are using our ports
	@lsof -i :3000 -i :3001 -i :5432 -i :6379 -i :5672 2>/dev/null || echo "No processes found on ports 3000, 3001, 5432, 6379, 5672"

logs:           ## Show recent logs from applications
	@echo "Use 'make dev' to start applications with visible logs"
	@echo "Or check individual app logs:"
	@echo "  Backend:  turbo dev --filter=whk-recipe-configuration"
	@echo "  Frontend: turbo dev --filter=mes-ui"
	@echo "  Shared:   turbo dev --filter=shared"

## Turborepo Commands
turbo-cache:    ## Clear Turborepo cache
	@echo "🗑️  Clearing Turborepo cache..."
	@rm -rf .turbo
	@echo "✅ Turborepo cache cleared"

turbo-info:     ## Show Turborepo information and cache stats
	@echo "📊 Turborepo Information:"
	@echo "  Version: $$(npx turbo --version 2>/dev/null || echo 'Not installed')"
	@echo "  Cache location: .turbo/"
	@echo "  Cache size: $$(du -sh .turbo 2>/dev/null | cut -f1 || echo '0B')"
	@echo ""
	@echo "🔍 Useful Turborepo commands:"
	@echo "  npx turbo build --dry-run    # Preview what would build"
	@echo "  npx turbo build --force      # Force rebuild ignoring cache"
	@echo "  npx turbo build --summarize  # Show detailed build summary"
	@echo "  npx turbo dev --parallel     # Run dev servers in parallel"
	@echo ""
	@echo "💡 Tip: All 'make' commands now use Turborepo automatically!"

turbo-dry:      ## Preview build without executing (dry run)
	npx turbo build --dry-run

## Setup and Validation
setup:          ## Complete setup for new developers
	@echo "🚀 Setting up WHK Recipe Configuration Monorepo..."
	npm install --include=dev
	npm run prisma:generate
	@echo "✅ Dependencies (including dev) installed for all workspaces and Prisma client generated"
	@echo ""
	@echo "Next steps:"
	@echo "  1. make db-dev        # Start databases"
	@echo "  2. make db-init       # Initialize database"
	@echo "  3. make dev           # Start all applications"
	@echo ""
	@echo "Applications will be available at:"
	@echo "  Backend:  http://localhost:3000"
	@echo "  Frontend: http://localhost:3001"

validate:       ## Validate repository setup and configuration
	npm run validate

## Emergency Commands
kill-all:       ## Kill all node processes (use with caution)
	@echo "⚠️  Killing all node processes..."
	@pkill -f "node" 2>/dev/null || echo "No node processes found"

## Legacy npm script compatibility (for backward compatibility)
dev-legacy:     ## Run development with legacy npm scripts
	npm run dev

build-legacy:   ## Build with legacy npm scripts
	npm run build

test-legacy:    ## Test with legacy npm scripts
	npm run test