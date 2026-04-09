"""Tests for MES record builder -- quality assessment, timestamps, tag paths."""

from __future__ import annotations

from datetime import UTC, datetime

from forge.adapters.whk_mes.record_builder import (
    _assess_quality,
    _derive_tag_path,
    _extract_server_time,
    _extract_source_time,
    build_contextual_record,
)
from forge.core.models.contextual_record import QualityCode, RecordContext


class TestAssessQuality:
    """Test MES-specific quality assessment."""

    def test_good_batch_with_time(self):
        raw = {"batch_id": "B-001", "timestamp": "2026-04-06T14:30:00Z"}
        assert _assess_quality(raw) == QualityCode.GOOD

    def test_good_production_order_with_time(self):
        raw = {"productionOrderId": "PRO-001", "createdAt": "2026-04-06T14:30:00Z"}
        assert _assess_quality(raw) == QualityCode.GOOD

    def test_good_equipment_with_time(self):
        raw = {"equipmentId": "EQ-01", "eventTimestamp": "2026-04-06T14:30:00Z"}
        assert _assess_quality(raw) == QualityCode.GOOD

    def test_good_lot_with_time(self):
        raw = {"lotId": "LOT-001", "timestamp": "2026-04-06T14:30:00Z"}
        assert _assess_quality(raw) == QualityCode.GOOD

    def test_good_generic_id_with_time(self):
        raw = {"id": "some-id", "created_at": "2026-04-06T14:30:00Z"}
        assert _assess_quality(raw) == QualityCode.GOOD

    def test_uncertain_id_only(self):
        raw = {"batch_id": "B-001"}
        assert _assess_quality(raw) == QualityCode.UNCERTAIN

    def test_uncertain_time_only(self):
        raw = {"timestamp": "2026-04-06T14:30:00Z"}
        assert _assess_quality(raw) == QualityCode.UNCERTAIN

    def test_not_available_empty(self):
        assert _assess_quality({}) == QualityCode.NOT_AVAILABLE

    def test_bad_error_flag(self):
        raw = {"batch_id": "B-001", "error": True}
        assert _assess_quality(raw) == QualityCode.BAD

    def test_bad_is_error_flag(self):
        raw = {"batch_id": "B-001", "is_error": True}
        assert _assess_quality(raw) == QualityCode.BAD

    def test_bad_camel_case_error(self):
        raw = {"batch_id": "B-001", "isError": True}
        assert _assess_quality(raw) == QualityCode.BAD


class TestExtractSourceTime:
    """Test source time extraction from MES events."""

    def test_event_timestamp_string(self):
        raw = {"event_timestamp": "2026-04-06T14:30:00Z"}
        result = _extract_source_time(raw)
        assert result is not None
        assert result.year == 2026

    def test_event_timestamp_camel(self):
        raw = {"eventTimestamp": "2026-04-06T14:30:00Z"}
        result = _extract_source_time(raw)
        assert result is not None

    def test_timestamp_field(self):
        raw = {"timestamp": "2026-04-06T15:00:00+00:00"}
        result = _extract_source_time(raw)
        assert result is not None

    def test_created_at_field(self):
        raw = {"createdAt": "2026-04-06T15:00:00Z"}
        result = _extract_source_time(raw)
        assert result is not None

    def test_started_at_field(self):
        raw = {"startedAt": "2026-04-06T15:00:00Z"}
        result = _extract_source_time(raw)
        assert result is not None

    def test_datetime_object(self):
        ts = datetime(2026, 4, 6, 14, 30, tzinfo=UTC)
        raw = {"timestamp": ts}
        assert _extract_source_time(raw) == ts

    def test_none_when_missing(self):
        assert _extract_source_time({}) is None

    def test_invalid_string(self):
        raw = {"timestamp": "not-a-date"}
        assert _extract_source_time(raw) is None


class TestExtractServerTime:
    """Test server time extraction."""

    def test_updated_at(self):
        raw = {"updatedAt": "2026-04-06T15:00:00Z"}
        result = _extract_server_time(raw)
        assert result is not None

    def test_server_time(self):
        raw = {"server_time": "2026-04-06T15:00:00Z"}
        result = _extract_server_time(raw)
        assert result is not None

    def test_none_when_missing(self):
        assert _extract_server_time({}) is None


