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


# ---------------------------------------------------------------------------
# Control runtime composition (FB-065)
# ---------------------------------------------------------------------------


class TestControlComposition:
    SP = "WH/WHK01/Cooker01/TIT_2010/SP"

    def _control_doc(self):
        return {
            "mqtt": {"mode": "none"},
            "write_tags": [
                {"tag_path": self.SP, "data_type": "FLOAT", "min_value": 0, "max_value": 212}
            ],
            "permissions": [{"area_pattern": "*", "tag_pattern": "*", "min_role": "ENGINEER"}],
        }

    class _Plc:
        def __init__(self):
            self.values = {}

        async def write_tag(self, path, value):
            self.values[path] = value

        async def read_tag(self, path):
            return self.values.get(path)

    @pytest.mark.asyncio
    async def test_control_config_without_dependencies_is_rejected(self, adapter):
        with pytest.raises(ValueError, match="ControlDependencies"):
            await adapter.configure({"control_config": self._control_doc()})

    @pytest.mark.asyncio
    async def test_control_runtime_follows_the_adapter_lifecycle(self, mock_registry):
        from forge.modules.ot.control import ControlDependencies

        plc = self._Plc()
        adapter = OTModuleAdapter(
            registry=mock_registry,
            control=ControlDependencies(write_dispatcher=AsyncMock(), tag_io=plc),
        )
        assert adapter.control_runtime is None
        await adapter.configure({"control_config": self._control_doc()})
        runtime = adapter.control_runtime
        assert runtime is not None and not runtime.started
        assert runtime.config.describe()["write_tags"] == 1

        await adapter.start()
        assert runtime.started and adapter.state == AdapterState.HEALTHY
        await adapter.stop()
        assert not runtime.started and adapter.state == AdapterState.STOPPED

    @pytest.mark.asyncio
    async def test_control_config_path_is_loaded(self, mock_registry, tmp_path):
        import json

        from forge.modules.ot.control import ControlDependencies

        path = tmp_path / "ot.json"
        path.write_text(json.dumps(self._control_doc()), encoding="utf-8")
        adapter = OTModuleAdapter(
            registry=mock_registry,
            control=ControlDependencies(write_dispatcher=AsyncMock(), tag_io=self._Plc()),
        )
        await adapter.configure({"control_config_path": str(path)})
        assert adapter.control_runtime is not None

    @pytest.mark.asyncio
    async def test_standard_tag_writes_go_through_the_write_engine(self, mock_registry):
        from forge.modules.ot.control import ControlDependencies

        mock_registry.get_definition = AsyncMock(return_value=_make_tag(self.SP))
        plc = self._Plc()
        adapter = OTModuleAdapter(
            registry=mock_registry,
            control=ControlDependencies(write_dispatcher=AsyncMock(), tag_io=plc),
        )
        # No runtime yet: there is no PLC path.
        assert await adapter.write(self.SP, 150.0) is False

        await adapter.configure({"control_config": self._control_doc()})
        assert await adapter.write(self.SP, 150.0) is True
        assert plc.values[self.SP] == 150.0
        # Out of range: rejected by layer 1, nothing reaches the PLC.
        assert await adapter.write(self.SP, 500.0) is False
        assert plc.values[self.SP] == 150.0
        journal = adapter.control_runtime.engine.get_journal()
        assert [row["status"] for row in journal] == ["REJECTED_VALIDATION", "CONFIRMED"]
        assert journal[0]["requestor"] == "forge-ot-module"

    @pytest.mark.asyncio
    async def test_area_rules_configure_the_area_resolver(self, mock_registry):
        adapter = OTModuleAdapter(registry=mock_registry)
        await adapter.configure(
            {"area_rules": [{"pattern": r"WH/WHK01/Cooker01/.*", "area": "Cookhouse", "site": "WH"}]}
        )
        ctx = adapter._enrichment.enrich("WH/WHK01/Cooker01/TIT_2010/SP")
        assert ctx.area == "Cookhouse" and ctx.site == "WH"
