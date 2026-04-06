"""Tests for the BOSC IMS adapter lifecycle, manifest, and data flow."""

import pytest

from forge.adapters.bosc_ims.adapter import BoscImsAdapter
from forge.core.models.adapter import AdapterState, AdapterTier

# ── Manifest Tests ─────────────────────────────────────────────────


class TestManifest:
    """Verify manifest loads correctly from manifest.json."""

    def test_adapter_id(self):
        assert BoscImsAdapter.manifest.adapter_id == "bosc-ims"

    def test_version(self):
        assert BoscImsAdapter.manifest.version == "0.1.0"

    def test_type_is_ingestion(self):
        assert BoscImsAdapter.manifest.type == "INGESTION"

    def test_protocol_is_grpc(self):
        assert BoscImsAdapter.manifest.protocol == "grpc+protobuf"

    def test_tier(self):
        assert BoscImsAdapter.manifest.tier == AdapterTier.MES_MOM

    def test_capabilities(self):
        caps = BoscImsAdapter.manifest.capabilities
        assert caps.read is True
        assert caps.write is False
        assert caps.subscribe is True
        assert caps.backfill is True
        assert caps.discover is True

    def test_connection_params_count(self):
        assert len(BoscImsAdapter.manifest.connection_params) == 9

    def test_required_params(self):
        required = [
            p.name
            for p in BoscImsAdapter.manifest.connection_params
            if p.required
        ]
        assert sorted(required) == ["grpc_host", "grpc_port", "spoke_id"]

    def test_auth_methods(self):
        assert "mtls" in BoscImsAdapter.manifest.auth_methods

    def test_data_contract_schema_ref(self):
        assert (
            BoscImsAdapter.manifest.data_contract.schema_ref
            == "forge://schemas/bosc-ims/v0.1.0"
        )

    def test_data_contract_context_fields(self):
        fields = BoscImsAdapter.manifest.data_contract.context_fields
        assert "asset_id" in fields
        assert "event_type" in fields
        assert "disposition" in fields

    def test_metadata_proto_package(self):
        assert BoscImsAdapter.manifest.metadata["proto_package"] == "bosc.v1"

    def test_metadata_grpc_service_count(self):
        assert BoscImsAdapter.manifest.metadata["grpc_service_count"] == 7


# ── Lifecycle Tests ────────────────────────────────────────────────


_VALID_CONFIG = {
    "grpc_host": "localhost",
    "grpc_port": 50050,
    "spoke_id": "bosc_ims_primary",
}


