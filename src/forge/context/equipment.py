"""Equipment registry — stores and queries equipment hierarchy.

Provides EquipmentStore ABC with InMemory and PostgreSQL implementations.
Equipment is organized: site → area → equipment, with parent_id references.
"""

from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from copy import deepcopy
from typing import Any

from forge.context.models import Equipment, EquipmentStatus

logger = logging.getLogger(__name__)


class EquipmentStore(ABC):
    """Abstract storage for the equipment registry."""

    @abstractmethod
    async def save(self, equipment: Equipment) -> None: ...

    @abstractmethod
    async def get(self, equipment_id: str) -> Equipment | None: ...

    @abstractmethod
    async def list_by_site(self, site: str) -> list[Equipment]: ...

    @abstractmethod
    async def list_by_area(self, site: str, area: str) -> list[Equipment]: ...

    @abstractmethod
    async def get_children(self, parent_id: str) -> list[Equipment]: ...

    @abstractmethod
    async def delete(self, equipment_id: str) -> bool: ...

    @abstractmethod
    async def count(self) -> int: ...


class InMemoryEquipmentStore(EquipmentStore):
    """In-memory equipment store for development and testing."""

    def __init__(self) -> None:
        self._entries: dict[str, Equipment] = {}

    async def save(self, equipment: Equipment) -> None:
        self._entries[equipment.equipment_id] = equipment

    async def get(self, equipment_id: str) -> Equipment | None:
        entry = self._entries.get(equipment_id)
        return deepcopy(entry) if entry else None

    async def list_by_site(self, site: str) -> list[Equipment]:
        return [deepcopy(e) for e in self._entries.values() if e.site == site]

    async def list_by_area(self, site: str, area: str) -> list[Equipment]:
        return [
            deepcopy(e)
            for e in self._entries.values()
            if e.site == site and e.area == area
        ]

    async def get_children(self, parent_id: str) -> list[Equipment]:
        return [
            deepcopy(e)
            for e in self._entries.values()
            if e.parent_id == parent_id
        ]

    async def delete(self, equipment_id: str) -> bool:
        return self._entries.pop(equipment_id, None) is not None

    async def count(self) -> int:
        return len(self._entries)


# ---------------------------------------------------------------------------
# SQL constants
# ---------------------------------------------------------------------------

_UPSERT = """\
INSERT INTO forge_core.equipment_registry (
    equipment_id, name, site, area, parent_id, equipment_type,
    status, attributes, created_at, updated_at
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
ON CONFLICT (equipment_id) DO UPDATE SET
    name = EXCLUDED.name,
    site = EXCLUDED.site,
    area = EXCLUDED.area,
    parent_id = EXCLUDED.parent_id,
    equipment_type = EXCLUDED.equipment_type,
    status = EXCLUDED.status,
    attributes = EXCLUDED.attributes,
    updated_at = EXCLUDED.updated_at
"""

_SELECT = """\
SELECT equipment_id, name, site, area, parent_id, equipment_type,
       status, attributes, created_at, updated_at
  FROM forge_core.equipment_registry WHERE equipment_id = $1
"""

_BY_SITE = """\
SELECT equipment_id, name, site, area, parent_id, equipment_type,
       status, attributes, created_at, updated_at
  FROM forge_core.equipment_registry WHERE site = $1
  ORDER BY area, name
"""

_BY_AREA = """\
SELECT equipment_id, name, site, area, parent_id, equipment_type,
       status, attributes, created_at, updated_at
  FROM forge_core.equipment_registry WHERE site = $1 AND area = $2
  ORDER BY name
"""

_CHILDREN = """\
SELECT equipment_id, name, site, area, parent_id, equipment_type,
       status, attributes, created_at, updated_at
  FROM forge_core.equipment_registry WHERE parent_id = $1
  ORDER BY name
"""

_DELETE = "DELETE FROM forge_core.equipment_registry WHERE equipment_id = $1"
_COUNT = "SELECT count(*) FROM forge_core.equipment_registry"


class PostgresEquipmentStore(EquipmentStore):
    """asyncpg-backed equipment registry."""

    def __init__(self, pool: Any) -> None:
        self._pool = pool

    def _pool_ok(self) -> bool:
        return self._pool is not None

    async def save(self, equipment: Equipment) -> None:
        if not self._pool_ok():
            return
        try:
            async with self._pool.acquire() as conn:
                await conn.execute(
                    _UPSERT,
                    equipment.equipment_id,
                    equipment.name,
                    equipment.site,
                    equipment.area,
                    equipment.parent_id,
                    equipment.equipment_type,
                    equipment.status.value,
                    json.dumps(equipment.attributes),
                    equipment.created_at,
                    equipment.updated_at,
                )
        except Exception:
            logger.exception("Failed to save equipment %s", equipment.equipment_id)

    async def get(self, equipment_id: str) -> Equipment | None:
        if not self._pool_ok():
            return None
        try:
            async with self._pool.acquire() as conn:
                row = await conn.fetchrow(_SELECT, equipment_id)
            return self._row_to_equipment(row) if row else None
        except Exception:
            logger.exception("Failed to get equipment %s", equipment_id)
            return None

    async def list_by_site(self, site: str) -> list[Equipment]:
        if not self._pool_ok():
            return []
        try:
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(_BY_SITE, site)
            return [self._row_to_equipment(r) for r in rows]
        except Exception:
            logger.exception("Failed to list equipment for site %s", site)
            return []

    async def list_by_area(self, site: str, area: str) -> list[Equipment]:
        if not self._pool_ok():
            return []
        try:
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(_BY_AREA, site, area)
            return [self._row_to_equipment(r) for r in rows]
        except Exception:
            logger.exception("Failed to list equipment for %s/%s", site, area)
            return []

    async def get_children(self, parent_id: str) -> list[Equipment]:
        if not self._pool_ok():
            return []
        try:
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(_CHILDREN, parent_id)
            return [self._row_to_equipment(r) for r in rows]
        except Exception:
            logger.exception("Failed to get children for %s", parent_id)
            return []

    async def delete(self, equipment_id: str) -> bool:
        if not self._pool_ok():
            return False
        try:
            async with self._pool.acquire() as conn:
                result = await conn.execute(_DELETE, equipment_id)
            return result == "DELETE 1"
        except Exception:
            logger.exception("Failed to delete equipment %s", equipment_id)
            return False

    async def count(self) -> int:
        if not self._pool_ok():
            return 0
        try:
            async with self._pool.acquire() as conn:
                return await conn.fetchval(_COUNT)
        except Exception:
            logger.exception("Failed to count equipment")
            return 0

    @staticmethod
    def _row_to_equipment(row: Any) -> Equipment:
        attrs = row["attributes"]
        if isinstance(attrs, str):
            attrs = json.loads(attrs)
        return Equipment(
            equipment_id=row["equipment_id"],
            name=row["name"],
            site=row["site"],
            area=row["area"] or "",
            parent_id=row["parent_id"],
            equipment_type=row["equipment_type"] or "",
            status=EquipmentStatus(row["status"]),
            attributes=attrs if attrs else {},
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
