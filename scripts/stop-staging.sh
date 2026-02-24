#!/bin/bash

################################################################################
# WhiskeyHouse MES - Staging Environment Shutdown Script
#
# This script stops the staging environment gracefully:
# 1. Stops PM2 processes (backend, ngrok, health monitor)
# 2. Optionally stops Docker services
# 3. Cleans up temporary files
#
# Usage: ./stop-staging.sh [options]
#   Options:
#     --keep-docker    Keep Docker services running
#     --full           Stop everything including Docker
################################################################################

set -e

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly BACKEND_DIR="$PROJECT_ROOT/apps/whk-recipe-configuration"

# Options
KEEP_DOCKER=true

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
        --keep-docker)
            KEEP_DOCKER=true
            ;;
        --full)
            KEEP_DOCKER=false
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --keep-docker    Keep Docker services running (default)"
            echo "  --full           Stop everything including Docker"
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
# Stop PM2 processes
################################################################################

stop_pm2_processes() {
    print_header "Stopping PM2 Processes"

    if ! command -v pm2 &> /dev/null; then
        print_warning "PM2 not found, nothing to stop"
        return 0
    fi

    # Stop staging processes
    print_info "Stopping backend, ngrok, and health monitor..."

    pm2 delete whk-backend-staging 2>/dev/null && print_success "Backend stopped" || print_info "Backend was not running"
    pm2 delete ngrok-tunnel 2>/dev/null && print_success "ngrok stopped" || print_info "ngrok was not running"
    pm2 delete ngrok-health-monitor 2>/dev/null && print_success "Health monitor stopped" || print_info "Health monitor was not running"

    # Save PM2 process list
    pm2 save --force 2>/dev/null || true

    print_success "PM2 processes stopped"
}

################################################################################
# Stop Docker services
################################################################################

stop_docker_services() {
    if [ "$KEEP_DOCKER" = true ]; then
        print_info "Keeping Docker services running (use --full to stop)"
        return 0
    fi

    print_header "Stopping Docker Services"

    cd "$PROJECT_ROOT"

    print_info "Stopping PostgreSQL, Redis, and RabbitMQ..."

    # Stop containers using make command
    docker-compose -f apps/whk-recipe-configuration/docker-compose.dev.yml down 2>/dev/null || true

    print_success "Docker services stopped"
}

################################################################################
# Cleanup
################################################################################

cleanup() {
    print_header "Cleaning Up"

    # Remove temporary ngrok URL file
    if [ -f "$BACKEND_DIR/.ngrok-url" ]; then
        rm "$BACKEND_DIR/.ngrok-url"
        print_success "Removed temporary ngrok URL file"
    fi

    # Rotate logs if they're large
    local log_dir="$BACKEND_DIR/logs"
    if [ -d "$log_dir" ]; then
        local log_size=$(du -sm "$log_dir" 2>/dev/null | cut -f1)
        if [ "$log_size" -gt 100 ]; then
            print_warning "Logs directory is ${log_size}MB - consider clearing: rm -rf $log_dir/*.log"
        fi
    fi

    print_success "Cleanup complete"
}

################################################################################
# Display summary
################################################################################

display_summary() {
    print_header "Staging Environment Stopped"

    echo -e "${BOLD}Status:${NC}"
    if command -v pm2 &> /dev/null; then
        echo -e "  PM2 processes: ${GREEN}Stopped${NC}"
    fi

    if [ "$KEEP_DOCKER" = false ]; then
        echo -e "  Docker services: ${GREEN}Stopped${NC}"
    else
        echo -e "  Docker services: ${YELLOW}Still running${NC}"
        echo -e "    ${BLUE}To stop Docker: $0 --full${NC}"
    fi

    echo ""
    echo -e "${BOLD}Useful Commands:${NC}"
    echo -e "  Restart:       ${BLUE}$SCRIPT_DIR/start-staging.sh${NC}"
    echo -e "  Check PM2:     ${BLUE}pm2 status${NC}"
    echo -e "  Check Docker:  ${BLUE}docker ps${NC}"

    echo ""
    print_success "Shutdown complete!"
}

################################################################################
# Main execution
################################################################################

main() {
    print_header "WhiskeyHouse MES - Stopping Staging Environment"

    stop_pm2_processes
    stop_docker_services
    cleanup
    display_summary
}

# Run main function
main