class TestLifecycle:
    """Verify adapter lifecycle state transitions."""

    @pytest.fixture()
    def adapter(self):
        return BoscImsAdapter()

    @pytest.mark.asyncio()
    async def test_initial_state_is_registered(self, adapter):
        assert adapter._state == AdapterState.REGISTERED

    @pytest.mark.asyncio()
    async def test_configure_sets_state(self, adapter):
        await adapter.configure(_VALID_CONFIG)
        assert adapter._state == AdapterState.REGISTERED

    @pytest.mark.asyncio()
    async def test_configure_stores_config(self, adapter):
        await adapter.configure(_VALID_CONFIG)
        assert adapter._config is not None
        assert adapter._config.target == "localhost:50050"

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
        assert health.adapter_id == "bosc-ims"
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
        adapter = BoscImsAdapter()
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
                "event_id": "evt-001",
                "asset_id": "clxyz123abc456def789",
                "actor_id": "USR-RECV-01",
                "event_type": "TRANSACTION_TYPE_ASSET_RECEIVED",
                "occurred_at": "2026-04-06T14:30:00+00:00",
                "schema_version": "1.0",
                "security_context": {
                    "actor_role": "receiving_technician",
                    "source_station_id": "RECV-01",
                    "source_spoke_id": "bosc_ims_primary",
                },
                "payload": {
                    "part_id": "PART-001",
                    "supplier_id": "SUP-001",
                    "quantity": 50,
                    "unit_of_measure": "EA",
                },
            },
        ])
        records = [r async for r in adapter.collect()]
        assert len(records) == 1
        assert records[0].source.adapter_id == "bosc-ims"
        assert records[0].source.system == "bosc-ims"

    @pytest.mark.asyncio()
    async def test_collect_tag_path_from_event_type(self):
        adapter = await self._make_adapter()
        adapter.inject_records([
            {
                "event_id": "evt-002",
                "asset_id": "asset-002",
                "actor_id": "USR-01",
                "event_type": "TRANSACTION_TYPE_SHIPPED",
                "occurred_at": "2026-04-06T15:00:00+00:00",
            },
        ])
        records = [r async for r in adapter.collect()]
        assert records[0].source.tag_path == "bosc.event.shipped"

    @pytest.mark.asyncio()
    async def test_collect_increments_counter(self):
        adapter = await self._make_adapter()
        adapter.inject_records([
            {
                "event_id": "evt-01",
                "asset_id": "a1",
                "actor_id": "u1",
                "event_type": "TRANSACTION_TYPE_ASSET_RECEIVED",
                "occurred_at": "2026-04-06T10:00:00+00:00",
            },
            {
                "event_id": "evt-02",
                "asset_id": "a2",
                "actor_id": "u2",
                "event_type": "TRANSACTION_TYPE_SHIPPED",
                "occurred_at": "2026-04-06T11:00:00+00:00",
            },
        ])
        _ = [r async for r in adapter.collect()]
        health = await adapter.health()
        assert health.records_collected == 2

    @pytest.mark.asyncio()
    async def test_collect_record_lineage(self):
        adapter = await self._make_adapter()
        adapter.inject_records([
            {
                "event_id": "evt-03",
                "asset_id": "a3",
                "actor_id": "u3",
                "event_type": "TRANSACTION_TYPE_DISPOSITION_CHANGED",
                "occurred_at": "2026-04-06T12:00:00+00:00",
            },
        ])
        records = [r async for r in adapter.collect()]
        lineage = records[0].lineage
        assert lineage.adapter_id == "bosc-ims"
        assert lineage.adapter_version == "0.1.0"
        assert lineage.schema_ref == "forge://schemas/bosc-ims/v0.1.0"
        assert "bosc.v1.TransactionEvent" in lineage.transformation_chain

    @pytest.mark.asyncio()
    async def test_collect_with_asset_enrichment(self):
        adapter = await self._make_adapter()
        adapter.inject_records([
            {
                "event_id": "evt-04",
                "asset_id": "a4",
                "actor_id": "u4",
                "event_type": "TRANSACTION_TYPE_ASSET_RECEIVED",
                "occurred_at": "2026-04-06T13:00:00+00:00",
                "_asset": {
                    "id": "a4",
                    "current_location_id": "LOC-RECV-01",
                    "part_id": "PART-BOLT-001",
                    "disposition": "QUARANTINED",
                    "system_state": "ACTIVE",
                    "asset_state": "NEW",
                },
            },
        ])
        records = [r async for r in adapter.collect()]
        ctx = records[0].context
        assert ctx.area == "LOC-RECV-01"
        assert ctx.extra["disposition"] == "QUARANTINED"
        assert ctx.extra["system_state"] == "ACTIVE"


# ── Subscription Tests ─────────────────────────────────────────────


class TestSubscription:
    """Verify subscription management."""

    @pytest.mark.asyncio()
    async def test_subscribe_returns_id(self):
        adapter = BoscImsAdapter()
        sub_id = await adapter.subscribe(
            tags=["bosc.event.asset_received"],
            callback=lambda msg: None,
        )
        assert isinstance(sub_id, str)
        assert len(sub_id) > 0

    @pytest.mark.asyncio()
    async def test_unsubscribe_removes(self):
        adapter = BoscImsAdapter()
        sub_id = await adapter.subscribe(
            tags=["bosc.event.shipped"],
            callback=lambda m: None,
        )
        assert sub_id in adapter._subscriptions
        await adapter.unsubscribe(sub_id)
        assert sub_id not in adapter._subscriptions


# ── Discovery Tests ────────────────────────────────────────────────


class TestDiscovery:
    """Verify data source discovery."""

    @pytest.mark.asyncio()
    async def test_discover_returns_sources(self):
        adapter = BoscImsAdapter()
        sources = await adapter.discover()
        assert len(sources) == 16

    @pytest.mark.asyncio()
    async def test_discover_sources_have_tag_path(self):
        adapter = BoscImsAdapter()
        sources = await adapter.discover()
        for source in sources:
            assert "tag_path" in source
            assert "data_type" in source

    @pytest.mark.asyncio()
    async def test_discover_includes_asset_events(self):
        adapter = BoscImsAdapter()
        sources = await adapter.discover()
        tags = [s["tag_path"] for s in sources]
        assert "bosc.event.asset_received" in tags
        assert "bosc.event.shipped" in tags
        assert "bosc.asset.snapshot" in tags

    @pytest.mark.asyncio()
    async def test_discover_includes_entity_sources(self):
        adapter = BoscImsAdapter()
        sources = await adapter.discover()
        tags = [s["tag_path"] for s in sources]
        assert "bosc.catalog.part" in tags
        assert "bosc.supplier" in tags
        assert "bosc.compliance.test_record" in tags
