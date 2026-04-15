"""Schema Registry domain models.

Defines the core types for the F20 Schema Registry Service:
- SchemaType: categorizes schemas (adapter output, data product, API, etc.)
- CompatibilityMode: compatibility enforcement level between versions
- SchemaVersion: an immutable, versioned snapshot of a schema
- SchemaMetadata: top-level registry entry grouping all versions
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from forge._compat import StrEnum


class SchemaType(StrEnum):
    """Category of schema managed by the registry."""

    ADAPTER_OUTPUT = "adapter_output"
    DATA_PRODUCT = "data_product"
    API = "api"
    EVENT = "event"
    GOVERNANCE = "governance"


class CompatibilityMode(StrEnum):
    """Compatibility enforcement between consecutive schema versions.

    BACKWARD  — new schema can read data written by the old schema.
    FORWARD   — old schema can read data written by the new schema.
    FULL      — both BACKWARD and FORWARD.
    NONE      — no compatibility enforcement.
    """

    BACKWARD = "BACKWARD"
    FORWARD = "FORWARD"
    FULL = "FULL"
    NONE = "NONE"


@dataclass(frozen=True)
class SchemaVersion:
    """An immutable snapshot of a schema at a particular version.

    Each version stores the full JSON schema, an integrity hash,
    and a reference to the previous version for diffing.
    """

    version: int
    schema_json: dict[str, Any]
    integrity_hash: str
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    description: str = ""
    previous_version: int | None = None

    @staticmethod
    def compute_hash(schema_json: dict[str, Any]) -> str:
        """Compute SHA-256 integrity hash of the schema JSON."""
        canonical = json.dumps(schema_json, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode()).hexdigest()


@dataclass
class SchemaMetadata:
    """Top-level registry entry that groups all versions of a schema.

    Attributes:
        schema_id: Unique identifier (e.g. ``forge://schemas/whk-wms/Barrel``)
        name: Human-readable name
        schema_type: Category of schema
        compatibility: Enforcement mode for version transitions
        latest_version: Current highest version number
        versions: Ordered list of all versions (ascending)
        owner: Named individual or team responsible for the schema
        description: Free-text description of what this schema represents
        tags: Searchable tags for discovery
        status: Lifecycle status (reuses SchemaStatus from storage.registry)
        created_at: When the first version was registered
        updated_at: When the most recent version was registered
    """

    schema_id: str
    name: str
    schema_type: SchemaType
    compatibility: CompatibilityMode = CompatibilityMode.BACKWARD
    latest_version: int = 0
    versions: list[SchemaVersion] = field(default_factory=list)
    owner: str = ""
    description: str = ""
    tags: list[str] = field(default_factory=list)
    status: str = "active"
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def add_version(
        self,
        schema_json: dict[str, Any],
        description: str = "",
    ) -> SchemaVersion:
        """Create and append a new version of this schema."""
        new_version_num = self.latest_version + 1
        integrity_hash = SchemaVersion.compute_hash(schema_json)
        version = SchemaVersion(
            version=new_version_num,
            schema_json=schema_json,
            integrity_hash=integrity_hash,
            description=description,
            previous_version=self.latest_version if self.latest_version > 0 else None,
        )
        self.versions.append(version)
        self.latest_version = new_version_num
        self.updated_at = datetime.now(UTC)
        return version

    def get_version(self, version: int) -> SchemaVersion | None:
        """Get a specific version by number."""
        for v in self.versions:
            if v.version == version:
                return v
        return None

    def get_latest(self) -> SchemaVersion | None:
        """Get the latest version."""
        return self.get_version(self.latest_version)
