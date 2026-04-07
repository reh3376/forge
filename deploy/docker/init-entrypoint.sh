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

log "All infrastructure ready."

# 2. PostgreSQL schema initialization
log "Initializing PostgreSQL schema ..."
PGPASSWORD="${POSTGRES_PASSWORD:-changeme}" psql \
    -h "${POSTGRES_HOST:-postgres}" \
    -p "${POSTGRES_PORT:-5432}" \
    -U "${POSTGRES_USER:-forge}" \
    -d "${POSTGRES_DB:-forge}" \
    -c "
CREATE TABLE IF NOT EXISTS forge_adapters (
    adapter_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '0.1.0',
    type TEXT NOT NULL DEFAULT 'INGESTION',
    tier TEXT NOT NULL DEFAULT 'MES_MOM',
    protocol TEXT NOT NULL DEFAULT 'grpc',
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_health_at TIMESTAMPTZ,
    state TEXT NOT NULL DEFAULT 'REGISTERED',
    manifest JSONB
);

CREATE TABLE IF NOT EXISTS forge_records_log (
    id BIGSERIAL PRIMARY KEY,
    adapter_id TEXT NOT NULL REFERENCES forge_adapters(adapter_id),
    batch_size INT NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forge_governance_reports (
    report_id TEXT PRIMARY KEY,
    framework TEXT NOT NULL,
    target TEXT NOT NULL,
    passed BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    report JSONB
);
" || fail "PostgreSQL schema init failed" 2
log "PostgreSQL schema ready."

# 3. TimescaleDB hypertable initialization
log "Initializing TimescaleDB ..."
PGPASSWORD="${TIMESCALE_PASSWORD:-changeme}" psql \
    -h "${TIMESCALE_HOST:-timescaledb}" \
    -p "${TIMESCALE_PORT:-5432}" \
    -U "${TIMESCALE_USER:-forge}" \
    -d "${TIMESCALE_DB:-forge_ts}" \
    -c "
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS contextual_records (
    time TIMESTAMPTZ NOT NULL,
    adapter_id TEXT NOT NULL,
    source_entity TEXT,
    source_field TEXT,
    value_float DOUBLE PRECISION,
    value_text TEXT,
    quality_code INT DEFAULT 192,
    context JSONB DEFAULT '{}'::jsonb
);

SELECT create_hypertable('contextual_records', 'time',
    if_not_exists => TRUE,
    chunk_time_interval => INTERVAL '1 day'
);

CREATE INDEX IF NOT EXISTS idx_cr_adapter ON contextual_records (adapter_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_cr_entity ON contextual_records (source_entity, time DESC);
" || fail "TimescaleDB init failed" 2
log "TimescaleDB ready."

# 4. Neo4j constraints
log "Initializing Neo4j constraints ..."
python3 -c "
from neo4j import GraphDatabase
import os

uri = os.getenv('NEO4J_URI', 'bolt://neo4j:7687')
user = os.getenv('NEO4J_USER', 'neo4j')
password = os.getenv('NEO4J_PASSWORD', 'changeme')

driver = GraphDatabase.driver(uri, auth=(user, password))
with driver.session() as session:
    session.run('CREATE CONSTRAINT adapter_id IF NOT EXISTS FOR (a:Adapter) REQUIRE a.adapter_id IS UNIQUE')
    session.run('CREATE CONSTRAINT product_id IF NOT EXISTS FOR (p:DataProduct) REQUIRE p.product_id IS UNIQUE')
    session.run('CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.entity_id IS UNIQUE')
driver.close()
print('Neo4j constraints created')
" || fail "Neo4j init failed" 2
log "Neo4j ready."

# 5. Done
log "========================================="
log "  Forge init complete — all schemas ready"
log "========================================="
exit 0
