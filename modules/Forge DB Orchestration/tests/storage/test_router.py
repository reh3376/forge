"""Tests for the Forge Data Router."""

import uuid
from datetime import datetime, timezone

from forge.core.models.contextual_record import (
    ContextualRecord,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge.storage.registry import SchemaEntry, SchemaRegistry, StorageEngine
from forge.storage.router import DataRouter


def _make_record(
    system: str = "whk-wms",
    tag_path: str = "wms.barrel.create.123",
    data_type: str = "json",
    entity_type: str | None = None,
) -> ContextualRecord:
    """Create a minimal ContextualRecord for routing tests."""
    extra = {}
    if entity_type:
        extra["entity_type"] = entity_type

    return ContextualRecord(
        record_id=uuid.uuid4(),
        source=RecordSource(
            adapter_id=system,
            system=system,
            tag_path=tag_path,
            connection_id="conn-001",
        ),
        timestamp=RecordTimestamp(
            source_time=datetime(2026, 4, 7, 12, 0, tzinfo=timezone.utc),
            server_time=datetime(2026, 4, 7, 12, 0, tzinfo=timezone.utc),
            ingestion_time=datetime(2026, 4, 7, 12, 0, tzinfo=timezone.utc),
        ),
        value=RecordValue(raw="{}", data_type=data_type),
        context=RecordContext(
            equipment_id="EQ-001",
            area="Warehouse-A",
            extra=extra,
        ),
        lineage=RecordLineage(
            adapter_id=system,
            adapter_version="1.0.0",
            schema_ref=f"forge://schemas/{system}/v1.0.0",
        ),
    )


class TestDataRouter:
    """Verify routing decisions based on registry and defaults."""

    def test_registry_route_takes_priority(self):
        registry = SchemaRegistry()
        registry.register(
            SchemaEntry(
                schema_id="forge://schemas/whk-wms/Barrel/v1.0.0",
                spoke_id="whk-wms",
                entity_name="Barrel",
                version="1.0.0",
                schema_json={"type": "object"},
                authoritative_spoke="whk-wms",
                storage_engine=StorageEngine.POSTGRESQL,
                storage_namespace="spoke_wms",
            )
        )
        router = DataRouter(registry=registry)
        record = _make_record(entity_type="Barrel")
        decision = router.route(record)
        assert decision.target_engine == StorageEngine.POSTGRESQL
        assert decision.target_namespace == "spoke_wms"
        assert "registry:" in decision.reason

    def test_timeseries_default_route(self):
        router = DataRouter(registry=SchemaRegistry())
        record = _make_record(data_type="snmp_metric")
        decision = router.route(record)
        assert decision.target_engine == StorageEngine.TIMESCALEDB
        assert "default_route:" in decision.reason

    def test_graph_default_route(self):
        router = DataRouter(registry=SchemaRegistry())
        record = _make_record(data_type="device_topology")
        decision = router.route(record)
        assert decision.target_engine == StorageEngine.NEO4J

    def test_kafka_default_route(self):
        router = DataRouter(registry=SchemaRegistry())
        record = _make_record(data_type="cdc_event")
        decision = router.route(record)
        assert decision.target_engine == StorageEngine.KAFKA

    def test_fallback_to_postgresql(self):
        router = DataRouter(registry=SchemaRegistry())
        record = _make_record(data_type="json")
        decision = router.route(record)
        assert decision.target_engine == StorageEngine.POSTGRESQL
        assert "fallback:" in decision.reason

    def test_entity_name_from_context_extra(self):
        router = DataRouter(registry=SchemaRegistry())
        record = _make_record(entity_type="WorkOrder")
        decision = router.route(record)
        assert decision.entity_name == "WorkOrder"

    def test_entity_name_from_tag_path(self):
        router = DataRouter(registry=SchemaRegistry())
        record = _make_record(tag_path="cmms.asset.update.ABC123")
        decision = router.route(record)
        assert decision.entity_name == "asset"

    def test_batch_routing_groups_by_engine(self):
        registry = SchemaRegistry()
        registry.register(
            SchemaEntry(
                schema_id="forge://schemas/whk-wms/Barrel/v1.0.0",
                spoke_id="whk-wms",
                entity_name="Barrel",
                version="1.0.0",
                schema_json={"type": "object"},
                authoritative_spoke="whk-wms",
                storage_engine=StorageEngine.POSTGRESQL,
                storage_namespace="spoke_wms",
            )
        )
        router = DataRouter(registry=registry)

        records = [
            _make_record(entity_type="Barrel"),  # → PG via registry
            _make_record(data_type="snmp_metric"),  # → TimescaleDB
            _make_record(data_type="device_topology"),  # → Neo4j
            _make_record(entity_type="Barrel"),  # → PG via registry
        ]

        grouped = router.route_batch(records)
        assert StorageEngine.POSTGRESQL in grouped
        assert StorageEngine.TIMESCALEDB in grouped
        assert StorageEngine.NEO4J in grouped
        assert len(grouped[StorageEngine.POSTGRESQL]) == 2
        assert len(grouped[StorageEngine.TIMESCALEDB]) == 1
        assert len(grouped[StorageEngine.NEO4J]) == 1

    def test_decision_has_timestamp(self):
        router = DataRouter(registry=SchemaRegistry())
        record = _make_record()
        decision = router.route(record)
        assert decision.decided_at is not None
        assert decision.decided_at.tzinfo is not None
