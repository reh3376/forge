"""PostgreSQL storage engine implementations.

Provides real PostgreSQL-backed stores that implement the same ABCs
as the InMemory variants:
    - PostgresProductStore  → ProductStore
    - PostgresLineageStore  → LineageStore
    - PostgresSchemaRegistry → wraps SchemaRegistry with PG persistence
    - PostgresAccessController → wraps AccessController with PG persistence

All classes accept an asyncpg connection pool and fall back to returning
empty results (not raising) when the pool is unavailable, so callers can
degrade gracefully during development.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from forge.core.models.data_product import (
    DataProduct,
    DataProductSchema,
    DataProductStatus,
    QualitySLO,
)
from forge.curation.lineage import LineageEntry, LineageStore, TransformationStep
from forge.curation.registry import ProductStore

logger = logging.getLogger(__name__)


class PostgresProductStore(ProductStore):
    """PostgreSQL-backed product store.

    Table: ``forge_canonical.data_products``

    Falls back to no-ops if the pool is ``None`` (dev without a database).
    """

    def __init__(self, pool: Any) -> None:
        self._pool = pool

    def _pool_ok(self) -> bool:
        return self._pool is not None

    def save(self, product: DataProduct) -> None:
        """Synchronous save — delegates to _save_async for real use."""
        if not self._pool_ok():
            return
        import asyncio

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if loop and loop.is_running():
            loop.create_task(self._save_async(product))
        else:
            asyncio.run(self._save_async(product))

    async def _save_async(self, product: DataProduct) -> None:
        try:
            async with self._pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO forge_canonical.data_products
                        (product_id, name, description, owner, status,
                         schema_ref, schema_version, source_adapters,
                         quality_slos, tags, metadata, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                    ON CONFLICT (product_id) DO UPDATE SET
                        name = EXCLUDED.name,
                        description = EXCLUDED.description,
                        owner = EXCLUDED.owner,
                        status = EXCLUDED.status,
                        schema_ref = EXCLUDED.schema_ref,
                        schema_version = EXCLUDED.schema_version,
                        source_adapters = EXCLUDED.source_adapters,
                        quality_slos = EXCLUDED.quality_slos,
                        tags = EXCLUDED.tags,
                        metadata = EXCLUDED.metadata,
                        updated_at = EXCLUDED.updated_at
                    """,
                    product.product_id,
                    product.name,
                    product.description,
                    product.owner,
                    product.status.value,
                    product.schema.schema_ref,
                    product.schema.version,
                    json.dumps(product.source_adapters),
                    json.dumps([s.model_dump() for s in product.quality_slos]),
                    json.dumps(product.tags),
                    json.dumps(product.metadata),
                    product.created_at,
                    product.updated_at,
                )
        except Exception:
            logger.exception("Failed to save product %s to PostgreSQL", product.product_id)

    def get(self, product_id: str) -> DataProduct | None:
        if not self._pool_ok():
            return None
        import asyncio

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return None
        if loop and loop.is_running():
            # Can't await in sync context — return None; use async variant
            return None
        return asyncio.run(self._get_async(product_id))

    async def _get_async(self, product_id: str) -> DataProduct | None:
        try:
            async with self._pool.acquire() as conn:
                row = await conn.fetchrow(
                    "SELECT * FROM forge_canonical.data_products WHERE product_id = $1",
                    product_id,
                )
                if row is None:
                    return None
                return self._row_to_product(row)
        except Exception:
            logger.exception("Failed to get product %s from PostgreSQL", product_id)
            return None

    def list_all(self, status: DataProductStatus | None = None) -> list[DataProduct]:
        if not self._pool_ok():
            return []
        import asyncio

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return []
        if loop and loop.is_running():
            return []
        return asyncio.run(self._list_all_async(status))

    async def _list_all_async(
        self, status: DataProductStatus | None = None,
    ) -> list[DataProduct]:
        try:
            async with self._pool.acquire() as conn:
                if status is not None:
                    rows = await conn.fetch(
                        "SELECT * FROM forge_canonical.data_products "
                        "WHERE status = $1 ORDER BY name",
                        status.value,
                    )
                else:
                    rows = await conn.fetch(
                        "SELECT * FROM forge_canonical.data_products ORDER BY name",
                    )
                return [self._row_to_product(r) for r in rows]
        except Exception:
            logger.exception("Failed to list products from PostgreSQL")
            return []

    def delete(self, product_id: str) -> bool:
        if not self._pool_ok():
            return False
        import asyncio

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return False
        if loop and loop.is_running():
            return False
        return asyncio.run(self._delete_async(product_id))

    async def _delete_async(self, product_id: str) -> bool:
        try:
            async with self._pool.acquire() as conn:
                result = await conn.execute(
                    "DELETE FROM forge_canonical.data_products WHERE product_id = $1",
                    product_id,
                )
                return result == "DELETE 1"
        except Exception:
            logger.exception("Failed to delete product %s from PostgreSQL", product_id)
            return False

    @staticmethod
    def _row_to_product(row: Any) -> DataProduct:
        """Convert an asyncpg Record to a DataProduct."""
        slos_raw = json.loads(row["quality_slos"]) if row["quality_slos"] else []
        return DataProduct(
            product_id=row["product_id"],
            name=row["name"],
            description=row["description"],
            owner=row["owner"],
            status=DataProductStatus(row["status"]),
            schema=DataProductSchema(
                schema_ref=row["schema_ref"],
                version=row["schema_version"],
            ),
            source_adapters=json.loads(row["source_adapters"]) if row["source_adapters"] else [],
            quality_slos=[QualitySLO(**s) for s in slos_raw],
            tags=json.loads(row["tags"]) if row["tags"] else [],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            metadata=json.loads(row["metadata"]) if row["metadata"] else {},
        )


