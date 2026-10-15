#!/bin/bash

################################################################################
# WhiskeyHouse MES - Staging Environment Startup Script
#
# This script starts the complete staging environment:
# 1. Docker services (PostgreSQL, Redis, RabbitMQ)
# 2. Backend build (if needed)
# 3. Database migrations
# 4. PM2 processes (backend + ngrok + health monitor)
# 5. Displays connection info
#
# Usage: ./start-staging.sh [options]
#   Options:
#     --skip-build     Skip backend build step
#     --skip-migrate   Skip database migrations
#     --skip-docker    Skip Docker services (assumes already running)
################################################################################

set -e

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly BACKEND_DIR="$PROJECT_ROOT/backend"
readonly FRONTEND_DIR="$PROJECT_ROOT/frontend"

# Options
SKIP_BUILD=false
SKIP_MIGRATE=false
SKIP_DOCKER=false

# Colors
readonly GREEN='\033[0;32m'
readonly BLUE='\033[0;34m'
readonly YELLOW='\033[1;33m'
readonly RED='\033[0;31m'
readonly BOLD='\033[1m'
readonly NC='\033[0m' # No Color

################################################################################
# Parse arguments
################################################################################

for arg in "$@"; do
    case $arg in
        --skip-build)
            SKIP_BUILD=true
            ;;
        --skip-migrate)
            SKIP_MIGRATE=true
            ;;
        --skip-docker)
            SKIP_DOCKER=true
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --skip-build     Skip backend build step"
            echo "  --skip-migrate   Skip database migrations"
            echo "  --skip-docker    Skip Docker services"
            exit 0
            ;;
        *)
            echo "Unknown option: $arg"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

################################################################################
# Helper functions
################################################################################

print_header() {
    echo ""
    echo -e "${BOLD}${BLUE}========================================${NC}"
    echo -e "${BOLD}${BLUE}$1${NC}"
    echo -e "${BOLD}${BLUE}========================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        print_error "$1 is not installed"
        return 1
    fi
    return 0
}

wait_for_service() {
    local host="$1"
    local port="$2"
    local service_name="$3"
    local max_attempts=30
    local attempt=1

    print_info "Waiting for $service_name to be ready..."

    while [ $attempt -le $max_attempts ]; do
        if nc -z "$host" "$port" 2>/dev/null; then
            print_success "$service_name is ready"
            return 0
        fi
        echo -n "."
        sleep 1
        ((attempt++))
    done

    print_error "$service_name failed to start"
    return 1
}

################################################################################
# Preflight checks
################################################################################

preflight_checks() {
    print_header "Preflight Checks"

    local all_good=true

    # Check required commands
    if ! check_command "docker"; then all_good=false; fi
    if ! check_command "npm"; then all_good=false; fi
    if ! check_command "pm2"; then
        print_warning "PM2 not found. Installing..."
        npm install -g pm2 || { print_error "Failed to install PM2"; all_good=false; }
    fi
    if ! check_command "ngrok"; then
        print_error "ngrok is not installed. Visit: https://ngrok.com/download"
        all_good=false
    fi

    # Check ngrok auth
    if ! ngrok config check &>/dev/null; then
        print_warning "ngrok not configured. Run: ngrok config add-authtoken <token>"
        print_info "Get your token from: https://dashboard.ngrok.com/get-started/your-authtoken"
    fi

    if [ "$all_good" = false ]; then
        print_error "Preflight checks failed. Please install missing dependencies."
        exit 1
    fi

    print_success "All preflight checks passed"
}

################################################################################
# Start Docker services
################################################################################

start_docker_services() {
    if [ "$SKIP_DOCKER" = true ]; then
        print_info "Skipping Docker services (already running)"
        return 0
    fi

    print_header "Starting Docker Services"

    cd "$PROJECT_ROOT"

    # Start services
    print_info "Starting PostgreSQL, Redis, and RabbitMQ..."
    make db-dev || {
        print_error "Failed to start Docker services"
        exit 1
    }

    # Wait for services
    wait_for_service "localhost" "5432" "PostgreSQL"
    wait_for_service "localhost" "6379" "Redis"
    wait_for_service "localhost" "5672" "RabbitMQ"

    print_success "All Docker services are running"
}

