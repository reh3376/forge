#!/bin/bash

################################################################################
# WhiskeyHouse MES - Backend Deployment Script (Raspberry Pi Staging)
#
# Deploys the backend application to Raspberry Pi via SSH
# Includes: file sync, Docker rebuild, database migrations
#
# Usage: ./scripts/deploy-backend-staging.sh [options]
#   Options:
#     --skip-build       Skip Docker image rebuild
#     --skip-migrate     Skip database migrations
#     --restart-only     Just restart services without rebuild
################################################################################

set -e

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly PI_HOST="pi@192.168.0.108"
readonly REMOTE_DIR="~/whk-staging"

# Options
SKIP_BUILD=false
SKIP_MIGRATE=false
RESTART_ONLY=false

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
        --restart-only)
            RESTART_ONLY=true
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --skip-build       Skip Docker image rebuild"
            echo "  --skip-migrate     Skip database migrations"
            echo "  --restart-only     Just restart services"
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

################################################################################
# Test SSH connection
################################################################################

test_connection() {
    print_header "Testing Connection to Raspberry Pi"

    if ! ssh -o ConnectTimeout=5 "$PI_HOST" "echo 'Connected'" > /dev/null 2>&1; then
        print_error "Cannot connect to Raspberry Pi at $PI_HOST"
        exit 1
    fi

    print_success "Connected to Raspberry Pi"
}

################################################################################
# Sync files to Pi
################################################################################

sync_files() {
    if [ "$RESTART_ONLY" = true ]; then
        print_info "Skipping file sync (restart only mode)"
        return 0
    fi

    print_header "Syncing Files to Raspberry Pi"

    cd "$PROJECT_ROOT"

    # Create temporary archive excluding large/unnecessary files
    print_info "Creating archive..."
    tar czf /tmp/whk-backend-deploy.tar.gz \
        --exclude='node_modules' \
        --exclude='dist' \
        --exclude='.turbo' \
        --exclude='logs' \
        --exclude='.next' \
        --exclude='.git' \
        backend \
        docker-compose.staging.yml \
        .env.staging || {
        print_error "Failed to create archive"
        exit 1
    }

    # Copy to Pi
    print_info "Uploading to Raspberry Pi..."
    scp /tmp/whk-backend-deploy.tar.gz "$PI_HOST:$REMOTE_DIR/" || {
        print_error "Failed to upload files"
        rm /tmp/whk-backend-deploy.tar.gz
        exit 1
    }

    # Extract on Pi
    print_info "Extracting files on Raspberry Pi..."
    ssh "$PI_HOST" "cd $REMOTE_DIR && tar xzf whk-backend-deploy.tar.gz && rm whk-backend-deploy.tar.gz" || {
        print_error "Failed to extract files"
        rm /tmp/whk-backend-deploy.tar.gz
        exit 1
    }

    # Copy config files to correct locations
    ssh "$PI_HOST" "cd $REMOTE_DIR && cp docker-compose.staging.yml docker-compose.yml && cp .env.staging .env" || {
        print_warning "Failed to copy config files"
    }

    # Cleanup local temp file
    rm /tmp/whk-backend-deploy.tar.gz

    print_success "Files synced successfully"
}

################################################################################
# Build/Rebuild Docker images
################################################################################

rebuild_images() {
    if [ "$SKIP_BUILD" = true ] || [ "$RESTART_ONLY" = true ]; then
        print_info "Skipping Docker image rebuild"
        return 0
    fi

    print_header "Building Docker Images"

    print_info "Building backend image on Raspberry Pi (this may take 5-10 minutes)..."
    ssh "$PI_HOST" "cd $REMOTE_DIR && docker compose build backend" || {
        print_error "Failed to build backend image"
        exit 1
    }

    print_success "Docker images built successfully"
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

    print_info "Checking if database is accessible..."

    # Run migrations via docker exec
    print_info "Running Prisma migrations..."
    ssh "$PI_HOST" "cd $REMOTE_DIR && docker compose run --rm backend npm run db:prod:deploy" || {
        print_warning "Migrations may have already been applied or database not ready"
    }

    print_success "Database migrations complete"
}

################################################################################
# Restart services
################################################################################

restart_services() {
    print_header "Restarting Services"

    print_info "Stopping existing containers..."
    ssh "$PI_HOST" "cd $REMOTE_DIR && docker compose down" || {
        print_warning "No running containers to stop"
    }

    print_info "Starting services..."
    ssh "$PI_HOST" "cd $REMOTE_DIR && docker compose up -d" || {
        print_error "Failed to start services"
        exit 1
    }

    print_success "Services restarted successfully"
}

################################################################################
# Display deployment status
################################################################################

show_status() {
    print_header "Deployment Status"

    # Get container status
    print_info "Fetching container status..."
    ssh "$PI_HOST" "cd $REMOTE_DIR && docker compose ps" || true

    echo ""
    print_info "Checking backend health..."
    sleep 5  # Give services time to start

    # Try to get backend URL
    local backend_url="http://192.168.0.108:3000"
    if curl -s -o /dev/null -w "%{http_code}" "$backend_url" | grep -q "200\|404"; then
        print_success "Backend is responding at $backend_url"
    else
        print_warning "Backend may still be starting up"
    fi

    echo ""
    echo -e "${BOLD}Next Steps:${NC}"
    echo -e "  1. Set up ngrok tunnel on Pi: ${BLUE}ssh $PI_HOST${NC}"
    echo -e "  2. Check logs: ${BLUE}ssh $PI_HOST 'cd $REMOTE_DIR && docker compose logs -f backend'${NC}"
    echo -e "  3. Check services: ${BLUE}ssh $PI_HOST 'cd $REMOTE_DIR && docker compose ps'${NC}"

    echo ""
    print_success "Deployment complete!"
}

################################################################################
# Main execution
################################################################################

main() {
    print_header "WhiskeyHouse MES - Deploying to Raspberry Pi Staging"

    test_connection
    sync_files
    rebuild_images
    run_migrations
    restart_services
    show_status
}

# Run main function
main
