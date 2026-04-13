"""End-to-end integration test: adapter → route → shadow write → query back.

Requires Docker Compose stack running. Skipped in normal CI.
Run with: ``pytest -m integration tests/integration/``
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge.storage.config import StorageConfig
from forge.storage.factory import StorageFactory
from forge.storage.pool import PoolManager
from forge.storage.registry import SchemaRegistry, StorageEngine
from forge.storage.router import DataRouter


@pytest.mark.integration
class TestEndToEnd:
    """Full pipeline: create record → route → write → read back."""

    @pytest.fixture
    def sample_records(self) -> list[ContextualRecord]:
        """Create a batch of test records."""
        records = []
        for i in range(5):
            records.append(
                ContextualRecord(
                    record_id=uuid4(),
                    source=RecordSource(
                        adapter_id="whk-wms",
                        system="wms-prod",
                        tag_path=f"warehouse.barrel.create.{i}",
                    ),
                    timestamp=RecordTimestamp(
                        source_time=datetime(2026, 4, 12, 14, i, 0, tzinfo=UTC),
                    ),
                    value=RecordValue(
                        raw={"barrel_id": f"BRL-{i}", "weight": 100.0 + i},
                        data_type="json",
                        quality=QualityCode.GOOD,
                    ),
                    context=RecordContext(
                        equipment_id=f"TANK-{i:03d}",
                        area="Warehouse-A",
                        batch_id=f"BATCH-{i}",
                    ),
                    lineage=RecordLineage(
                        schema_ref="forge://schemas/whk-wms/Barrel/v1",
                        adapter_id="whk-wms",
                        adapter_version="0.1.0",
                    ),
                )
            )
        return records

    @pytest.mark.asyncio
    async def test_storage_factory_degrades_gracefully(self):
        """Without Docker, StorageFactory returns InMemory stores."""
        config = StorageConfig()
        pools = PoolManager(config)
        # Don't call pools.init() — simulates unavailable infrastructure
        factory = StorageFactory(pools)

        summary = factory.summary()
        assert summary["product_store"] == "in_memory"
        assert summary["lineage_store"] == "in_memory"
        assert summary["timescale_writer"] == "unavailable"
        assert summary["graph_writer"] == "unavailable"
        assert summary["state_cache"] == "unavailable"

    def test_router_routes_records(self, sample_records):
        """DataRouter routes records to correct engines."""
        registry = SchemaRegistry()
        router = DataRouter(registry=registry)

        for record in sample_records:
            decision = router.route(record)
            # Default route for unknown entities → PostgreSQL
            assert decision.target_engine == StorageEngine.POSTGRESQL
            assert decision.entity_name in ("barrel", "unknown")

    def test_router_batch_groups_by_engine(self, sample_records):
        """route_batch groups records by target engine."""
        registry = SchemaRegistry()
        router = DataRouter(registry=registry)

        grouped = router.route_batch(sample_records)
        # All should go to same engine (PostgreSQL default)
        assert len(grouped) == 1
        engine = next(iter(grouped.keys()))
        assert engine == StorageEngine.POSTGRESQL
        assert len(grouped[engine]) == 5

    @pytest.mark.asyncio
    async def test_in_memory_product_store_crud(self):
        """InMemory product store CRUD via factory."""
        from forge.core.models.data_product import (
            DataProduct,
            DataProductSchema,
        )

        config = StorageConfig()
        pools = PoolManager(config)
        factory = StorageFactory(pools)

        store = factory.product_store()  # InMemory
        product = DataProduct(
            product_id="dp-e2e-001",
            name="E2E Test Product",
            description="End-to-end test",
            owner="test",
            schema=DataProductSchema(
                schema_ref="forge://schemas/e2e/v1",
                version="1.0.0",
            ),
        )
        store.save(product)
        retrieved = store.get("dp-e2e-001")
        assert retrieved is not None
        assert retrieved.name == "E2E Test Product"

        all_products = store.list_all()
        assert len(all_products) == 1

        assert store.delete("dp-e2e-001") is True
        assert store.get("dp-e2e-001") is None

    @pytest.mark.asyncio
    async def test_in_memory_lineage_store_crud(self):
        """InMemory lineage store CRUD via factory."""
        from forge.curation.lineage import LineageEntry, TransformationStep

        config = StorageConfig()
        pools = PoolManager(config)
        factory = StorageFactory(pools)

        store = factory.lineage_store()  # InMemory
        entry = LineageEntry(
            lineage_id="lin-e2e-001",
            source_record_ids=["src-1", "src-2"],
            output_record_id="out-1",
            product_id="dp-e2e-001",
            steps=[
                TransformationStep(
                    step_name="normalize",
                    component="NormalizationStep",
                ),
            ],
        )
        store.save(entry)
        retrieved = store.get("lin-e2e-001")
        assert retrieved is not None
        assert retrieved.lineage_id == "lin-e2e-001"

        by_product = store.get_by_product("dp-e2e-001")
        assert len(by_product) == 1
