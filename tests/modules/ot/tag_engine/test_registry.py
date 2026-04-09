"""Tests for TagRegistry — CRUD, browse, dependencies, change notification."""

import pytest
import pytest_asyncio

from forge.modules.ot.opcua_client.types import DataType, QualityCode
from forge.modules.ot.tag_engine.models import (
    DerivedSource,
    DerivedTag,
    ExpressionTag,
    MemoryTag,
    ReferenceTag,
    ScanClass,
    StandardTag,
    TagType,
    TagValue,
)
from forge.modules.ot.tag_engine.registry import TagRegistry


@pytest_asyncio.fixture
async def registry():
    return TagRegistry()


@pytest_asyncio.fixture
async def populated_registry():
    """Registry with a realistic set of tags for browse testing."""
    reg = TagRegistry()
    tags = [
        StandardTag(path="WH/WHK01/Distillery01/TIT_2010/Out_PV", opcua_node_id="ns=2;s=TIT_2010.Out_PV"),
        StandardTag(path="WH/WHK01/Distillery01/TIT_2010/Out_Alarm", opcua_node_id="ns=2;s=TIT_2010.Out_Alarm", data_type=DataType.BOOLEAN),
        StandardTag(path="WH/WHK01/Distillery01/LIT_6050B/Out_PV", opcua_node_id="ns=2;s=LIT_6050B.Out_PV"),
        StandardTag(path="WH/WHK01/Distillery01/PIT_3020/Out_PV", opcua_node_id="ns=2;s=PIT_3020.Out_PV"),
        StandardTag(path="WH/WHK01/Granary/TIT_1010/Out_PV", opcua_node_id="ns=3;s=TIT_1010.Out_PV"),
        MemoryTag(path="WH/WHK01/System/Mode"),
        ExpressionTag(path="WH/WHK01/Distillery01/TIT_2010/Out_PV_F", expression="{WH/WHK01/Distillery01/TIT_2010/Out_PV} * 1.8 + 32"),
    ]
    await reg.register_many(tags)
    return reg


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

class TestRegister:
    async def test_register_tag(self, registry):
        tag = MemoryTag(path="test/tag")
        await registry.register(tag)
        assert registry.count == 1
        assert "test/tag" in registry.paths

    async def test_register_duplicate_raises(self, registry):
        tag = MemoryTag(path="test/tag")
        await registry.register(tag)
        with pytest.raises(ValueError, match="already registered"):
            await registry.register(tag)

    async def test_register_many(self, registry):
        tags = [MemoryTag(path=f"test/{i}") for i in range(10)]
        count = await registry.register_many(tags)
        assert count == 10
        assert registry.count == 10

    async def test_register_many_skips_duplicates(self, registry):
        tags = [MemoryTag(path="test/a"), MemoryTag(path="test/a")]
        count = await registry.register_many(tags)
        assert count == 1


class TestUnregister:
    async def test_unregister_existing(self, registry):
        await registry.register(MemoryTag(path="test/a"))
        assert await registry.unregister("test/a")
        assert registry.count == 0

    async def test_unregister_nonexistent(self, registry):
        assert not await registry.unregister("nope")

    async def test_unregister_cleans_dependencies(self, registry):
        source = MemoryTag(path="source")
        expr = ExpressionTag(path="expr", expression="{source} + 1")
        await registry.register(source)
        await registry.register(expr)

        # Verify dependency exists
        deps = await registry.get_dependents("source")
        assert "expr" in deps

        # Remove the dependent
        await registry.unregister("expr")
        deps = await registry.get_dependents("source")
        assert "expr" not in deps


# ---------------------------------------------------------------------------
# Get operations
# ---------------------------------------------------------------------------

class TestGetOperations:
    async def test_get_definition(self, registry):
        tag = MemoryTag(path="test/a", default_value=42)
        await registry.register(tag)
        got = await registry.get_definition("test/a")
        assert isinstance(got, MemoryTag)
        assert got.default_value == 42

    async def test_get_definition_missing(self, registry):
        assert await registry.get_definition("nope") is None

    async def test_get_value_initial(self, registry):
        await registry.register(MemoryTag(path="test/a"))
        tv = await registry.get_value("test/a")
        assert tv is not None
        assert tv.value is None
        assert tv.quality == QualityCode.NOT_AVAILABLE

    async def test_get_tag_and_value(self, registry):
        await registry.register(MemoryTag(path="test/a"))
        pair = await registry.get_tag_and_value("test/a")
        assert pair is not None
        tag, tv = pair
        assert tag.path == "test/a"
        assert isinstance(tv, TagValue)


# ---------------------------------------------------------------------------
# Update value
# ---------------------------------------------------------------------------

class TestUpdateValue:
    async def test_update_value(self, registry):
        await registry.register(MemoryTag(path="test/a"))
        changed = await registry.update_value("test/a", 42.0, QualityCode.GOOD)
        assert changed

        tv = await registry.get_value("test/a")
        assert tv.value == 42.0
        assert tv.quality == QualityCode.GOOD
        assert tv.change_count == 1

    async def test_update_same_value_not_changed(self, registry):
        await registry.register(MemoryTag(path="test/a"))
        await registry.update_value("test/a", 42.0, QualityCode.GOOD)
        changed = await registry.update_value("test/a", 42.0, QualityCode.GOOD)
        assert not changed

    async def test_update_tracks_previous(self, registry):
        await registry.register(MemoryTag(path="test/a"))
        await registry.update_value("test/a", 10)
        await registry.update_value("test/a", 20)

        tv = await registry.get_value("test/a")
        assert tv.value == 20
        assert tv.previous_value == 10

    async def test_update_nonexistent_returns_false(self, registry):
        changed = await registry.update_value("nope", 42)
        assert not changed


