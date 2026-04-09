"""Tests for OTModuleAdapter — the full-capability OT adapter."""

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from forge.core.models.adapter import AdapterState
from forge.core.models.contextual_record import ContextualRecord
from forge.modules.ot.adapter import OTModuleAdapter
from forge.modules.ot.context.resolvers import EnrichmentContext, EnrichmentPipeline
from forge.modules.ot.context.store_forward import StoreForwardBuffer
from forge.modules.ot.tag_engine.models import (
    MemoryTag,
    StandardTag,
    TagValue,
)
from forge.modules.ot.opcua_client.types import DataType, QualityCode


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_tag(path: str = "WH/WHK01/Distillery01/TIT_2010/Out_PV") -> StandardTag:
    return StandardTag(
        path=path,
        data_type=DataType.DOUBLE,
        description="Temperature",
        engineering_units="degF",
        opcua_node_id="ns=2;s=TIT_2010.Out_PV",
        connection_name="WHK01",
    )


def _make_value(val: float = 78.4) -> TagValue:
    now = datetime.now(tz=timezone.utc)
    return TagValue(
        value=val,
        quality=QualityCode.GOOD,
        timestamp=now,
        source_timestamp=now,
    )


@pytest.fixture
def mock_registry():
    """Mock TagRegistry with async methods."""
    reg = MagicMock()
    reg.on_change = AsyncMock()
    reg.get_stats = AsyncMock(return_value={"total": 1})
    reg.list_paths = AsyncMock(return_value=["WH/WHK01/Distillery01/TIT_2010/Out_PV"])
    reg.get_definition = AsyncMock(return_value=_make_tag())
    reg.get_value = AsyncMock(return_value=_make_value())
    reg.update_value = AsyncMock(return_value=True)
    return reg


@pytest.fixture
def adapter(mock_registry):
    return OTModuleAdapter(registry=mock_registry)


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------


class TestManifest:

    def test_manifest_id(self, adapter):
        assert adapter.manifest.adapter_id == "forge-ot-module"

    def test_all_capabilities_enabled(self, adapter):
        caps = adapter.manifest.capabilities
        assert caps.read is True
        assert caps.write is True
        assert caps.subscribe is True
        assert caps.backfill is True
        assert caps.discover is True


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


class TestLifecycle:

    @pytest.mark.asyncio
    async def test_configure_sets_connecting(self, adapter):
        await adapter.configure({})
        assert adapter._state == AdapterState.CONNECTING

    @pytest.mark.asyncio
    async def test_start_sets_healthy(self, adapter):
        await adapter.configure({})
        await adapter.start()
        assert adapter._state == AdapterState.HEALTHY

    @pytest.mark.asyncio
    async def test_stop_sets_stopped(self, adapter, mock_registry):
        await adapter.configure({})
        await adapter.start()
        await adapter.stop()
        assert adapter._state == AdapterState.STOPPED

    @pytest.mark.asyncio
    async def test_health_returns_health(self, adapter):
        await adapter.configure({})
        await adapter.start()
        health = await adapter.health()
        assert health.adapter_id == "forge-ot-module"
        assert health.state == AdapterState.HEALTHY
        assert health.uptime_seconds >= 0


# ---------------------------------------------------------------------------
# Collect
# ---------------------------------------------------------------------------


class TestCollect:

    @pytest.mark.asyncio
    async def test_collect_yields_records(self, adapter):
        records = []
        async for record in adapter.collect():
            records.append(record)
        assert len(records) == 1
        assert isinstance(records[0], ContextualRecord)

    @pytest.mark.asyncio
    async def test_collect_skips_missing_tag(self, adapter, mock_registry):
        mock_registry.get_definition = AsyncMock(return_value=None)
        records = []
        async for record in adapter.collect():
            records.append(record)
        assert len(records) == 0

    @pytest.mark.asyncio
    async def test_collect_increments_counter(self, adapter):
        async for _ in adapter.collect():
            pass
        assert adapter._records_collected == 1


# ---------------------------------------------------------------------------
# Subscribe
# ---------------------------------------------------------------------------


class TestSubscribe:

    @pytest.mark.asyncio
    async def test_subscribe_returns_id(self, adapter):
        sub_id = await adapter.subscribe(
            tags=["WH/WHK01/Distillery01/TIT_2010/Out_PV"],
            callback=AsyncMock(),
        )
        assert sub_id.startswith("ot-sub-")

    @pytest.mark.asyncio
    async def test_unsubscribe_removes(self, adapter):
        sub_id = await adapter.subscribe(tags=["tag/1"], callback=AsyncMock())
        await adapter.unsubscribe(sub_id)
        assert sub_id not in adapter._subscriptions

    @pytest.mark.asyncio
    async def test_unsubscribe_nonexistent_is_noop(self, adapter):
        await adapter.unsubscribe("nonexistent-sub-id")


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------


