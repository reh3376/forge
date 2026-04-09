"""Forge Storage — DB Orchestration Framework.

Provides centralized schema registry, connection management, migration
control, and shadow writing for all spoke databases. All spoke data
flows through this layer before reaching Forge's storage engines.

Storage engines:
    - PostgreSQL  (relational: master data, transactions, spoke projections)
    - TimescaleDB (time-series: sensor data, SNMP metrics, historian)
    - Neo4j       (graph: device topology, material genealogy)
    - Redis       (cache: hot state, sessions, active alerts)
    - MinIO       (object: documents, archives, audit exports)
    - Kafka       (streaming: CDC events, adapter output, cross-module)
"""

from forge.storage.access import AccessController
from forge.storage.backfill import BackfillEngine
from forge.storage.config import StorageConfig
from forge.storage.pool import PoolManager
from forge.storage.registry import SchemaRegistry
from forge.storage.router import DataRouter
from forge.storage.shadow import ShadowWriter

__all__ = [
    "AccessController",
    "BackfillEngine",
    "DataRouter",
    "PoolManager",
    "SchemaRegistry",
    "ShadowWriter",
    "StorageConfig",
]
