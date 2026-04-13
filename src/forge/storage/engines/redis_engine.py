"""Redis storage engine — hot state cache and schema cache.

Provides:
    - RedisStateCache: SET/HSET with TTL for equipment state, adapter
      health, and real-time operational context.
    - RedisSchemaCache: Caches SchemaEntry lookups to avoid repeated
      PostgreSQL queries during high-throughput ingestion.

Both classes accept a redis.asyncio client from PoolManager.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from forge.core.models.contextual_record import ContextualRecord  # noqa: TC001

logger = logging.getLogger(__name__)

# Default TTLs (seconds)
_STATE_TTL = 300  # 5 min — equipment state, adapter health
_SCHEMA_TTL = 3600  # 1 hour — schema entries change infrequently


class RedisStateCache:
    """Redis-backed hot state cache for equipment and adapter state.

    Key patterns:
        forge:state:equipment:{equipment_id}  → HASH (latest readings)
        forge:state:adapter:{adapter_id}      → HASH (health snapshot)
        forge:record:{record_id}              → STRING (JSON, short TTL)
    """

    def __init__(self, client: Any, ttl: int = _STATE_TTL) -> None:
        self._client = client
        self._ttl = ttl

    def _client_ok(self) -> bool:
        return self._client is not None

    async def cache_record(self, record: ContextualRecord) -> bool:
        """Cache a record's latest value keyed by equipment + tag_path."""
        if not self._client_ok():
            return False

        try:
            record_id = str(record.record_id)
            key = f"forge:record:{record_id}"
            value = json.dumps({
                "record_id": record_id,
                "adapter_id": record.source.adapter_id,
                "system": record.source.system,
                "tag_path": record.source.tag_path,
                "raw": record.value.raw,
                "quality": record.value.quality.value,
                "data_type": record.value.data_type,
                "engineering_units": record.value.engineering_units,
                "timestamp": record.timestamp.source_time.isoformat(),
            })
            await self._client.set(key, value, ex=self._ttl)

            # Also update equipment hash if context available
            equipment_id = record.context.equipment_id if record.context else None
            if equipment_id and record.source.tag_path:
                eq_key = f"forge:state:equipment:{equipment_id}"
                field_name = record.source.tag_path
                await self._client.hset(eq_key, field_name, value)
                await self._client.expire(eq_key, self._ttl)

            return True
        except Exception:
            logger.exception("Failed to cache record %s in Redis", record.record_id)
            return False

    async def get_record(self, record_id: str) -> dict[str, Any] | None:
        """Retrieve a cached record by ID."""
        if not self._client_ok():
            return None

        try:
            raw = await self._client.get(f"forge:record:{record_id}")
            if raw is None:
                return None
            return json.loads(raw)
        except Exception:
            logger.exception("Failed to get record %s from Redis", record_id)
            return None

    async def get_equipment_state(self, equipment_id: str) -> dict[str, Any]:
        """Get all cached readings for a piece of equipment."""
        if not self._client_ok():
            return {}

        try:
            raw = await self._client.hgetall(f"forge:state:equipment:{equipment_id}")
            return {
                k.decode() if isinstance(k, bytes) else k: json.loads(
                    v.decode() if isinstance(v, bytes) else v,
                )
                for k, v in raw.items()
            }
        except Exception:
            logger.exception("Failed to get equipment state %s from Redis", equipment_id)
            return {}

    async def set_adapter_health(
        self, adapter_id: str, health: dict[str, Any],
    ) -> bool:
        """Cache adapter health snapshot."""
        if not self._client_ok():
            return False

        try:
            key = f"forge:state:adapter:{adapter_id}"
            await self._client.set(key, json.dumps(health), ex=self._ttl)
            return True
        except Exception:
            logger.exception("Failed to cache adapter health %s", adapter_id)
            return False

    async def get_adapter_health(self, adapter_id: str) -> dict[str, Any] | None:
        """Retrieve cached adapter health."""
        if not self._client_ok():
            return None

        try:
            raw = await self._client.get(f"forge:state:adapter:{adapter_id}")
            if raw is None:
                return None
            return json.loads(raw.decode() if isinstance(raw, bytes) else raw)
        except Exception:
            logger.exception("Failed to get adapter health %s from Redis", adapter_id)
            return None

    async def delete(self, key: str) -> bool:
        """Delete a key from the cache."""
        if not self._client_ok():
            return False

        try:
            await self._client.delete(key)
            return True
        except Exception:
            return False


class RedisSchemaCache:
    """Redis-backed cache for schema registry lookups.

    Reduces PostgreSQL load during high-throughput ingestion by caching
    schema entries. Cache is invalidated on schema registration.

    Key pattern: ``forge:schema:{schema_id}``
    """

    def __init__(self, client: Any, ttl: int = _SCHEMA_TTL) -> None:
        self._client = client
        self._ttl = ttl

    def _client_ok(self) -> bool:
        return self._client is not None

    async def get(self, schema_id: str) -> dict[str, Any] | None:
        """Get a cached schema entry."""
        if not self._client_ok():
            return None

        try:
            raw = await self._client.get(f"forge:schema:{schema_id}")
            if raw is None:
                return None
            return json.loads(raw.decode() if isinstance(raw, bytes) else raw)
        except Exception:
            logger.exception("Failed to get schema %s from Redis", schema_id)
            return None

    async def set(self, schema_id: str, entry: dict[str, Any]) -> bool:
        """Cache a schema entry."""
        if not self._client_ok():
            return False

        try:
            key = f"forge:schema:{schema_id}"
            await self._client.set(key, json.dumps(entry), ex=self._ttl)
            return True
        except Exception:
            logger.exception("Failed to cache schema %s in Redis", schema_id)
            return False

    async def invalidate(self, schema_id: str) -> bool:
        """Remove a schema entry from cache (call on re-registration)."""
        if not self._client_ok():
            return False

        try:
            await self._client.delete(f"forge:schema:{schema_id}")
            return True
        except Exception:
            return False

    async def invalidate_all(self) -> int:
        """Flush all cached schemas. Returns count deleted."""
        if not self._client_ok():
            return 0

        try:
            keys = []
            async for key in self._client.scan_iter(match="forge:schema:*"):
                keys.append(key)
            if keys:
                await self._client.delete(*keys)
            return len(keys)
        except Exception:
            logger.exception("Failed to flush schema cache")
            return 0