class TestWrite:

    @pytest.mark.asyncio
    async def test_write_to_memory_tag(self, adapter, mock_registry):
        mem_tag = MemoryTag(
            path="WH/WHK01/Distillery01/Setpoint/Temp",
            data_type=DataType.DOUBLE,
        )
        mock_registry.get_definition = AsyncMock(return_value=mem_tag)
        result = await adapter.write("WH/WHK01/Distillery01/Setpoint/Temp", 80.0)
        assert result is True
        mock_registry.update_value.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_write_to_nonexistent_tag(self, adapter, mock_registry):
        mock_registry.get_definition = AsyncMock(return_value=None)
        result = await adapter.write("nonexistent/tag", 0)
        assert result is False

    @pytest.mark.asyncio
    async def test_write_to_standard_tag_warns(self, adapter, mock_registry):
        """Standard tags are not yet wired — returns False with warning."""
        result = await adapter.write("WH/WHK01/Distillery01/TIT_2010/Out_PV", 78.4)
        assert result is False


# ---------------------------------------------------------------------------
# Discover
# ---------------------------------------------------------------------------


class TestDiscover:

    @pytest.mark.asyncio
    async def test_discover_returns_tag_list(self, adapter):
        tags = await adapter.discover()
        assert len(tags) == 1
        assert tags[0]["tag_path"] == "WH/WHK01/Distillery01/TIT_2010/Out_PV"
        assert "data_type" in tags[0]

    @pytest.mark.asyncio
    async def test_discover_empty_registry(self, adapter, mock_registry):
        mock_registry.list_paths = AsyncMock(return_value=[])
        tags = await adapter.discover()
        assert tags == []


# ---------------------------------------------------------------------------
# Tag change dispatch
# ---------------------------------------------------------------------------


class TestTagChangeDispatch:

    @pytest.mark.asyncio
    async def test_dispatch_to_subscription(self, adapter, mock_registry):
        callback = AsyncMock()
        await adapter.subscribe(
            tags=["WH/WHK01/Distillery01/TIT_2010/Out_PV"],
            callback=callback,
        )
        await adapter._on_tag_change(
            "WH/WHK01/Distillery01/TIT_2010/Out_PV",
            78.4,
            QualityCode.GOOD,
        )
        callback.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_dispatch_skips_unmatched_tag(self, adapter, mock_registry):
        callback = AsyncMock()
        await adapter.subscribe(tags=["other/tag"], callback=callback)
        await adapter._on_tag_change(
            "WH/WHK01/Distillery01/TIT_2010/Out_PV",
            78.4,
            QualityCode.GOOD,
        )
        callback.assert_not_awaited()


# ---------------------------------------------------------------------------
# Hub connectivity / Store-and-forward
# ---------------------------------------------------------------------------


class TestHubConnectivity:

    def test_default_hub_connected(self, adapter):
        assert adapter._hub_connected is True

    def test_set_hub_disconnected(self, adapter):
        adapter.set_hub_connected(False)
        assert adapter._hub_connected is False

    @pytest.mark.asyncio
    async def test_buffer_enqueue_when_disconnected(self, mock_registry, tmp_path):
        buf = StoreForwardBuffer(db_path=tmp_path / "buffer.db")
        buf.open()
        adapter = OTModuleAdapter(registry=mock_registry, buffer=buf)
        adapter.set_hub_connected(False)

        await adapter._on_tag_change(
            "WH/WHK01/Distillery01/TIT_2010/Out_PV",
            78.4,
            QualityCode.GOOD,
        )

        assert buf.pending_count() == 1
        buf.close()

    @pytest.mark.asyncio
    async def test_no_buffer_when_connected(self, mock_registry, tmp_path):
        buf = StoreForwardBuffer(db_path=tmp_path / "buffer.db")
        buf.open()
        adapter = OTModuleAdapter(registry=mock_registry, buffer=buf)
        # hub_connected is True by default

        await adapter._on_tag_change(
            "WH/WHK01/Distillery01/TIT_2010/Out_PV",
            78.4,
            QualityCode.GOOD,
        )

        assert buf.pending_count() == 0
        buf.close()

    @pytest.mark.asyncio
    async def test_flush_buffer(self, mock_registry, tmp_path):
        buf = StoreForwardBuffer(db_path=tmp_path / "buffer.db", batch_size=100)
        buf.open()
        adapter = OTModuleAdapter(registry=mock_registry, buffer=buf)
        adapter.set_hub_connected(False)

        # Generate a buffered record
        await adapter._on_tag_change(
            "WH/WHK01/Distillery01/TIT_2010/Out_PV",
            78.4,
            QualityCode.GOOD,
        )
        assert buf.pending_count() == 1

        sent = []

        async def mock_send(records):
            sent.extend(records)

        adapter.set_hub_connected(True)
        flushed = await adapter.flush_buffer(mock_send)
        assert flushed == 1
        assert buf.pending_count() == 0
        buf.close()
