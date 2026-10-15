"""Tests for the Forge MES adapter -- manifest, lifecycle, collect, subscribe, discover, write."""

from __future__ import annotations

import pytest

from forge.adapters.forge_mes.adapter import ForgeMesAdapter
from forge.core.models.adapter import AdapterState, AdapterTier

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

_VALID_CONFIG = {
    "graphql_url": "http://localhost:3000/graphql",
    "rabbitmq_url": "amqp://guest:guest@localhost:5672",
    "azure_tenant_id": "test-tenant",
    "azure_client_id": "test-client",
    "azure_client_secret": "test-secret",
}


class TestManifest:
    """Verify the MES adapter manifest matches the FACTS spec."""

    def test_adapter_id(self):
        adapter = ForgeMesAdapter()
        assert adapter.manifest.adapter_id == "forge-mes"

    def test_adapter_name(self):
        adapter = ForgeMesAdapter()
        assert "Manufacturing Execution" in adapter.manifest.name

    def test_version(self):
        adapter = ForgeMesAdapter()
        assert adapter.manifest.version == "0.1.0"

    def test_type(self):
        adapter = ForgeMesAdapter()
        assert adapter.manifest.type == "INGESTION"

    def test_protocol(self):
        adapter = ForgeMesAdapter()
        assert adapter.manifest.protocol == "graphql+amqp+mqtt"

    def test_tier(self):
        adapter = ForgeMesAdapter()
        assert adapter.manifest.tier == AdapterTier.MES_MOM

    def test_capabilities_read(self):
        adapter = ForgeMesAdapter()
        assert adapter.manifest.capabilities.read is True

    def test_capabilities_write(self):
        adapter = ForgeMesAdapter()
        assert adapter.manifest.capabilities.write is True

    def test_capabilities_subscribe(self):
        adapter = ForgeMesAdapter()
        assert adapter.manifest.capabilities.subscribe is True

    def test_capabilities_backfill(self):
        adapter = ForgeMesAdapter()
        assert adapter.manifest.capabilities.backfill is True

    def test_capabilities_discover(self):
        adapter = ForgeMesAdapter()
        assert adapter.manifest.capabilities.discover is True

    def test_connection_params_count(self):
        adapter = ForgeMesAdapter()
        assert len(adapter.manifest.connection_params) == 19

    def test_required_params(self):
        adapter = ForgeMesAdapter()
        required = [p.name for p in adapter.manifest.connection_params if p.required]
        assert "graphql_url" in required
        assert "rabbitmq_url" in required
        assert "azure_tenant_id" in required

    def test_auth_methods(self):
        adapter = ForgeMesAdapter()
        assert "azure_entra_id" in adapter.manifest.auth_methods
        assert "certificate" in adapter.manifest.auth_methods

    def test_data_contract_schema_ref(self):
        adapter = ForgeMesAdapter()
        assert adapter.manifest.data_contract.schema_ref == "forge://schemas/forge-mes/v0.1.0"

    def test_data_contract_context_fields(self):
        adapter = ForgeMesAdapter()
        fields = adapter.manifest.data_contract.context_fields
        assert "production_order_id" in fields
        assert "batch_id" in fields
        assert "equipment_id" in fields

    def test_health_check_interval(self):
        adapter = ForgeMesAdapter()
        assert adapter.manifest.health_check_interval_ms == 15_000


class TestLifecycle:
    """Test adapter state machine transitions."""

    @pytest.mark.asyncio
    async def test_initial_state(self):
        adapter = ForgeMesAdapter()
        assert adapter.state == AdapterState.REGISTERED

    @pytest.mark.asyncio
    async def test_configure(self):
        adapter = ForgeMesAdapter()
        await adapter.configure(_VALID_CONFIG)
        assert adapter.state == AdapterState.REGISTERED

    @pytest.mark.asyncio
    async def test_start(self):
        adapter = ForgeMesAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        assert adapter.state == AdapterState.HEALTHY

    @pytest.mark.asyncio
    async def test_start_without_configure_raises(self):
        adapter = ForgeMesAdapter()
        with pytest.raises(RuntimeError, match="not configured"):
            await adapter.start()

    @pytest.mark.asyncio
    async def test_stop(self):
        adapter = ForgeMesAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        await adapter.stop()
        assert adapter.state == AdapterState.STOPPED

    @pytest.mark.asyncio
    async def test_health(self):
        adapter = ForgeMesAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        health = await adapter.health()
        assert health.adapter_id == "forge-mes"
        assert health.state == AdapterState.HEALTHY

    @pytest.mark.asyncio
    async def test_health_tracks_records(self):
        adapter = ForgeMesAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([{
            "id": "batch-001",
            "batch_id": "batch-001",
            "timestamp": "2026-04-06T14:30:00Z",
            "source_type": "graphql",
            "entity_type": "Batch",
        }])
        async for _ in adapter.collect():
            pass
        health = await adapter.health()
        assert health.records_collected == 1


