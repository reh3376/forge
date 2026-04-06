"""Tests for the WHK MES adapter -- manifest, lifecycle, collect, subscribe, discover, write."""

from __future__ import annotations

import pytest

from forge.adapters.whk_mes.adapter import WhkMesAdapter
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
        adapter = WhkMesAdapter()
        assert adapter.manifest.adapter_id == "whk-mes"

    def test_adapter_name(self):
        adapter = WhkMesAdapter()
        assert "Manufacturing Execution" in adapter.manifest.name

    def test_version(self):
        adapter = WhkMesAdapter()
        assert adapter.manifest.version == "0.1.0"

    def test_type(self):
        adapter = WhkMesAdapter()
        assert adapter.manifest.type == "INGESTION"

    def test_protocol(self):
        adapter = WhkMesAdapter()
        assert adapter.manifest.protocol == "graphql+amqp+mqtt"

    def test_tier(self):
        adapter = WhkMesAdapter()
        assert adapter.manifest.tier == AdapterTier.MES_MOM

    def test_capabilities_read(self):
        adapter = WhkMesAdapter()
        assert adapter.manifest.capabilities.read is True

    def test_capabilities_write(self):
        adapter = WhkMesAdapter()
        assert adapter.manifest.capabilities.write is True

    def test_capabilities_subscribe(self):
        adapter = WhkMesAdapter()
        assert adapter.manifest.capabilities.subscribe is True

    def test_capabilities_backfill(self):
        adapter = WhkMesAdapter()
        assert adapter.manifest.capabilities.backfill is True

    def test_capabilities_discover(self):
        adapter = WhkMesAdapter()
        assert adapter.manifest.capabilities.discover is True

    def test_connection_params_count(self):
        adapter = WhkMesAdapter()
        assert len(adapter.manifest.connection_params) == 18

    def test_required_params(self):
        adapter = WhkMesAdapter()
        required = [p.name for p in adapter.manifest.connection_params if p.required]
        assert "graphql_url" in required
        assert "rabbitmq_url" in required
        assert "azure_tenant_id" in required

    def test_auth_methods(self):
        adapter = WhkMesAdapter()
        assert "azure_entra_id" in adapter.manifest.auth_methods
        assert "certificate" in adapter.manifest.auth_methods

    def test_data_contract_schema_ref(self):
        adapter = WhkMesAdapter()
        assert adapter.manifest.data_contract.schema_ref == "forge://schemas/whk-mes/v0.1.0"

    def test_data_contract_context_fields(self):
        adapter = WhkMesAdapter()
        fields = adapter.manifest.data_contract.context_fields
        assert "production_order_id" in fields
        assert "batch_id" in fields
        assert "equipment_id" in fields

    def test_health_check_interval(self):
        adapter = WhkMesAdapter()
        assert adapter.manifest.health_check_interval_ms == 15_000


class TestLifecycle:
    """Test adapter state machine transitions."""

    @pytest.mark.asyncio
    async def test_initial_state(self):
        adapter = WhkMesAdapter()
        assert adapter.state == AdapterState.REGISTERED

    @pytest.mark.asyncio
    async def test_configure(self):
        adapter = WhkMesAdapter()
        await adapter.configure(_VALID_CONFIG)
        assert adapter.state == AdapterState.REGISTERED

    @pytest.mark.asyncio
    async def test_start(self):
        adapter = WhkMesAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        assert adapter.state == AdapterState.HEALTHY

    @pytest.mark.asyncio
    async def test_start_without_configure_raises(self):
        adapter = WhkMesAdapter()
        with pytest.raises(RuntimeError, match="not configured"):
            await adapter.start()

    @pytest.mark.asyncio
    async def test_stop(self):
        adapter = WhkMesAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        await adapter.stop()
        assert adapter.state == AdapterState.STOPPED

    @pytest.mark.asyncio
    async def test_health(self):
        adapter = WhkMesAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        health = await adapter.health()
        assert health.adapter_id == "whk-mes"
        assert health.state == AdapterState.HEALTHY

    @pytest.mark.asyncio
    async def test_health_tracks_records(self):
        adapter = WhkMesAdapter()
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
        adapter = WhkMesAdapter()
        records = [r async for r in adapter.collect()]
        assert records == []

    @pytest.mark.asyncio
    async def test_yields_records(self):
        adapter = WhkMesAdapter()
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
        adapter = WhkMesAdapter()
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
        adapter = WhkMesAdapter()
        sub_id = await adapter.subscribe(
            ["wh.whk01.distillery01.batch"],
            lambda x: None,
        )
        assert isinstance(sub_id, str)
        assert len(sub_id) > 0

    @pytest.mark.asyncio
    async def test_unsubscribe_removes(self):
        adapter = WhkMesAdapter()
        sub_id = await adapter.subscribe(["test"], lambda x: None)
        await adapter.unsubscribe(sub_id)
        assert sub_id not in adapter._subscriptions


class TestDiscovery:
    """Test the DiscoveryProvider mixin."""

    @pytest.mark.asyncio
    async def test_returns_sources(self):
        adapter = WhkMesAdapter()
        sources = await adapter.discover()
        assert len(sources) >= 8

    @pytest.mark.asyncio
    async def test_sources_have_tag_path(self):
        adapter = WhkMesAdapter()
        sources = await adapter.discover()
        for source in sources:
            assert "tag_path" in source
            assert source["tag_path"].startswith("mes.")

    @pytest.mark.asyncio
    async def test_includes_batch(self):
        adapter = WhkMesAdapter()
        sources = await adapter.discover()
        tag_paths = [s["tag_path"] for s in sources]
        assert "mes.graphql.batch" in tag_paths

    @pytest.mark.asyncio
    async def test_includes_mqtt(self):
        adapter = WhkMesAdapter()
        sources = await adapter.discover()
        tag_paths = [s["tag_path"] for s in sources]
        assert any("mqtt" in t for t in tag_paths)


class TestWrite:
    """Test the WritableAdapter mixin (stub mode)."""

    @pytest.mark.asyncio
    async def test_write_stub_returns_false(self):
        adapter = WhkMesAdapter()
        result = await adapter.write("mes.graphql.step_execution", {"action": "start"})
        assert result is False

    @pytest.mark.asyncio
    async def test_write_with_confirm(self):
        adapter = WhkMesAdapter()
        result = await adapter.write(
            "mes.graphql.batch",
            {"status": "COMPLETED"},
            confirm=True,
        )
        assert result is False
