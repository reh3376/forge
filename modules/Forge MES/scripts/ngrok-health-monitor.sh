#!/bin/bash

################################################################################
# ngrok Health Monitor Script
#
# Monitors ngrok tunnel health and automatically restarts on failure.
# Features:
# - Polls ngrok API to check tunnel status
# - Pings backend through ngrok URL for end-to-end verification
# - Auto-restarts ngrok on detected failures
# - Logs all status changes
# - Exponential backoff on repeated failures
#
# Usage: Run via PM2 (configured in ecosystem.config.js)
#   or manually: ./ngrok-health-monitor.sh
################################################################################

set -e

# Configuration
readonly NGROK_API_URL="http://localhost:4040/api/tunnels"
readonly CHECK_INTERVAL=30  # seconds between health checks
readonly TIMEOUT=10         # curl timeout in seconds
readonly LOG_FILE="backend/logs/ngrok-health.log"
readonly MAX_FAILURES=3     # failures before restart
readonly BACKOFF_MAX=300    # max backoff time in seconds

# State variables
failure_count=0
backoff_time=30
last_tunnel_url=""

# Colors for terminal output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m' # No Color

################################################################################
# Logging functions
################################################################################

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] ${message}" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $*"
    log "INFO" "$*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
    log "WARN" "$*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
    log "ERROR" "$*"
}

################################################################################
# ngrok API functions
################################################################################

get_tunnel_url() {
    local response
    response=$(curl -s --max-time "$TIMEOUT" "$NGROK_API_URL" 2>/dev/null || echo "")

    if [ -z "$response" ]; then
        return 1
    fi

    # Extract public URL using grep and sed (avoiding jq dependency)
    # Looking for "public_url":"https://..."
    echo "$response" | grep -o '"public_url":"https://[^"]*"' | head -1 | sed 's/"public_url":"//;s/"//'
}

check_tunnel_status() {
    local tunnel_url
    tunnel_url=$(get_tunnel_url)

    if [ -z "$tunnel_url" ]; then
        log_error "Failed to retrieve tunnel URL from ngrok API"
        return 1
    fi

    # Log if tunnel URL changed
    if [ "$tunnel_url" != "$last_tunnel_url" ]; then
        if [ -n "$last_tunnel_url" ]; then
            log_warn "Tunnel URL changed: $last_tunnel_url -> $tunnel_url"
        else
            log_info "Tunnel established: $tunnel_url"
        fi
        last_tunnel_url="$tunnel_url"
    fi

    echo "$tunnel_url"
    return 0
}

check_backend_health() {
    local tunnel_url="$1"
    local health_endpoint="${tunnel_url}/health"

    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$health_endpoint" 2>/dev/null || echo "000")

    if [ "$http_code" = "200" ] || [ "$http_code" = "404" ]; then
        # 200 = health endpoint exists and is healthy
        # 404 = backend is responding but no health endpoint (still good)
        return 0
    else
        log_error "Backend health check failed (HTTP $http_code) at $health_endpoint"
        return 1
    fi
}

################################################################################
# Recovery functions
################################################################################

restart_ngrok() {
    log_warn "Attempting to restart ngrok tunnel..."

    # Try to restart via PM2
    if command -v pm2 &> /dev/null; then
        log_info "Restarting ngrok via PM2..."
        pm2 restart ngrok-tunnel 2>&1 | tee -a "$LOG_FILE"

        # Wait for tunnel to establish
        sleep 10

        if check_tunnel_status > /dev/null 2>&1; then
            log_info "ngrok successfully restarted"
            failure_count=0
            backoff_time=30
            return 0
        else
            log_error "ngrok restart via PM2 failed"
            return 1
        fi
    else
        log_error "PM2 not found, cannot restart ngrok automatically"
        return 1
    fi
}

calculate_backoff() {
    # Exponential backoff: 30s, 60s, 120s, 240s, up to MAX
    backoff_time=$((backoff_time * 2))
    if [ $backoff_time -gt $BACKOFF_MAX ]; then
        backoff_time=$BACKOFF_MAX
    fi
    echo $backoff_time
}

################################################################################
# Main monitoring loop
################################################################################

main() {
    log_info "Starting ngrok health monitor (PID: $$)"
    log_info "Check interval: ${CHECK_INTERVAL}s, Timeout: ${TIMEOUT}s"

    # Create log directory if it doesn't exist
    mkdir -p "$(dirname "$LOG_FILE")"

    # Ensure we're in the right directory
    cd "$(dirname "$0")/.." || exit 1

    # Main loop
    while true; do
        # Check tunnel status
        tunnel_url=$(check_tunnel_status)
        tunnel_check=$?

        if [ $tunnel_check -ne 0 ]; then
            ((failure_count++))
            log_error "Tunnel check failed (failure $failure_count/$MAX_FAILURES)"

            if [ $failure_count -ge $MAX_FAILURES ]; then
                restart_ngrok
                if [ $? -eq 0 ]; then
                    failure_count=0
                else
                    backoff=$(calculate_backoff)
                    log_warn "Restart failed, backing off for ${backoff}s"
                    sleep "$backoff"
                    continue
                fi
            fi
        else
            # Tunnel is up, check backend health
            if check_backend_health "$tunnel_url"; then
                if [ $failure_count -gt 0 ]; then
                    log_info "Health check recovered"
                fi
                failure_count=0
                backoff_time=30
            else
                ((failure_count++))
                log_error "Backend health check failed (failure $failure_count/$MAX_FAILURES)"

                if [ $failure_count -ge $MAX_FAILURES ]; then
                    log_error "Max failures reached, restarting ngrok..."
                    restart_ngrok
                fi
            fi
        fi

        # Wait before next check
        sleep "$CHECK_INTERVAL"
    done
}

# Trap signals for graceful shutdown
trap 'log_info "Health monitor shutting down..."; exit 0' SIGTERM SIGINT

# Run main function
main