class PostgresLineageStore(LineageStore):
    """PostgreSQL-backed lineage store.

    Table: ``forge_core.lineage_entries``
    """

    def __init__(self, pool: Any) -> None:
        self._pool = pool

    def _pool_ok(self) -> bool:
        return self._pool is not None

    def save(self, entry: LineageEntry) -> None:
        if not self._pool_ok():
            return
        import asyncio

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if loop and loop.is_running():
            loop.create_task(self._save_async(entry))
        else:
            asyncio.run(self._save_async(entry))

    async def _save_async(self, entry: LineageEntry) -> None:
        try:
            steps_json = json.dumps([
                {
                    "step_name": s.step_name,
                    "component": s.component,
                    "description": s.description,
                    "parameters": s.parameters,
                    "timestamp": s.timestamp.isoformat(),
                }
                for s in entry.steps
            ])
            async with self._pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO forge_core.lineage_entries
                        (lineage_id, source_record_ids, output_record_id,
                         product_id, adapter_ids, steps, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (lineage_id) DO UPDATE SET
                        source_record_ids = EXCLUDED.source_record_ids,
                        output_record_id = EXCLUDED.output_record_id,
                        product_id = EXCLUDED.product_id,
                        adapter_ids = EXCLUDED.adapter_ids,
                        steps = EXCLUDED.steps
                    """,
                    entry.lineage_id,
                    json.dumps(entry.source_record_ids),
                    entry.output_record_id,
                    entry.product_id,
                    json.dumps(entry.adapter_ids),
                    steps_json,
                    entry.created_at,
                )
        except Exception:
            logger.exception("Failed to save lineage %s to PostgreSQL", entry.lineage_id)

    def get(self, lineage_id: str) -> LineageEntry | None:
        if not self._pool_ok():
            return None
        import asyncio

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return None
        if loop and loop.is_running():
            return None
        return asyncio.run(self._get_async(lineage_id))

    async def _get_async(self, lineage_id: str) -> LineageEntry | None:
        try:
            async with self._pool.acquire() as conn:
                row = await conn.fetchrow(
                    "SELECT * FROM forge_core.lineage_entries WHERE lineage_id = $1",
                    lineage_id,
                )
                if row is None:
                    return None
                return self._row_to_entry(row)
        except Exception:
            logger.exception("Failed to get lineage %s", lineage_id)
            return None

    def get_by_output(self, output_record_id: str) -> list[LineageEntry]:
        return self._sync_query(
            "SELECT * FROM forge_core.lineage_entries WHERE output_record_id = $1",
            output_record_id,
        )

    def get_by_source(self, source_record_id: str) -> list[LineageEntry]:
        return self._sync_query(
            "SELECT * FROM forge_core.lineage_entries "
            "WHERE source_record_ids::jsonb @> $1::jsonb",
            json.dumps([source_record_id]),
        )

    def get_by_product(self, product_id: str) -> list[LineageEntry]:
        return self._sync_query(
            "SELECT * FROM forge_core.lineage_entries "
            "WHERE product_id = $1 ORDER BY created_at",
            product_id,
        )

    def list_all(self) -> list[LineageEntry]:
        return self._sync_query(
            "SELECT * FROM forge_core.lineage_entries ORDER BY created_at",
        )

    def _sync_query(self, sql: str, *args: Any) -> list[LineageEntry]:
        if not self._pool_ok():
            return []
        import asyncio

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return []
        if loop and loop.is_running():
            return []
        return asyncio.run(self._async_query(sql, *args))

    async def _async_query(self, sql: str, *args: Any) -> list[LineageEntry]:
        try:
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(sql, *args)
                return [self._row_to_entry(r) for r in rows]
        except Exception:
            logger.exception("Lineage query failed")
            return []

    @staticmethod
    def _row_to_entry(row: Any) -> LineageEntry:
        steps_raw = json.loads(row["steps"]) if row["steps"] else []
        steps = [
            TransformationStep(
                step_name=s["step_name"],
                component=s["component"],
                description=s.get("description", ""),
                parameters=s.get("parameters", {}),
                timestamp=datetime.fromisoformat(s["timestamp"])
                if "timestamp" in s
                else datetime.now(tz=UTC),
            )
            for s in steps_raw
        ]
        return LineageEntry(
            lineage_id=row["lineage_id"],
            source_record_ids=json.loads(row["source_record_ids"])
            if row["source_record_ids"]
            else [],
            output_record_id=row["output_record_id"],
            product_id=row["product_id"],
            adapter_ids=json.loads(row["adapter_ids"]) if row["adapter_ids"] else [],
            steps=steps,
            created_at=row["created_at"],
        )
