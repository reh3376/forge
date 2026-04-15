"""PostgreSQL-backed schema store for the F20 Schema Registry.

Tables:
    ``forge_core.registry_schemas``  — one row per schema (metadata)
    ``forge_core.registry_versions`` — one row per schema version

Falls back to no-ops when the asyncpg pool is ``None``, so callers
can degrade gracefully during local development.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from forge.registry.models import (
    CompatibilityMode,
    SchemaMetadata,
    SchemaType,
    SchemaVersion,
)
from forge.registry.store import SchemaStore

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# SQL constants
# ---------------------------------------------------------------------------

_UPSERT_SCHEMA = """\
INSERT INTO forge_core.registry_schemas (
    schema_id, name, schema_type, compatibility, latest_version,
    owner, description, tags, status, created_at, updated_at
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
ON CONFLICT (schema_id) DO UPDATE SET
    name = EXCLUDED.name,
    schema_type = EXCLUDED.schema_type,
    compatibility = EXCLUDED.compatibility,
    latest_version = EXCLUDED.latest_version,
    owner = EXCLUDED.owner,
    description = EXCLUDED.description,
    tags = EXCLUDED.tags,
    status = EXCLUDED.status,
    updated_at = EXCLUDED.updated_at
"""

_UPSERT_VERSION = """\
INSERT INTO forge_core.registry_versions (
    schema_id, version, schema_json, integrity_hash,
    description, previous_version, created_at
) VALUES ($1,$2,$3,$4,$5,$6,$7)
ON CONFLICT (schema_id, version) DO NOTHING
"""

_SELECT_SCHEMA = """\
SELECT schema_id, name, schema_type, compatibility, latest_version,
       owner, description, tags, status, created_at, updated_at
  FROM forge_core.registry_schemas
 WHERE schema_id = $1
"""

_SELECT_VERSIONS = """\
SELECT version, schema_json, integrity_hash, description,
       previous_version, created_at
  FROM forge_core.registry_versions
 WHERE schema_id = $1
 ORDER BY version ASC
"""

_DELETE_VERSIONS = "DELETE FROM forge_core.registry_versions WHERE schema_id = $1"
_DELETE_SCHEMA = "DELETE FROM forge_core.registry_schemas WHERE schema_id = $1"

_COUNT = "SELECT count(*) FROM forge_core.registry_schemas"


# ---------------------------------------------------------------------------
# PostgresSchemaStore
# ---------------------------------------------------------------------------


class PostgresSchemaStore(SchemaStore):
    """asyncpg-backed persistence for SchemaMetadata + SchemaVersion."""

    def __init__(self, pool: Any) -> None:
        self._pool = pool

    def _pool_ok(self) -> bool:
        return self._pool is not None

    # -- write ---------------------------------------------------------------

    async def save(self, metadata: SchemaMetadata) -> None:
        if not self._pool_ok():
            return
        try:
            async with self._pool.acquire() as conn, conn.transaction():
                await conn.execute(
                    _UPSERT_SCHEMA,
                    metadata.schema_id,
                    metadata.name,
                    metadata.schema_type.value,
                    metadata.compatibility.value,
                    metadata.latest_version,
                    metadata.owner,
                    metadata.description,
                    metadata.tags,
                    metadata.status,
                    metadata.created_at,
                    metadata.updated_at,
                )
                for v in metadata.versions:
                    await conn.execute(
                        _UPSERT_VERSION,
                        metadata.schema_id,
                        v.version,
                        json.dumps(v.schema_json, sort_keys=True),
                        v.integrity_hash,
                        v.description,
                        v.previous_version,
                        v.created_at,
                    )
            logger.info("Saved schema %s (v%d)", metadata.schema_id, metadata.latest_version)
        except Exception:
            logger.exception("Failed to save schema %s", metadata.schema_id)

    # -- read ----------------------------------------------------------------

    async def get(self, schema_id: str) -> SchemaMetadata | None:
        if not self._pool_ok():
            return None
        try:
            async with self._pool.acquire() as conn:
                row = await conn.fetchrow(_SELECT_SCHEMA, schema_id)
                if not row:
                    return None
                version_rows = await conn.fetch(_SELECT_VERSIONS, schema_id)
            return self._row_to_metadata(row, version_rows)
        except Exception:
            logger.exception("Failed to get schema %s", schema_id)
            return None

    async def list_all(
        self,
        *,
        schema_type: str | None = None,
        status: str | None = None,
        owner: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[SchemaMetadata]:
        if not self._pool_ok():
            return []
        try:
            clauses: list[str] = []
            params: list[Any] = []
            idx = 1

            if schema_type:
                clauses.append(f"schema_type = ${idx}")
                params.append(schema_type)
                idx += 1
            if status:
                clauses.append(f"status = ${idx}")
                params.append(status)
                idx += 1
            if owner:
                clauses.append(f"owner = ${idx}")
                params.append(owner)
                idx += 1

            where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
            sql = (
                f"SELECT schema_id, name, schema_type, compatibility, latest_version,"
                f" owner, description, tags, status, created_at, updated_at"
                f" FROM forge_core.registry_schemas{where}"
                f" ORDER BY updated_at DESC"
                f" LIMIT ${idx} OFFSET ${idx + 1}"
            )
            params.extend([limit, offset])

            async with self._pool.acquire() as conn:
                rows = await conn.fetch(sql, *params)
                results: list[SchemaMetadata] = []
                for row in rows:
                    v_rows = await conn.fetch(_SELECT_VERSIONS, row["schema_id"])
                    results.append(self._row_to_metadata(row, v_rows))
            return results
        except Exception:
            logger.exception("Failed to list schemas")
            return []

    # -- delete --------------------------------------------------------------

    async def delete(self, schema_id: str) -> bool:
        if not self._pool_ok():
            return False
        try:
            async with self._pool.acquire() as conn, conn.transaction():
                await conn.execute(_DELETE_VERSIONS, schema_id)
                result = await conn.execute(_DELETE_SCHEMA, schema_id)
            return result == "DELETE 1"
        except Exception:
            logger.exception("Failed to delete schema %s", schema_id)
            return False

    # -- count ---------------------------------------------------------------

    async def count(self) -> int:
        if not self._pool_ok():
            return 0
        try:
            async with self._pool.acquire() as conn:
                return await conn.fetchval(_COUNT)
        except Exception:
            logger.exception("Failed to count schemas")
            return 0

    # -- helpers -------------------------------------------------------------

    @staticmethod
    def _row_to_metadata(
        row: Any,
        version_rows: list[Any],
    ) -> SchemaMetadata:
        versions = [
            SchemaVersion(
                version=vr["version"],
                schema_json=json.loads(vr["schema_json"])
                if isinstance(vr["schema_json"], str)
                else vr["schema_json"],
                integrity_hash=vr["integrity_hash"],
                description=vr["description"] or "",
                previous_version=vr["previous_version"],
                created_at=vr["created_at"],
            )
            for vr in version_rows
        ]
        return SchemaMetadata(
            schema_id=row["schema_id"],
            name=row["name"],
            schema_type=SchemaType(row["schema_type"]),
            compatibility=CompatibilityMode(row["compatibility"]),
            latest_version=row["latest_version"],
            versions=versions,
            owner=row["owner"] or "",
            description=row["description"] or "",
            tags=list(row["tags"]) if row["tags"] else [],
            status=row["status"] or "active",
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
