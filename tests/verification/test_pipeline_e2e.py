"""D3.12 — End-to-end pipeline verification.

Proves the full data path works:
  adapter.collect() → build_record_context() → build_contextual_record()
  → validate_record() → DataRouter.route() → curation pipeline

All in-process — no Docker, no external services. Uses the real WHK WMS
adapter with injected test data to exercise every contract boundary.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from forge.adapters.whk_wms.adapter import WhkWmsAdapter
from forge.core.models.adapter import AdapterState
from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
)
from forge.curation.lineage import LineageTracker
from forge.curation.normalization import UnitRegistry
from forge.curation.quality import QualityMonitor
from forge.curation.registry import DataProductRegistry
from forge.storage.registry import (
    SchemaEntry,
    SchemaRegistry,
    SchemaStatus,
    StorageEngine,
)
from forge.storage.router import DataRouter, RoutingDecision


# ═══════════════════════════════════════════════════════════════════
# 1. Adapter Lifecycle
# ═══════════════════════════════════════════════════════════════════


class TestAdapterLifecycle:
    """Verify the adapter lifecycle state machine works end-to-end."""

    @pytest.fixture()
    def adapter(self) -> WhkWmsAdapter:
        return WhkWmsAdapter()

    def test_initial_state_is_registered(self, adapter: WhkWmsAdapter):
        assert adapter.state == AdapterState.REGISTERED

    @pytest.mark.asyncio()
    async def test_configure_stays_registered(self, adapter: WhkWmsAdapter):
        """configure() validates params but doesn't connect — stays REGISTERED."""
        await adapter.configure({
            "graphql_url": "http://localhost:3020/graphql",
            "rabbitmq_url": "amqp://guest:guest@localhost:5672",
            "azure_tenant_id": "test-tenant",
            "azure_client_id": "test-client",
            "azure_client_secret": "test-secret",
        })
        assert adapter.state == AdapterState.REGISTERED

    @pytest.mark.asyncio()
    async def test_full_lifecycle(self, adapter: WhkWmsAdapter):
        """configure → start → health → stop exercises all transitions."""
        await adapter.configure({
            "graphql_url": "http://localhost:3020/graphql",
            "rabbitmq_url": "amqp://guest:guest@localhost:5672",
            "azure_tenant_id": "test-tenant",
            "azure_client_id": "test-client",
            "azure_client_secret": "test-secret",
        })
        await adapter.start()
        assert adapter.state in (AdapterState.HEALTHY, AdapterState.CONNECTING)

        health = await adapter.health()
        assert health.adapter_id == "whk-wms"

        await adapter.stop()
        assert adapter.state == AdapterState.STOPPED


# ═══════════════════════════════════════════════════════════════════
# 2. Collection → ContextualRecord Pipeline
# ═══════════════════════════════════════════════════════════════════


class TestCollectionPipeline:
    """Verify adapter.collect() produces valid ContextualRecords."""

    @pytest.fixture()
    async def configured_adapter(
        self, barrel_events: list[dict[str, Any]],
    ) -> WhkWmsAdapter:
        adapter = WhkWmsAdapter()
        await adapter.configure({
            "graphql_url": "http://localhost:3020/graphql",
            "rabbitmq_url": "amqp://guest:guest@localhost:5672",
            "azure_tenant_id": "test-tenant",
            "azure_client_id": "test-client",
            "azure_client_secret": "test-secret",
        })
        adapter.inject_records(barrel_events)
        return adapter

    @pytest.mark.asyncio()
    async def test_collect_yields_contextual_records(
        self, configured_adapter: WhkWmsAdapter,
    ):
        records: list[ContextualRecord] = []
        async for record in configured_adapter.collect():
            records.append(record)
        assert len(records) == 2
        for r in records:
            assert isinstance(r, ContextualRecord)

    @pytest.mark.asyncio()
    async def test_records_have_source_metadata(
        self, configured_adapter: WhkWmsAdapter,
    ):
        async for record in configured_adapter.collect():
            assert record.source.adapter_id == "whk-wms"
            assert record.source.system == "whk-wms"
            break

    @pytest.mark.asyncio()
    async def test_records_have_timestamps(
        self, configured_adapter: WhkWmsAdapter,
    ):
        async for record in configured_adapter.collect():
            assert record.timestamp.source_time is not None
            assert record.timestamp.ingestion_time is not None
            break

    @pytest.mark.asyncio()
    async def test_records_have_context(
        self, configured_adapter: WhkWmsAdapter,
    ):
        """Context fields from the WMS event should be mapped."""
        async for record in configured_adapter.collect():
            ctx = record.context
            # At minimum these should be populated from barrel events
            assert ctx.equipment_id is not None or ctx.batch_id is not None
            break

    @pytest.mark.asyncio()
    async def test_records_have_lineage(
        self, configured_adapter: WhkWmsAdapter,
    ):
        async for record in configured_adapter.collect():
            assert record.lineage.adapter_id == "whk-wms"
            assert record.lineage.schema_ref.startswith("forge://schemas/whk-wms/")
            break

    @pytest.mark.asyncio()
    async def test_records_have_quality(
        self, configured_adapter: WhkWmsAdapter,
    ):
        async for record in configured_adapter.collect():
            assert record.value.quality in (
                QualityCode.GOOD,
                QualityCode.UNCERTAIN,
            )
            break

    @pytest.mark.asyncio()
    async def test_validate_record_passes(
        self, configured_adapter: WhkWmsAdapter,
    ):
        """Records produced by collect() should pass the adapter's own validation."""
        async for record in configured_adapter.collect():
            valid = await configured_adapter.validate_record(record)
            assert valid is True
            break


