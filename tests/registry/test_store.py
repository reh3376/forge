"""Tests for SchemaStore ABC and InMemorySchemaStore."""

from __future__ import annotations

import pytest

from forge.registry.models import SchemaMetadata, SchemaType
from forge.registry.store import InMemorySchemaStore


def _make_metadata(
    schema_id: str = "forge://schemas/test/Barrel",
    name: str = "Barrel Schema",
    schema_type: SchemaType = SchemaType.ADAPTER_OUTPUT,
    **overrides,
) -> SchemaMetadata:
    defaults = {
        "schema_id": schema_id,
        "name": name,
        "schema_type": schema_type,
    }
    defaults.update(overrides)
    return SchemaMetadata(**defaults)


class TestInMemorySchemaStore:
    @pytest.mark.asyncio
    async def test_save_and_get(self):
        store = InMemorySchemaStore()
        m = _make_metadata()
        await store.save(m)
        result = await store.get(m.schema_id)
        assert result is not None
        assert result.schema_id == m.schema_id

    @pytest.mark.asyncio
    async def test_get_returns_none_for_missing(self):
        store = InMemorySchemaStore()
        assert await store.get("nonexistent") is None

    @pytest.mark.asyncio
    async def test_get_returns_deep_copy(self):
        store = InMemorySchemaStore()
        m = _make_metadata()
        m.add_version({"type": "object"})
        await store.save(m)
        copy = await store.get(m.schema_id)
        assert copy is not None
        copy.name = "MUTATED"
        original = await store.get(m.schema_id)
        assert original is not None
        assert original.name == "Barrel Schema"

    @pytest.mark.asyncio
    async def test_save_overwrites(self):
        store = InMemorySchemaStore()
        m = _make_metadata()
        await store.save(m)
        m.name = "Updated"
        await store.save(m)
        result = await store.get(m.schema_id)
        assert result is not None
        assert result.name == "Updated"

    @pytest.mark.asyncio
    async def test_list_all_empty(self):
        store = InMemorySchemaStore()
        assert await store.list_all() == []

    @pytest.mark.asyncio
    async def test_list_all(self):
        store = InMemorySchemaStore()
        await store.save(_make_metadata("s1", "Schema 1"))
        await store.save(_make_metadata("s2", "Schema 2"))
        results = await store.list_all()
        assert len(results) == 2

    @pytest.mark.asyncio
    async def test_list_all_filter_by_schema_type(self):
        store = InMemorySchemaStore()
        await store.save(
            _make_metadata("s1", "Adapter", schema_type=SchemaType.ADAPTER_OUTPUT)
        )
        await store.save(
            _make_metadata("s2", "API", schema_type=SchemaType.API)
        )
        results = await store.list_all(schema_type="adapter_output")
        assert len(results) == 1
        assert results[0].name == "Adapter"

    @pytest.mark.asyncio
    async def test_list_all_filter_by_status(self):
        store = InMemorySchemaStore()
        m1 = _make_metadata("s1", "Active")
        m2 = _make_metadata("s2", "Deprecated", status="deprecated")
        await store.save(m1)
        await store.save(m2)
        results = await store.list_all(status="deprecated")
        assert len(results) == 1
        assert results[0].name == "Deprecated"

    @pytest.mark.asyncio
    async def test_list_all_filter_by_owner(self):
        store = InMemorySchemaStore()
        await store.save(_make_metadata("s1", "S1", owner="alice"))
        await store.save(_make_metadata("s2", "S2", owner="bob"))
        results = await store.list_all(owner="alice")
        assert len(results) == 1
        assert results[0].owner == "alice"

    @pytest.mark.asyncio
    async def test_list_all_pagination(self):
        store = InMemorySchemaStore()
        for i in range(5):
            await store.save(_make_metadata(f"s{i}", f"Schema {i}"))
        page1 = await store.list_all(limit=2, offset=0)
        page2 = await store.list_all(limit=2, offset=2)
        page3 = await store.list_all(limit=2, offset=4)
        assert len(page1) == 2
        assert len(page2) == 2
        assert len(page3) == 1

    @pytest.mark.asyncio
    async def test_delete_existing(self):
        store = InMemorySchemaStore()
        await store.save(_make_metadata())
        result = await store.delete("forge://schemas/test/Barrel")
        assert result is True
        assert await store.get("forge://schemas/test/Barrel") is None

    @pytest.mark.asyncio
    async def test_delete_missing(self):
        store = InMemorySchemaStore()
        assert await store.delete("nonexistent") is False

    @pytest.mark.asyncio
    async def test_count(self):
        store = InMemorySchemaStore()
        assert await store.count() == 0
        await store.save(_make_metadata("s1", "S1"))
        await store.save(_make_metadata("s2", "S2"))
        assert await store.count() == 2
        await store.delete("s1")
        assert await store.count() == 1
