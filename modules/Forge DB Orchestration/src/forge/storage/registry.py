"""Schema Registry — single source of truth for all Forge-managed schemas.

Every entity flowing through Forge — from spoke adapters, curation
pipelines, or Forge Core itself — is registered here. The registry
tracks schema versions, authoritative ownership, storage routing,
retention policies, and integrity hashes.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from forge._compat import StrEnum

logger = logging.getLogger(__name__)


class SchemaStatus(StrEnum):
    """Lifecycle states for a registered schema."""

    DRAFT = "draft"
    REGISTERED = "registered"
    ACTIVE = "active"
    MIGRATING = "migrating"
    DEPRECATED = "deprecated"
    ARCHIVED = "archived"


class StorageEngine(StrEnum):
    """Target storage engines for Forge data."""

    POSTGRESQL = "postgresql"
    TIMESCALEDB = "timescaledb"
    NEO4J = "neo4j"
    REDIS = "redis"
    MINIO = "minio"
    KAFKA = "kafka"


class RetentionPolicy(StrEnum):
    """Standard retention policies for data categories."""

    PERMANENT = "permanent"
    TEN_YEARS = "10y"
    SEVEN_YEARS = "7y"
    ONE_YEAR = "1y"
    NINETY_DAYS = "90d"
    THIRTY_DAYS = "30d"
    SESSION = "session"


@dataclass
class SchemaEntry:
    """A registered entity schema in the Forge Schema Registry.

    Attributes:
        schema_id: Unique URI (forge://schemas/<spoke>/<entity>/v<version>)
        spoke_id: Source spoke identifier (e.g., "whk-wms", "whk-mes")
        entity_name: Entity type name (e.g., "Barrel", "Recipe", "Device")
        version: Semantic version string
        schema_json: JSON Schema defining the entity structure
        canonical_model: Forge canonical model it maps to (if any)
        authoritative_spoke: Spoke that is the single writer for this entity
        storage_engine: Target storage engine
        storage_namespace: Schema namespace (e.g., "spoke_wms", "forge_canonical")
        retention_policy: Data retention policy
        integrity_hash: SHA-256 of schema_json for drift detection
        status: Current lifecycle state
        registered_at: When this schema version was first registered
        updated_at: Last modification timestamp
    """

    schema_id: str
    spoke_id: str
    entity_name: str
    version: str
    schema_json: dict[str, Any]
    authoritative_spoke: str
    storage_engine: StorageEngine
    storage_namespace: str
    canonical_model: str | None = None
    retention_policy: RetentionPolicy = RetentionPolicy.SEVEN_YEARS
    integrity_hash: str = ""
    status: SchemaStatus = SchemaStatus.DRAFT
    registered_at: datetime = field(
        default_factory=lambda: datetime.now(tz=timezone.utc)
    )
    updated_at: datetime = field(
        default_factory=lambda: datetime.now(tz=timezone.utc)
    )

    def __post_init__(self) -> None:
        if not self.integrity_hash:
            self.integrity_hash = self.compute_hash()

    def compute_hash(self) -> str:
        """Compute SHA-256 integrity hash of the schema JSON."""
        canonical = json.dumps(self.schema_json, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode()).hexdigest()

    def verify_integrity(self) -> bool:
        """Check if current schema_json matches the stored hash."""
        return self.compute_hash() == self.integrity_hash


@dataclass
class SchemaRegistry:
    """In-memory schema registry backed by PostgreSQL.

    Phase 1: in-memory dict storage for development and testing.
    Phase 2: SQLAlchemy-backed persistence to forge_core.schema_entries.

    Usage::

        registry = SchemaRegistry()
        registry.register(entry)
        entry = registry.get("forge://schemas/whk-wms/Barrel/v1.0.0")
        entries = registry.list_by_spoke("whk-wms")
        drift = registry.check_drift("whk-wms")
    """

    _entries: dict[str, SchemaEntry] = field(default_factory=dict, init=False)

    def register(self, entry: SchemaEntry) -> SchemaEntry:
        """Register or update a schema entry.

        Recomputes integrity hash on registration. If an entry with
        the same schema_id exists, it is overwritten and a drift
        event is logged if the hash changed.
        """
        existing = self._entries.get(entry.schema_id)
        if existing and existing.integrity_hash != entry.compute_hash():
            logger.warning(
                "Schema drift detected: %s (old=%s, new=%s)",
                entry.schema_id,
                existing.integrity_hash[:12],
                entry.compute_hash()[:12],
            )

        entry.integrity_hash = entry.compute_hash()
        entry.updated_at = datetime.now(tz=timezone.utc)
        self._entries[entry.schema_id] = entry
        logger.info(
            "Registered schema: %s [%s] → %s/%s",
            entry.schema_id,
            entry.status.value,
            entry.storage_engine.value,
            entry.storage_namespace,
        )
        return entry

    def get(self, schema_id: str) -> SchemaEntry | None:
        """Retrieve a schema entry by its full URI."""
        return self._entries.get(schema_id)

    def list_by_spoke(self, spoke_id: str) -> list[SchemaEntry]:
        """List all schema entries for a given spoke."""
        return [e for e in self._entries.values() if e.spoke_id == spoke_id]

    def list_by_engine(self, engine: StorageEngine) -> list[SchemaEntry]:
        """List all schema entries targeting a specific storage engine."""
        return [e for e in self._entries.values() if e.storage_engine == engine]

    def list_active(self) -> list[SchemaEntry]:
        """List all schemas in ACTIVE status."""
        return [
            e for e in self._entries.values() if e.status == SchemaStatus.ACTIVE
        ]

    def check_drift(self, spoke_id: str) -> list[tuple[str, str, str]]:
        """Check integrity of all schemas for a spoke.

        Returns list of (schema_id, expected_hash, actual_hash) for
        entries where the stored hash doesn't match the schema_json.
        """
        drifted: list[tuple[str, str, str]] = []
        for entry in self.list_by_spoke(spoke_id):
            actual = entry.compute_hash()
            if actual != entry.integrity_hash:
                drifted.append((entry.schema_id, entry.integrity_hash, actual))
        return drifted

    def get_authoritative_spoke(self, entity_name: str) -> str | None:
        """Find which spoke is authoritative for an entity type."""
        for entry in self._entries.values():
            if entry.entity_name == entity_name and entry.status in (
                SchemaStatus.ACTIVE,
                SchemaStatus.REGISTERED,
            ):
                return entry.authoritative_spoke
        return None

    @property
    def entry_count(self) -> int:
        return len(self._entries)

    @property
    def spoke_count(self) -> int:
        return len({e.spoke_id for e in self._entries.values()})