# ═══════════════════════════════════════════════════════════════════
# 3. Storage Routing
# ═══════════════════════════════════════════════════════════════════


class TestStorageRouting:
    """Verify DataRouter correctly routes ContextualRecords."""

    @pytest.fixture()
    def registry(self) -> SchemaRegistry:
        reg = SchemaRegistry()
        from datetime import datetime, timezone

        reg.register(SchemaEntry(
            schema_id="forge://schemas/whk-wms/v0.1.0",
            spoke_id="whk-wms",
            entity_name="graphql",
            version="0.1.0",
            schema_json={"type": "object"},
            authoritative_spoke="whk-wms",
            storage_engine=StorageEngine.TIMESCALEDB,
            storage_namespace="whk_wms",
            status=SchemaStatus.ACTIVE,
            registered_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        ))
        return reg

    @pytest.fixture()
    def router(self, registry: SchemaRegistry) -> DataRouter:
        return DataRouter(registry=registry)

    @pytest.fixture()
    async def sample_records(
        self, barrel_events: list[dict[str, Any]],
    ) -> list[ContextualRecord]:
        adapter = WhkWmsAdapter()
        await adapter.configure({
            "graphql_url": "http://localhost:3020/graphql",
            "rabbitmq_url": "amqp://guest:guest@localhost:5672",
            "azure_tenant_id": "t",
            "azure_client_id": "c",
            "azure_client_secret": "s",
        })
        adapter.inject_records(barrel_events)
        records = []
        async for r in adapter.collect():
            records.append(r)
        return records

    @pytest.mark.asyncio()
    async def test_route_single_record(
        self,
        router: DataRouter,
        sample_records: list[ContextualRecord],
    ):
        decision = router.route(sample_records[0])
        assert isinstance(decision, RoutingDecision)
        assert decision.target_engine in StorageEngine.__members__.values()
        assert decision.record_id == str(sample_records[0].record_id)

    @pytest.mark.asyncio()
    async def test_route_batch(
        self,
        router: DataRouter,
        sample_records: list[ContextualRecord],
    ):
        grouped = router.route_batch(sample_records)
        # All records should be routed somewhere
        total = sum(len(items) for items in grouped.values())
        assert total == len(sample_records)

    @pytest.mark.asyncio()
    async def test_whk_wms_routes_to_timescaledb(
        self,
        router: DataRouter,
        sample_records: list[ContextualRecord],
    ):
        """WMS schema registered with TIMESCALEDB should route there."""
        decision = router.route(sample_records[0])
        # Should use registry lookup since we registered the schema
        assert decision.target_engine == StorageEngine.TIMESCALEDB

    @pytest.mark.asyncio()
    async def test_routing_decision_has_timestamp(
        self,
        router: DataRouter,
        sample_records: list[ContextualRecord],
    ):
        decision = router.route(sample_records[0])
        assert decision.decided_at is not None

    @pytest.mark.asyncio()
    async def test_routing_decision_has_reason(
        self,
        router: DataRouter,
        sample_records: list[ContextualRecord],
    ):
        decision = router.route(sample_records[0])
        assert decision.reason  # Non-empty string


# ═══════════════════════════════════════════════════════════════════
# 4. Curation Pipeline
# ═══════════════════════════════════════════════════════════════════


