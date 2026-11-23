"""Tests for OTModuleAdapter — the full-capability OT adapter."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from forge_core.clock import (
    CLOCK_OK,
    CLOCK_OUT_OF_TOLERANCE,
    CLOCK_UNREADABLE,
    ClockGateTransition,
    SourceStampMissingError,
)
from forge_core.models.adapter import AdapterState
from forge_core.models.contextual_record import ContextualRecord
from forge_ot.adapter import OTModuleAdapter
from forge_ot.context.store_forward import StoreForwardBuffer
from forge_ot.opcua_client.types import DataType, QualityCode
from forge_ot.tag_engine.models import (
    MemoryTag,
    StandardTag,
    TagValue,
)

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
    now = datetime.now(tz=UTC)
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
        assert adapter.manifest.adapter_id == "forge-ot"

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
        assert health.adapter_id == "forge-ot"
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
# Fail closed on a connection's clock (FB-093)
# ---------------------------------------------------------------------------


def _transition(previous: str, state: str, cause: str) -> ClockGateTransition:
    return ClockGateTransition("server:WHK01", previous, state, cause, datetime.now(tz=UTC))


class TestClockRefusal:
    @pytest.mark.asyncio
    async def test_a_refused_clock_is_on_the_health_and_stops_collection(self, adapter):
        await adapter.configure({})
        await adapter.start()
        cause = "clock server:WHK01 could not be read for 3 consecutive probes"
        adapter._on_clock_state("WHK01", _transition(CLOCK_OK, CLOCK_UNREADABLE, cause))

        health = await adapter.health()
        assert health.state == AdapterState.DEGRADED
        assert health.refusals == {"clock_unreadable": 1}
        assert health.last_refusal == f"connection 'WHK01': {cause}"
        assert health.error_message == health.last_refusal  # the cause travels on the wire

        # the refused connection delivers nothing, its last values included
        assert [record async for record in adapter.collect()] == []

        # the cause changes while refused: counted under its own cause, still one standing
        other = "clock server:WHK01 is +0.250000 s from Forge's clock after 3 consecutive probes"
        adapter._on_clock_state(
            "WHK01", _transition(CLOCK_UNREADABLE, CLOCK_OUT_OF_TOLERANCE, other)
        )
        health = await adapter.health()
        assert health.refusals == {"clock_unreadable": 1, "clock_out_of_tolerance": 1}
        assert health.last_refusal == f"connection 'WHK01': {other}"

        # three good probes cleared it: healthy again, collecting again, the count kept
        adapter._on_clock_state("WHK01", _transition(CLOCK_OUT_OF_TOLERANCE, CLOCK_OK, "back"))
        health = await adapter.health()
        assert health.state == AdapterState.HEALTHY
        assert health.last_refusal is None and health.error_message is None
        assert health.refusals == {"clock_unreadable": 1, "clock_out_of_tolerance": 1}
        assert len([record async for record in adapter.collect()]) == 1

    @pytest.mark.asyncio
    async def test_recovery_waits_for_every_refused_connection(self, adapter):
        await adapter.configure({})
        await adapter.start()
        adapter._on_clock_state("WHK01", _transition(CLOCK_OK, CLOCK_UNREADABLE, "one"))
        adapter._on_clock_state("WHK02", _transition(CLOCK_OK, CLOCK_UNREADABLE, "two"))
        adapter._on_clock_state("WHK02", _transition(CLOCK_UNREADABLE, CLOCK_OK, "back"))
        health = await adapter.health()
        # WHK01 is still refused: degraded, and the health names the refusal that stands
        assert health.state == AdapterState.DEGRADED
        assert health.last_refusal == "connection 'WHK01': one"
        adapter._on_clock_state("WHK01", _transition(CLOCK_UNREADABLE, CLOCK_OK, "back"))
        assert (await adapter.health()).state == AdapterState.HEALTHY

    @pytest.mark.asyncio
    async def test_a_cleared_clock_does_not_hide_another_refusal(self, adapter):
        await adapter.configure({})
        await adapter.start()
        adapter._on_clock_state("WHK01", _transition(CLOCK_OK, CLOCK_UNREADABLE, "one"))
        # a value without a source stamp is refused meanwhile (FB-088): that refusal stands
        adapter.refuse(
            SourceStampMissingError(
                adapter_id="forge-ot", connection="WHK01", tag_path="WH/WHK01/x"
            )
        )
        adapter._on_clock_state("WHK01", _transition(CLOCK_UNREADABLE, CLOCK_OK, "back"))
        health = await adapter.health()
        assert health.state == AdapterState.DEGRADED
        assert health.last_refusal is not None and "source" in health.last_refusal


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
        from forge_ot.control import ControlDependencies

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

        from forge_ot.control import ControlDependencies

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
        from forge_ot.control import ControlDependencies

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
        assert journal[0]["requestor"] == "forge-ot"

    def test_the_facts_declaration_is_the_default_origin(self, mock_registry):
        """Without a connection-level declaration the manifest's section answers (FB-090)."""
        from forge_ot.tag_engine.models import StandardTag

        adapter = OTModuleAdapter(registry=mock_registry)
        governance = adapter.manifest.time_governance
        assert governance is not None
        assert governance.source_timestamp_origin == "server"
        assert governance.clock_read_method == "opcua-current-time"
        assert governance.tolerance_class == "T0" and governance.fail_closed is True
        assert governance.clock_probe_interval_seconds == 30
        tag = StandardTag(
            path="WH/WHK09/Cooker01/TIT_2010/PV", opcua_node_id="ns=2;s=x", connection_name="WHK09"
        )
        assert adapter.source_timestamp_origin_for(tag) == "server"

    @pytest.mark.asyncio
    async def test_the_connection_spec_declares_the_source_timestamp_origin(self):
        """The control config's connection is the first home of the declaration (FB-094 step 2)."""
        from types import SimpleNamespace

        from forge_ot.control import ControlDependencies
        from forge_ot.tag_engine.models import StandardTag
        from forge_ot.tag_engine.registry import TagRegistry

        adapter = OTModuleAdapter(
            registry=TagRegistry(),
            control=ControlDependencies(
                write_dispatcher=AsyncMock(),
                tag_io=self._Plc(),
                plc_client_factory=lambda spec: SimpleNamespace(name=spec.name),
            ),
        )
        doc = self._control_doc()
        doc["connections"] = [
            {
                "name": "WHK01",
                "endpoint": "opc.tcp://10.0.0.1:4840",
                "source_timestamp_origin": "device",
            },
            {"name": "WHK02", "endpoint": "opc.tcp://10.0.0.2:4840"},
        ]
        doc["connection_poll_seconds"] = 0
        await adapter.configure({"control_config": doc, "source_timestamp_origin": {"*": "forge"}})

        def tag(connection: str) -> StandardTag:
            return StandardTag(
                path=f"WH/{connection}/Cooker01/TIT_2010/PV",
                opcua_node_id="ns=2;s=x",
                connection_name=connection,
            )

        assert adapter.source_timestamp_origin_for(tag("WHK01")) == "device"
        assert adapter.source_timestamp_origin_for(tag("WHK02")) == "forge"  # the params' default
        assert adapter.source_timestamp_origin_for(tag("WHK03")) == "forge"

        # the clock estimate for the correction on entry comes from the manager (FB-094 step 3)
        from forge_core.clock import SERVER_LINK

        assert adapter.clock_estimate_for(tag("WHK01")) is None
        manager = adapter.control_runtime.connections
        manager.offsets.observe(
            "WHK01",
            SERVER_LINK,
            1.5,
            datetime.now(tz=UTC),
            round_trip=0.01,
            clock_id="device:WHK01",
        )
        estimate = adapter.clock_estimate_for(tag("WHK01"))
        assert estimate is not None and estimate.clock_id == "device:WHK01"
        assert estimate.offset_seconds == 1.5
        assert adapter.clock_estimate_for(tag("WHK03")) is None

    @pytest.mark.asyncio
    async def test_area_rules_configure_the_area_resolver(self, mock_registry):
        adapter = OTModuleAdapter(registry=mock_registry)
        await adapter.configure(
            {
                "area_rules": [
                    {"pattern": r"WH/WHK01/Cooker01/.*", "area": "Cookhouse", "site": "WH"}
                ]
            }
        )
        ctx = adapter._enrichment.enrich("WH/WHK01/Cooker01/TIT_2010/SP")
        assert ctx.area == "Cookhouse" and ctx.site == "WH"
