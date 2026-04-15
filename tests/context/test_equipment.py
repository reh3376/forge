"""Tests for EquipmentStore ABC and InMemoryEquipmentStore."""

from __future__ import annotations

import pytest

from forge.context.equipment import InMemoryEquipmentStore
from forge.context.models import Equipment


def _eq(eid: str = "FERM-001", **kw) -> Equipment:
    defaults = {"equipment_id": eid, "name": f"Eq {eid}", "site": "WHK-Main"}
    defaults.update(kw)
    return Equipment(**defaults)


class TestInMemoryEquipmentStore:
    @pytest.mark.asyncio
    async def test_save_and_get(self):
        store = InMemoryEquipmentStore()
        await store.save(_eq())
        result = await store.get("FERM-001")
        assert result is not None
        assert result.equipment_id == "FERM-001"

    @pytest.mark.asyncio
    async def test_get_not_found(self):
        store = InMemoryEquipmentStore()
        assert await store.get("missing") is None

    @pytest.mark.asyncio
    async def test_get_returns_copy(self):
        store = InMemoryEquipmentStore()
        await store.save(_eq())
        copy = await store.get("FERM-001")
        assert copy is not None
        copy.name = "MUTATED"
        original = await store.get("FERM-001")
        assert original is not None
        assert original.name == "Eq FERM-001"

    @pytest.mark.asyncio
    async def test_list_by_site(self):
        store = InMemoryEquipmentStore()
        await store.save(_eq("E1", site="Site-A"))
        await store.save(_eq("E2", site="Site-A"))
        await store.save(_eq("E3", site="Site-B"))
        result = await store.list_by_site("Site-A")
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_list_by_area(self):
        store = InMemoryEquipmentStore()
        await store.save(_eq("E1", site="S", area="Ferm"))
        await store.save(_eq("E2", site="S", area="Dist"))
        await store.save(_eq("E3", site="S", area="Ferm"))
        result = await store.list_by_area("S", "Ferm")
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_get_children(self):
        store = InMemoryEquipmentStore()
        await store.save(_eq("AREA-1", site="S"))
        await store.save(_eq("E1", site="S", parent_id="AREA-1"))
        await store.save(_eq("E2", site="S", parent_id="AREA-1"))
        await store.save(_eq("E3", site="S", parent_id="AREA-2"))
        children = await store.get_children("AREA-1")
        assert len(children) == 2

    @pytest.mark.asyncio
    async def test_delete(self):
        store = InMemoryEquipmentStore()
        await store.save(_eq())
        assert await store.delete("FERM-001") is True
        assert await store.get("FERM-001") is None

    @pytest.mark.asyncio
    async def test_delete_missing(self):
        store = InMemoryEquipmentStore()
        assert await store.delete("missing") is False

    @pytest.mark.asyncio
    async def test_count(self):
        store = InMemoryEquipmentStore()
        assert await store.count() == 0
        await store.save(_eq("E1"))
        await store.save(_eq("E2"))
        assert await store.count() == 2

    @pytest.mark.asyncio
    async def test_save_overwrites(self):
        store = InMemoryEquipmentStore()
        await store.save(_eq("E1", name="Old"))
        await store.save(_eq("E1", name="New"))
        result = await store.get("E1")
        assert result is not None
        assert result.name == "New"