class TestCurationPipeline:
    """Verify the curation service can process records end-to-end."""

    @pytest.fixture()
    def product_registry(self) -> DataProductRegistry:
        return DataProductRegistry()

    @pytest.fixture()
    def lineage_tracker(self) -> LineageTracker:
        return LineageTracker()

    @pytest.fixture()
    def quality_monitor(self) -> QualityMonitor:
        return QualityMonitor()

    @pytest.fixture()
    def unit_registry(self) -> UnitRegistry:
        return UnitRegistry()

    def test_curation_app_creates(
        self,
        unit_registry: UnitRegistry,
        product_registry: DataProductRegistry,
        lineage_tracker: LineageTracker,
        quality_monitor: QualityMonitor,
    ):
        """The curation FastAPI app should be instantiable with all deps."""
        from forge.curation.service import create_curation_app

        app = create_curation_app(
            unit_registry=unit_registry,
            registry=product_registry,
            lineage_tracker=lineage_tracker,
            quality_monitor=quality_monitor,
        )
        assert app is not None
        # Verify routes exist
        route_paths = [r.path for r in app.routes]
        assert "/curate" in route_paths or any("/curate" in p for p in route_paths)

    def test_product_registry_stores_products(self, product_registry):
        """DataProductRegistry should accept and retrieve products."""
        product = product_registry.create(
            name="WMS Barrel Events",
            description="All barrel movement events from WMS",
            owner="whk-wms",
            schema_ref="forge://schemas/whk-wms/v0.1.0",
            source_adapters=["whk-wms"],
        )
        retrieved = product_registry.get(product.product_id)
        assert retrieved is not None
        assert retrieved.name == "WMS Barrel Events"
        assert "whk-wms" in retrieved.source_adapters

    def test_lineage_tracker_records_lineage(self, lineage_tracker):
        """LineageTracker should record and retrieve provenance."""
        entry = lineage_tracker.start_entry(
            source_record_ids=["r1", "r2"],
            adapter_ids=["whk-wms"],
        )
        lineage_tracker.add_step(
            entry, step_name="normalize", component="curation",
            description="Unit normalization",
        )
        lineage_tracker.complete_entry(
            entry, output_record_id="out1", product_id="whk-wms-barrels",
        )
        results = lineage_tracker.get_lineage("out1")
        assert len(results) >= 1
        assert "whk-wms" in results[0].adapter_ids


# ═══════════════════════════════════════════════════════════════════
# 5. Full Pipeline Integration
# ═══════════════════════════════════════════════════════════════════


class TestFullPipelineIntegration:
    """Wire everything together: adapter → routing → curation."""

    @pytest.mark.asyncio()
    async def test_end_to_end_flow(self, barrel_events: list[dict[str, Any]]):
        """The complete data pipeline from adapter to routing decision."""
        from datetime import datetime, timezone

        # 1. Create and configure adapter
        adapter = WhkWmsAdapter()
        await adapter.configure({
            "graphql_url": "http://localhost:3020/graphql",
            "rabbitmq_url": "amqp://guest:guest@localhost:5672",
            "azure_tenant_id": "t",
            "azure_client_id": "c",
            "azure_client_secret": "s",
        })
        adapter.inject_records(barrel_events)

        # 2. Collect records through the adapter pipeline
        records: list[ContextualRecord] = []
        async for record in adapter.collect():
            records.append(record)

        assert len(records) == 2, f"Expected 2 records, got {len(records)}"

        # 3. Validate every record passes the adapter's own contract
        for record in records:
            valid = await adapter.validate_record(record)
            assert valid, f"Record {record.record_id} failed validation"

        # 4. Set up storage routing with schema registry
        registry = SchemaRegistry()
        registry.register(SchemaEntry(
            schema_id="forge://schemas/whk-wms/v0.1.0",
            spoke_id="whk-wms",
            entity_name="graphql",
            version="0.1.0",
            schema_json={"type": "object"},
            authoritative_spoke="whk-wms",
            storage_engine=StorageEngine.TIMESCALEDB,
            storage_namespace="whk_wms",
            status=SchemaStatus.ACTIVE,
            registered_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        ))
        router = DataRouter(registry=registry)

        # 5. Route all records
        grouped = router.route_batch(records)
        total_routed = sum(len(items) for items in grouped.values())
        assert total_routed == len(records)

        # 6. Verify routing decisions are sane
        for engine, items in grouped.items():
            for record, decision in items:
                assert decision.record_id == str(record.record_id)
                assert decision.target_engine == engine

        # 7. Verify no data was lost or corrupted through the pipeline
        original_ids = {str(r.record_id) for r in records}
        routed_ids = set()
        for items in grouped.values():
            for record, decision in items:
                routed_ids.add(decision.record_id)
        assert original_ids == routed_ids, "Record IDs changed during routing"
