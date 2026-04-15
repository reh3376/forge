"""Tests for BatchStore and InMemoryBatchStore."""

from __future__ import annotations

import pytest

from forge.context.batch import InMemoryBatchStore
from forge.context.models import Batch, BatchStatus


def _batch(bid: str = "B001", **kw) -> Batch:
    defaults = {"batch_id": bid, "equipment_id": "FERM-001"}
    defaults.update(kw)
    return Batch(**defaults)


class TestInMemoryBatchStore:
    @pytest.mark.asyncio
    async def test_save_and_get(self):
        store = InMemoryBatchStore()
        await store.save(_batch())
        result = await store.get("B001")
        assert result is not None
        assert result.batch_id == "B001"

    @pytest.mark.asyncio
    async def test_get_not_found(self):
        store = InMemoryBatchStore()
        assert await store.get("missing") is None

    @pytest.mark.asyncio
    async def test_get_active_for_equipment(self):
        store = InMemoryBatchStore()
        await store.save(_batch("B001", equipment_id="E1"))
        await store.save(_batch("B002", equipment_id="E2"))
        result = await store.get_active_for_equipment("E1")
        assert result is not None
        assert result.batch_id == "B001"

    @pytest.mark.asyncio
    async def test_get_active_for_equipment_none(self):
        store = InMemoryBatchStore()
        assert await store.get_active_for_equipment("E1") is None

    @pytest.mark.asyncio
    async def test_get_active_excludes_completed(self):
        store = InMemoryBatchStore()
        b = _batch("B001", equipment_id="E1")
        b.status = BatchStatus.COMPLETED
        await store.save(b)
        assert await store.get_active_for_equipment("E1") is None

    @pytest.mark.asyncio
    async def test_list_active(self):
        store = InMemoryBatchStore()
        await store.save(_batch("B001"))
        b2 = _batch("B002")
        b2.status = BatchStatus.COMPLETED
        await store.save(b2)
        active = await store.list_active()
        assert len(active) == 1
        assert active[0].batch_id == "B001"

    @pytest.mark.asyncio
    async def test_complete(self):
        store = InMemoryBatchStore()
        await store.save(_batch("B001"))
        result = await store.complete("B001")
        assert result is True
        batch = await store.get("B001")
        assert batch is not None
        assert batch.status == BatchStatus.COMPLETED
        assert batch.ended_at is not None

    @pytest.mark.asyncio
    async def test_complete_not_found(self):
        store = InMemoryBatchStore()
        assert await store.complete("missing") is False

    @pytest.mark.asyncio
    async def test_delete(self):
        store = InMemoryBatchStore()
        await store.save(_batch())
        assert await store.delete("B001") is True
        assert await store.get("B001") is None

    @pytest.mark.asyncio
    async def test_delete_missing(self):
        store = InMemoryBatchStore()
        assert await store.delete("missing") is False