################################################################################
# Build backend
################################################################################

build_backend() {
    if [ "$SKIP_BUILD" = true ]; then
        print_info "Skipping backend build"
        return 0
    fi

    print_header "Building Backend"

    cd "$BACKEND_DIR"

    # Generate Prisma client
    print_info "Generating Prisma client..."
    npm run prisma:generate || {
        print_error "Failed to generate Prisma client"
        exit 1
    }

    # Build
    print_info "Building NestJS application..."
    npm run build || {
        print_error "Failed to build backend"
        exit 1
    }

    print_success "Backend built successfully"
}

################################################################################
# Run database migrations
################################################################################

run_migrations() {
    if [ "$SKIP_MIGRATE" = true ]; then
        print_info "Skipping database migrations"
        return 0
    fi

    print_header "Running Database Migrations"

    cd "$BACKEND_DIR"

    print_info "Running migrations..."
    npm run db:migrate || {
        print_warning "Migrations may have already been applied"
    }

    print_success "Database is up to date"
}

################################################################################
# Start PM2 processes
################################################################################

start_pm2_processes() {
    print_header "Starting PM2 Processes"

    cd "$BACKEND_DIR"

    # Create logs directory
    mkdir -p logs

    # Stop any existing staging processes
    pm2 delete whk-backend-staging 2>/dev/null || true
    pm2 delete ngrok-tunnel 2>/dev/null || true
    pm2 delete ngrok-health-monitor 2>/dev/null || true

    # Start processes
    print_info "Starting backend, ngrok, and health monitor..."
    pm2 start ecosystem.config.js --only whk-backend-staging,ngrok-tunnel,ngrok-health-monitor || {
        print_error "Failed to start PM2 processes"
        exit 1
    }

    # Wait for services to initialize
    print_info "Waiting for services to initialize..."
    sleep 5

    print_success "PM2 processes started"
}

################################################################################
# Display connection info
################################################################################

display_info() {
    print_header "Staging Environment Ready!"

    # Get ngrok URL
    sleep 3  # Give ngrok time to establish tunnel
    local ngrok_url=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*"' | head -1 | sed 's/"public_url":"//;s/"//' || echo "")

    echo -e "${BOLD}Backend:${NC}"
    echo -e "  Local:    ${GREEN}http://localhost:3000${NC}"
    echo -e "  GraphQL:  ${GREEN}http://localhost:3000/graphql${NC}"
    if [ -n "$ngrok_url" ]; then
        echo -e "  ngrok:    ${GREEN}${ngrok_url}${NC}"
        echo -e "  Public GraphQL: ${GREEN}${ngrok_url}/graphql${NC}"
    else
        echo -e "  ${YELLOW}ngrok URL not available yet (check logs)${NC}"
    fi

    echo ""
    echo -e "${BOLD}Frontend (Vercel):${NC}"
    echo -e "  Set NEXT_PUBLIC_GRAPHQL_URL to: ${GREEN}${ngrok_url}/graphql${NC}"

    echo ""
    echo -e "${BOLD}Monitoring:${NC}"
    echo -e "  PM2 Dashboard:  ${BLUE}pm2 monit${NC}"
    echo -e "  PM2 Logs:       ${BLUE}pm2 logs${NC}"
    echo -e "  ngrok Inspector: ${BLUE}http://localhost:4040${NC}"

    echo ""
    echo -e "${BOLD}Useful Commands:${NC}"
    echo -e "  View status:  ${BLUE}pm2 status${NC}"
    echo -e "  View logs:    ${BLUE}pm2 logs${NC}"
    echo -e "  Restart:      ${BLUE}pm2 restart all${NC}"
    echo -e "  Stop:         ${BLUE}$SCRIPT_DIR/stop-staging.sh${NC}"

    echo ""
    print_success "Staging environment is running!"

    # Save ngrok URL to file for other scripts
    if [ -n "$ngrok_url" ]; then
        echo "$ngrok_url" > "$BACKEND_DIR/.ngrok-url"
    fi
}

################################################################################
# Main execution
################################################################################

main() {
    print_header "WhiskeyHouse MES - Starting Staging Environment"

    preflight_checks
    start_docker_services
    build_backend
    run_migrations
    start_pm2_processes
    display_info
}

# Run main function
main