class TestDeriveTagPath:
    """Test tag path derivation for MES."""

    def test_graphql_batch(self):
        raw = {"source_type": "graphql", "entity_type": "Batch"}
        assert _derive_tag_path(raw) == "mes.graphql.batch"

    def test_mqtt_equipment(self):
        raw = {"source_type": "mqtt", "entityType": "EquipmentStateTransition"}
        assert _derive_tag_path(raw) == "mes.mqtt.equipmentstatetransition"

    def test_rabbitmq_event(self):
        raw = {"source_type": "rabbitmq", "recordName": "ProductionOrder"}
        assert _derive_tag_path(raw) == "mes.rabbitmq.productionorder"

    def test_default_source_type(self):
        raw = {"entity_type": "StepExecution"}
        assert _derive_tag_path(raw) == "mes.graphql.stepexecution"

    def test_default_entity_type(self):
        raw = {}
        assert _derive_tag_path(raw) == "mes.graphql.event"


class TestBuildContextualRecord:
    """Test full ContextualRecord assembly."""

    def _make_context(self, **overrides):
        defaults = {
            "equipment_id": "EQ-001",
            "batch_id": "B-001",
            "shift": "day",
            "extra": {"production_order_id": "PRO-001", "event_type": "batch.started"},
        }
        defaults.update(overrides)
        return RecordContext(**defaults)

    def test_record_has_source(self):
        raw = {"batch_id": "B-001", "timestamp": "2026-04-06T14:30:00Z"}
        ctx = self._make_context()
        record = build_contextual_record(
            raw_event=raw, context=ctx, adapter_id="whk-mes", adapter_version="0.1.0",
        )
        assert record.source.adapter_id == "whk-mes"
        assert record.source.system == "whk-mes"

    def test_record_has_lineage(self):
        raw = {"batch_id": "B-001", "timestamp": "2026-04-06T14:30:00Z"}
        ctx = self._make_context()
        record = build_contextual_record(
            raw_event=raw, context=ctx, adapter_id="whk-mes", adapter_version="0.1.0",
        )
        assert record.lineage.schema_ref == "forge://schemas/whk-mes/v0.1.0"
        assert record.lineage.adapter_version == "0.1.0"

    def test_record_has_timestamps(self):
        raw = {"batch_id": "B-001", "timestamp": "2026-04-06T14:30:00Z"}
        ctx = self._make_context()
        record = build_contextual_record(
            raw_event=raw, context=ctx, adapter_id="whk-mes", adapter_version="0.1.0",
        )
        assert record.timestamp.source_time is not None
        assert record.timestamp.ingestion_time is not None

    def test_record_has_value(self):
        raw = {"batch_id": "B-001", "timestamp": "2026-04-06T14:30:00Z"}
        ctx = self._make_context()
        record = build_contextual_record(
            raw_event=raw, context=ctx, adapter_id="whk-mes", adapter_version="0.1.0",
        )
        assert record.value.raw == raw
        assert record.value.data_type == "object"

    def test_record_quality_good(self):
        raw = {"batch_id": "B-001", "timestamp": "2026-04-06T14:30:00Z"}
        ctx = self._make_context()
        record = build_contextual_record(
            raw_event=raw, context=ctx, adapter_id="whk-mes", adapter_version="0.1.0",
        )
        assert record.value.quality == QualityCode.GOOD

    def test_record_context_passed_through(self):
        raw = {"batch_id": "B-001", "timestamp": "2026-04-06T14:30:00Z"}
        ctx = self._make_context(lot_id="LOT-001")
        record = build_contextual_record(
            raw_event=raw, context=ctx, adapter_id="whk-mes", adapter_version="0.1.0",
        )
        assert record.context.lot_id == "LOT-001"

    def test_record_tag_path(self):
        raw = {
            "batch_id": "B-001",
            "timestamp": "2026-04-06T14:30:00Z",
            "source_type": "graphql",
            "entity_type": "Batch",
        }
        ctx = self._make_context()
        record = build_contextual_record(
            raw_event=raw, context=ctx, adapter_id="whk-mes", adapter_version="0.1.0",
        )
        assert record.source.tag_path == "mes.graphql.batch"

    def test_record_with_server_time(self):
        raw = {
            "batch_id": "B-001",
            "timestamp": "2026-04-06T14:30:00Z",
            "updatedAt": "2026-04-06T14:31:00Z",
        }
        ctx = self._make_context()
        record = build_contextual_record(
            raw_event=raw, context=ctx, adapter_id="whk-mes", adapter_version="0.1.0",
        )
        assert record.timestamp.server_time is not None
