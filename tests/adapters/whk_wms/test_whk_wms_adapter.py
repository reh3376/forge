"""Tests for the WHK WMS adapter lifecycle and manifest."""

import pytest

from forge.adapters.whk_wms.adapter import WhkWmsAdapter
from forge.core.models.adapter import AdapterState, AdapterTier

# ── Manifest Tests ─────────────────────────────────────────────────


class TestManifest:
    """Verify manifest loads correctly from manifest.json."""

    def test_adapter_id(self):
        assert WhkWmsAdapter.manifest.adapter_id == "whk-wms"

    def test_version(self):
        assert WhkWmsAdapter.manifest.version == "0.1.0"

    def test_type_is_ingestion(self):
        assert WhkWmsAdapter.manifest.type == "INGESTION"

    def test_protocol(self):
        assert WhkWmsAdapter.manifest.protocol == "graphql+amqp"

    def test_tier(self):
        assert WhkWmsAdapter.manifest.tier == AdapterTier.MES_MOM

    def test_capabilities_read_only(self):
        caps = WhkWmsAdapter.manifest.capabilities
        assert caps.read is True
        assert caps.write is False
        assert caps.subscribe is True
        assert caps.backfill is True
        assert caps.discover is True

    def test_connection_params_count(self):
        assert len(WhkWmsAdapter.manifest.connection_params) == 9

    def test_required_params(self):
        required = [
            p.name for p in WhkWmsAdapter.manifest.connection_params if p.required
        ]
        assert sorted(required) == [
            "azure_client_id",
            "azure_client_secret",
            "azure_tenant_id",
            "graphql_url",
            "rabbitmq_url",
        ]

    def test_auth_methods(self):
        assert "azure_entra_id" in WhkWmsAdapter.manifest.auth_methods

    def test_data_contract_schema_ref(self):
        assert WhkWmsAdapter.manifest.data_contract.schema_ref == "forge://schemas/whk-wms/v0.1.0"

    def test_data_contract_context_fields(self):
        fields = WhkWmsAdapter.manifest.data_contract.context_fields
        assert "equipment_id" in fields
        assert "lot_id" in fields


# ── Lifecycle Tests ────────────────────────────────────────────────


_VALID_CONFIG = {
    "graphql_url": "http://localhost:3020/graphql",
    "rabbitmq_url": "amqp://guest:guest@localhost:5672",
    "azure_tenant_id": "test-tenant",
    "azure_client_id": "test-client",
    "azure_client_secret": "test-secret",
}


class TestLifecycle:
    """Verify adapter lifecycle state transitions."""

    @pytest.fixture()
    def adapter(self):
        return WhkWmsAdapter()

    @pytest.mark.asyncio()
    async def test_configure_sets_state(self, adapter):
        await adapter.configure(_VALID_CONFIG)
        assert adapter._state == AdapterState.REGISTERED

    @pytest.mark.asyncio()
    async def test_start_sets_healthy(self, adapter):
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        assert adapter._state == AdapterState.HEALTHY

    @pytest.mark.asyncio()
    async def test_start_without_configure_raises(self, adapter):
        with pytest.raises(RuntimeError, match="not configured"):
            await adapter.start()

    @pytest.mark.asyncio()
    async def test_stop_sets_stopped(self, adapter):
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        await adapter.stop()
        assert adapter._state == AdapterState.STOPPED

    @pytest.mark.asyncio()
    async def test_health_returns_adapter_health(self, adapter):
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        health = await adapter.health()
        assert health.adapter_id == "whk-wms"
        assert health.state == AdapterState.HEALTHY

    @pytest.mark.asyncio()
    async def test_health_tracks_records(self, adapter):
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        health = await adapter.health()
        assert health.records_collected == 0
        assert health.records_failed == 0


# ── Collect Tests ──────────────────────────────────────────────────


class TestCollect:
    """Verify the collect() async generator yields ContextualRecords."""

    async def _make_adapter(self):
        adapter = WhkWmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        return adapter

    @pytest.mark.asyncio()
    async def test_collect_empty(self):
        adapter = await self._make_adapter()
        records = [r async for r in adapter.collect()]
        assert records == []

    @pytest.mark.asyncio()
    async def test_collect_yields_records(self):
        adapter = await self._make_adapter()
        adapter.inject_records([
            {
                "id": "BRL-001",
                "barrel_id": "BRL-001",
                "lot_id": "LOT-001",
                "event_timestamp": "2026-04-06T14:30:00+00:00",
                "event_type": "fill",
                "warehouse": "WH01",
            },
        ])
        records = [r async for r in adapter.collect()]
        assert len(records) == 1
        assert records[0].source.adapter_id == "whk-wms"
        assert records[0].source.system == "whk-wms"

    @pytest.mark.asyncio()
    async def test_collect_increments_counter(self):
        adapter = await self._make_adapter()
        adapter.inject_records([
            {"id": "B1", "barrel_id": "B1", "event_timestamp": "2026-04-06T10:00:00+00:00"},
            {"id": "B2", "barrel_id": "B2", "event_timestamp": "2026-04-06T11:00:00+00:00"},
        ])
        _ = [r async for r in adapter.collect()]
        health = await adapter.health()
        assert health.records_collected == 2


# ── Subscription Tests ─────────────────────────────────────────────


class TestSubscription:
    """Verify subscription management."""

    @pytest.mark.asyncio()
    async def test_subscribe_returns_id(self):
        adapter = WhkWmsAdapter()
        sub_id = await adapter.subscribe(
            tags=["wh.whk01.distillery01.barrel"],
            callback=lambda msg: None,
        )
        assert isinstance(sub_id, str)
        assert len(sub_id) > 0

    @pytest.mark.asyncio()
    async def test_unsubscribe_removes(self):
        adapter = WhkWmsAdapter()
        sub_id = await adapter.subscribe(tags=["test"], callback=lambda m: None)
        assert sub_id in adapter._subscriptions
        await adapter.unsubscribe(sub_id)
        assert sub_id not in adapter._subscriptions


# ── Discovery Tests ────────────────────────────────────────────────


class TestDiscovery:
    """Verify data source discovery."""

    @pytest.mark.asyncio()
    async def test_discover_returns_sources(self):
        adapter = WhkWmsAdapter()
        sources = await adapter.discover()
        assert len(sources) == 6

    @pytest.mark.asyncio()
    async def test_discover_sources_have_tag_path(self):
        adapter = WhkWmsAdapter()
        sources = await adapter.discover()
        for source in sources:
            assert "tag_path" in source
            assert "data_type" in source

    @pytest.mark.asyncio()
    async def test_discover_includes_barrel(self):
        adapter = WhkWmsAdapter()
        sources = await adapter.discover()
        tags = [s["tag_path"] for s in sources]
        assert "wms.graphql.barrel" in tags