# ---------------------------------------------------------------------------
# Browse
# ---------------------------------------------------------------------------

class TestBrowse:
    async def test_browse_root(self, populated_registry):
        children = await populated_registry.browse("")
        names = [c["name"] for c in children]
        assert "WH" in names
        assert all(c["is_folder"] for c in children)

    async def test_browse_site(self, populated_registry):
        children = await populated_registry.browse("WH")
        names = [c["name"] for c in children]
        assert "WHK01" in names

    async def test_browse_area(self, populated_registry):
        children = await populated_registry.browse("WH/WHK01")
        names = [c["name"] for c in children]
        assert "Distillery01" in names
        assert "Granary" in names
        assert "System" in names

    async def test_browse_equipment_folder(self, populated_registry):
        children = await populated_registry.browse("WH/WHK01/Distillery01/TIT_2010")
        names = [c["name"] for c in children]
        assert "Out_PV" in names
        assert "Out_Alarm" in names
        assert "Out_PV_F" in names
        # These are leaf tags, not folders
        assert all(not c["is_folder"] for c in children)

    async def test_browse_leaf_has_tag_type(self, populated_registry):
        children = await populated_registry.browse("WH/WHK01/Distillery01/TIT_2010")
        pv = next(c for c in children if c["name"] == "Out_PV")
        assert pv["tag_type"] == "standard"
        assert pv["data_type"] == "Double"

    async def test_browse_empty_prefix_returns_all_roots(self, populated_registry):
        children = await populated_registry.browse("")
        assert len(children) >= 1

    async def test_browse_nonexistent_returns_empty(self, populated_registry):
        children = await populated_registry.browse("Nonexistent/Path")
        assert children == []


# ---------------------------------------------------------------------------
# Find operations
# ---------------------------------------------------------------------------

class TestFindOperations:
    async def test_find_by_type(self, populated_registry):
        memory_tags = await populated_registry.find_by_type(TagType.MEMORY)
        assert len(memory_tags) == 1
        assert memory_tags[0].path == "WH/WHK01/System/Mode"

    async def test_find_by_scan_class(self, populated_registry):
        standard_paths = await populated_registry.find_by_scan_class(ScanClass.STANDARD)
        # All tags default to STANDARD scan class
        assert len(standard_paths) == 7

    async def test_find_by_area(self, populated_registry):
        # No area set yet (empty by default)
        paths = await populated_registry.find_by_area("Distillery")
        assert len(paths) == 0


# ---------------------------------------------------------------------------
# Dependency tracking
# ---------------------------------------------------------------------------

class TestDependencyTracking:
    async def test_expression_dependencies(self, registry):
        source = MemoryTag(path="temp")
        expr = ExpressionTag(path="temp_f", expression="{temp} * 1.8 + 32")
        await registry.register(source)
        await registry.register(expr)

        deps = await registry.get_dependents("temp")
        assert "temp_f" in deps

    async def test_derived_dependencies(self, registry):
        await registry.register(MemoryTag(path="a"))
        await registry.register(MemoryTag(path="b"))
        derived = DerivedTag(
            path="avg",
            sources=[DerivedSource(tag_path="a", weight=0.5), DerivedSource(tag_path="b", weight=0.5)],
        )
        await registry.register(derived)

        assert "avg" in await registry.get_dependents("a")
        assert "avg" in await registry.get_dependents("b")

    async def test_reference_dependency(self, registry):
        await registry.register(MemoryTag(path="source"))
        ref = ReferenceTag(path="alias", source_path="source")
        await registry.register(ref)

        assert "alias" in await registry.get_dependents("source")

    async def test_no_dependencies_for_memory(self, registry):
        await registry.register(MemoryTag(path="mem"))
        deps = await registry.get_dependents("mem")
        assert len(deps) == 0


# ---------------------------------------------------------------------------
# Change notification
# ---------------------------------------------------------------------------

class TestChangeNotification:
    async def test_callback_fires_on_change(self, registry):
        changes = []

        async def on_change(path, value):
            changes.append((path, value.value))

        registry.on_change(on_change)
        await registry.register(MemoryTag(path="test"))
        await registry.update_value("test", 42)

        assert len(changes) == 1
        assert changes[0] == ("test", 42)

    async def test_callback_not_fired_on_same_value(self, registry):
        changes = []

        async def on_change(path, value):
            changes.append(path)

        registry.on_change(on_change)
        await registry.register(MemoryTag(path="test"))
        await registry.update_value("test", 42)
        await registry.update_value("test", 42)  # Same value

        assert len(changes) == 1

    async def test_callback_error_doesnt_crash(self, registry):
        async def bad_callback(path, value):
            raise RuntimeError("boom")

        registry.on_change(bad_callback)
        await registry.register(MemoryTag(path="test"))
        # Should not raise
        await registry.update_value("test", 42)


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

class TestStats:
    async def test_stats(self, populated_registry):
        stats = await populated_registry.get_stats()
        assert stats["total_tags"] == 7
        assert stats["by_type"]["standard"] == 5
        assert stats["by_type"]["memory"] == 1
        assert stats["by_type"]["expression"] == 1
        assert stats["dependency_edges"] >= 1
