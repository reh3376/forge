#!/usr/bin/env bash
# Forge Platform — Init Container Entrypoint
#
# Runs once before application services start.  Waits for infrastructure
# to be ready, then runs schema initialization.
#
# Exit codes:
#   0 — success (all migrations applied)
#   1 — infrastructure never became ready
#   2 — migration/init failure

set -euo pipefail

MAX_WAIT=60  # seconds
INTERVAL=2

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[forge-init]${NC} $*"; }
warn() { echo -e "${YELLOW}[forge-init]${NC} $*"; }
fail() { echo -e "${RED}[forge-init]${NC} $*"; exit "${2:-1}"; }

# --- Wait for PostgreSQL ---
wait_for_pg() {
    local host="${1}" port="${2}" user="${3}" elapsed=0
    log "Waiting for PostgreSQL at ${host}:${port} ..."
    until pg_isready -h "${host}" -p "${port}" -U "${user}" -q 2>/dev/null; do
        elapsed=$((elapsed + INTERVAL))
        if [ "${elapsed}" -ge "${MAX_WAIT}" ]; then
            fail "PostgreSQL not ready after ${MAX_WAIT}s" 1
        fi
        sleep "${INTERVAL}"
    done
    log "PostgreSQL ready (${elapsed}s)"
}

# --- Wait for Neo4j ---
wait_for_neo4j() {
    local host="${1}" port="${2}" elapsed=0
    log "Waiting for Neo4j at ${host}:${port} ..."
    until curl -sf "http://${host}:7474" >/dev/null 2>&1; do
        elapsed=$((elapsed + INTERVAL))
        if [ "${elapsed}" -ge "${MAX_WAIT}" ]; then
            fail "Neo4j not ready after ${MAX_WAIT}s" 1
        fi
        sleep "${INTERVAL}"
    done
    log "Neo4j ready (${elapsed}s)"
}

# --- Wait for Redis ---
wait_for_redis() {
    local host="${1}" port="${2}" elapsed=0
    log "Waiting for Redis at ${host}:${port} ..."
    until python3 -c "
import redis; r = redis.Redis(host='${host}', port=${port}); r.ping()
" 2>/dev/null; do
        elapsed=$((elapsed + INTERVAL))
        if [ "${elapsed}" -ge "${MAX_WAIT}" ]; then
            fail "Redis not ready after ${MAX_WAIT}s" 1
        fi
        sleep "${INTERVAL}"
    done
    log "Redis ready (${elapsed}s)"
}

# --- Wait for Kafka ---
wait_for_kafka() {
    local bootstrap="${1}" elapsed=0
    log "Waiting for Kafka at ${bootstrap} ..."
    until python3 -c "
from confluent_kafka.admin import AdminClient
a = AdminClient({'bootstrap.servers': '${bootstrap}'})
a.list_topics(timeout=5)
" 2>/dev/null; do
        elapsed=$((elapsed + INTERVAL))
        if [ "${elapsed}" -ge "${MAX_WAIT}" ]; then
            fail "Kafka not ready after ${MAX_WAIT}s" 1
        fi
        sleep "${INTERVAL}"
    done
    log "Kafka ready (${elapsed}s)"
}

# --- Wait for RabbitMQ ---
wait_for_rabbitmq() {
    local host="${1}" port="${2}" elapsed=0
    log "Waiting for RabbitMQ at ${host}:${port} ..."
    until python3 -c "
import socket; s = socket.socket(); s.settimeout(2); s.connect(('${host}', ${port})); s.close()
" 2>/dev/null; do
        elapsed=$((elapsed + INTERVAL))
        if [ "${elapsed}" -ge "${MAX_WAIT}" ]; then
            fail "RabbitMQ not ready after ${MAX_WAIT}s" 1
        fi
        sleep "${INTERVAL}"
    done
    log "RabbitMQ ready (${elapsed}s)"
}

# =====================================================================
# Main
# =====================================================================

log "Forge init container starting ..."

# 1. Wait for all infrastructure
wait_for_pg "${POSTGRES_HOST:-postgres}" "${POSTGRES_PORT:-5432}" "${POSTGRES_USER:-forge}"
wait_for_pg "${TIMESCALE_HOST:-timescaledb}" "${TIMESCALE_PORT:-5432}" "${TIMESCALE_USER:-forge}"
wait_for_neo4j "${NEO4J_HOST:-neo4j}" "7474"
wait_for_redis "${REDIS_HOST:-redis}" "${REDIS_PORT:-6379}"
wait_for_kafka "${KAFKA_BOOTSTRAP_SERVERS:-kafka:9092}"
wait_for_rabbitmq "${RABBITMQ_HOST:-rabbitmq}" "5672"

log "All infrastructure ready."

# 2. Run Alembic migrations for PostgreSQL, TimescaleDB, and Neo4j
log "Running database migrations (Alembic + Neo4j Cypher) ..."
python3 -m forge.storage.migrations.run up --target all \
    || fail "Database migrations failed" 2
log "All database schemas ready."

# 5. Done
log "========================================="
log "  Forge init complete — all schemas ready"
log "========================================="
exit 0