class TestCollect:
    """Test the collect() data flow."""

    @pytest.mark.asyncio
    async def test_empty_collect(self):
        adapter = ForgeMesAdapter()
        records = [r async for r in adapter.collect()]
        assert records == []

    @pytest.mark.asyncio
    async def test_yields_records(self):
        adapter = ForgeMesAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([
            {
                "id": "batch-001",
                "batch_id": "batch-001",
                "timestamp": "2026-04-06T14:30:00Z",
                "source_type": "graphql",
                "entity_type": "Batch",
            },
            {
                "id": "batch-002",
                "batch_id": "batch-002",
                "timestamp": "2026-04-06T15:00:00Z",
                "source_type": "graphql",
                "entity_type": "Batch",
            },
        ])
        records = [r async for r in adapter.collect()]
        assert len(records) == 2

    @pytest.mark.asyncio
    async def test_increments_counter(self):
        adapter = ForgeMesAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([{
            "id": "batch-001",
            "batch_id": "batch-001",
            "timestamp": "2026-04-06T14:30:00Z",
            "source_type": "graphql",
            "entity_type": "Batch",
        }])
        async for _ in adapter.collect():
            pass
        assert adapter._records_collected == 1


class TestSubscription:
    """Test the SubscriptionProvider mixin."""

    @pytest.mark.asyncio
    async def test_subscribe_returns_id(self):
        adapter = ForgeMesAdapter()
        sub_id = await adapter.subscribe(
            ["wh.whk01.distillery01.batch"],
            lambda x: None,
        )
        assert isinstance(sub_id, str)
        assert len(sub_id) > 0

    @pytest.mark.asyncio
    async def test_unsubscribe_removes(self):
        adapter = ForgeMesAdapter()
        sub_id = await adapter.subscribe(["test"], lambda x: None)
        await adapter.unsubscribe(sub_id)
        assert sub_id not in adapter._subscriptions


class TestDiscovery:
    """Test the DiscoveryProvider mixin."""

    @pytest.mark.asyncio
    async def test_returns_sources(self):
        adapter = ForgeMesAdapter()
        sources = await adapter.discover()
        assert len(sources) >= 8

    @pytest.mark.asyncio
    async def test_sources_have_tag_path(self):
        adapter = ForgeMesAdapter()
        sources = await adapter.discover()
        for source in sources:
            assert "tag_path" in source
            assert source["tag_path"].startswith("mes.")

    @pytest.mark.asyncio
    async def test_includes_batch(self):
        adapter = ForgeMesAdapter()
        sources = await adapter.discover()
        tag_paths = [s["tag_path"] for s in sources]
        assert "mes.graphql.batch" in tag_paths

    @pytest.mark.asyncio
    async def test_includes_mqtt(self):
        adapter = ForgeMesAdapter()
        sources = await adapter.discover()
        tag_paths = [s["tag_path"] for s in sources]
        assert any("mqtt" in t for t in tag_paths)


class TestWrite:
    """Test the WritableAdapter mixin (refused without a dispatcher, FB-054 with one)."""

    @pytest.mark.asyncio
    async def test_write_stub_returns_false(self):
        adapter = ForgeMesAdapter()
        result = await adapter.write("mes.graphql.step_execution", {"action": "start"})
        assert result is False

    @pytest.mark.asyncio
    async def test_write_goes_through_the_attached_dispatcher(self):
        class FakeOutcome:
            def __init__(self, success):
                self.success = success

        class FakeDispatcher:
            def __init__(self):
                self.calls = []

            async def write(self, adapter_id, tag_path, value, *, confirm=False):
                self.calls.append((adapter_id, tag_path, value, confirm))
                return FakeOutcome(success=tag_path.endswith("cip-complete"))

        adapter = ForgeMesAdapter()
        dispatcher = FakeDispatcher()
        adapter.attach_write_dispatcher(dispatcher)
        ok = await adapter.write(
            "mes.changeover.cooker.cip-complete", {"cipStartTime": "a", "cipEndTime": "b"}
        )
        refused = await adapter.write("mes.changeover.cooker.request", {}, confirm=False)
        assert ok is True and refused is False
        assert dispatcher.calls[0] == (
            "forge-mes",
            "mes.changeover.cooker.cip-complete",
            {"cipStartTime": "a", "cipEndTime": "b"},
            True,
        )
        assert dispatcher.calls[1][3] is False

    @pytest.mark.asyncio
    async def test_write_with_confirm(self):
        adapter = ForgeMesAdapter()
        result = await adapter.write(
            "mes.graphql.batch",
            {"status": "COMPLETED"},
            confirm=True,
        )
        assert result is False
