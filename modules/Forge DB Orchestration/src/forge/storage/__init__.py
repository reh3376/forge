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

from forge_hub.storage.access import AccessController
from forge_hub.storage.backfill import BackfillEngine
from forge_hub.storage.config import StorageConfig
from forge_hub.storage.pool import PoolManager
from forge_hub.storage.registry import SchemaRegistry
from forge_hub.storage.router import DataRouter
from forge_hub.storage.shadow import ShadowWriter

__all__ = [
    "AccessController",
    "BackfillEngine",
    "DataRouter",
    "PoolManager",
    "SchemaRegistry",
    "ShadowWriter",
    "StorageConfig",
]
