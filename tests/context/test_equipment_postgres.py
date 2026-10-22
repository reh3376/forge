"""PostgresEquipmentStore against a mock asyncpg pool (FB-005).

The SQL it runs targets ``forge_core.equipment_registry``, created by
migration 009; ``tests/storage/test_migrations.py`` holds the column
alignment, this file holds the store's behaviour.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from forge.context.equipment import PostgresEquipmentStore
from forge.context.models import Equipment, EquipmentStatus


@pytest.fixture
def mock_pool():
    pool = MagicMock()
    conn = AsyncMock()
    pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)
    return pool, conn


def _fermenter() -> Equipment:
    return Equipment(
        equipment_id="FERM-001",
        name="Fermenter 1",
        site="WHK-Main",
        area="Fermentation",
        parent_id="FERM-LINE",
        equipment_type="fermenter",
        status=EquipmentStatus.MAINTENANCE,
        attributes={"volume_l": 20000},
        created_at=datetime(2026, 6, 1, tzinfo=UTC),
        updated_at=datetime(2026, 6, 2, tzinfo=UTC),
    )


def _row(equipment: Equipment, attributes_as: str = "json") -> dict:
    attrs = equipment.attributes
    return {
        "equipment_id": equipment.equipment_id,
        "name": equipment.name,
        "site": equipment.site,
        "area": equipment.area,
        "parent_id": equipment.parent_id,
        "equipment_type": equipment.equipment_type,
        "status": equipment.status.value,
        "attributes": json.dumps(attrs) if attributes_as == "json" else attrs,
        "created_at": equipment.created_at,
        "updated_at": equipment.updated_at,
    }


class TestWithoutPool:
    @pytest.mark.asyncio
    async def test_every_call_is_a_quiet_no_op(self):
        store = PostgresEquipmentStore(None)
        await store.save(_fermenter())
        assert await store.get("FERM-001") is None
        assert await store.list_by_site("WHK-Main") == []
        assert await store.list_by_area("WHK-Main", "Fermentation") == []
        assert await store.get_children("FERM-LINE") == []
        assert await store.delete("FERM-001") is False
        assert await store.count() == 0


class TestSave:
    @pytest.mark.asyncio
    async def test_upserts_every_column_with_attributes_as_json(self, mock_pool):
        pool, conn = mock_pool
        await PostgresEquipmentStore(pool).save(_fermenter())
        sql, *params = conn.execute.call_args[0]
        assert "INSERT INTO forge_core.equipment_registry" in sql
        assert "ON CONFLICT (equipment_id) DO UPDATE" in sql
        assert params[0] == "FERM-001"
        assert params[6] == "maintenance"
        assert json.loads(params[7]) == {"volume_l": 20000}
        assert params[8] == datetime(2026, 6, 1, tzinfo=UTC)

    @pytest.mark.asyncio
    async def test_a_database_error_is_logged_not_raised(self, mock_pool, caplog):
        pool, conn = mock_pool
        conn.execute.side_effect = Exception("db down")
        await PostgresEquipmentStore(pool).save(_fermenter())
        assert "Failed to save equipment FERM-001" in caplog.text


class TestRead:
    @pytest.mark.asyncio
    async def test_get_rebuilds_the_equipment_from_the_row(self, mock_pool):
        pool, conn = mock_pool
        conn.fetchrow.return_value = _row(_fermenter())
        found = await PostgresEquipmentStore(pool).get("FERM-001")
        assert found == _fermenter()
        assert conn.fetchrow.call_args[0][1] == "FERM-001"

    @pytest.mark.asyncio
    async def test_get_accepts_attributes_already_decoded(self, mock_pool):
        pool, conn = mock_pool
        conn.fetchrow.return_value = _row(_fermenter(), attributes_as="dict")
        found = await PostgresEquipmentStore(pool).get("FERM-001")
        assert found is not None and found.attributes == {"volume_l": 20000}

    @pytest.mark.asyncio
    async def test_get_not_found(self, mock_pool):
        pool, conn = mock_pool
        conn.fetchrow.return_value = None
        assert await PostgresEquipmentStore(pool).get("nope") is None

    @pytest.mark.asyncio
    async def test_lists_query_by_site_area_and_parent(self, mock_pool):
        pool, conn = mock_pool
        conn.fetch.return_value = [_row(_fermenter())]
        store = PostgresEquipmentStore(pool)
        assert [e.equipment_id for e in await store.list_by_site("WHK-Main")] == ["FERM-001"]
        assert "WHERE site = $1" in conn.fetch.call_args[0][0]
        assert [e.name for e in await store.list_by_area("WHK-Main", "Fermentation")] == [
            "Fermenter 1"
        ]
        assert conn.fetch.call_args[0][1:] == ("WHK-Main", "Fermentation")
        assert [e.parent_id for e in await store.get_children("FERM-LINE")] == ["FERM-LINE"]
        assert "WHERE parent_id = $1" in conn.fetch.call_args[0][0]

    @pytest.mark.asyncio
    async def test_a_read_error_is_logged_and_returns_empty(self, mock_pool, caplog):
        pool, conn = mock_pool
        conn.fetch.side_effect = Exception("db down")
        conn.fetchrow.side_effect = Exception("db down")
        store = PostgresEquipmentStore(pool)
        assert await store.get("FERM-001") is None
        assert await store.list_by_site("WHK-Main") == []
        assert "Failed to get equipment FERM-001" in caplog.text


class TestDeleteAndCount:
    @pytest.mark.asyncio
    async def test_delete_reports_whether_a_row_went(self, mock_pool):
        pool, conn = mock_pool
        store = PostgresEquipmentStore(pool)
        conn.execute.return_value = "DELETE 1"
        assert await store.delete("FERM-001") is True
        conn.execute.return_value = "DELETE 0"
        assert await store.delete("FERM-001") is False

    @pytest.mark.asyncio
    async def test_count(self, mock_pool):
        pool, conn = mock_pool
        conn.fetchval.return_value = 7
        assert await PostgresEquipmentStore(pool).count() == 7
