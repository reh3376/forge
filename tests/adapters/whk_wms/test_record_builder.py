"""Tests for the WMS record builder."""

from datetime import datetime, timezone

from forge.adapters.whk_wms.record_builder import (
    _assess_quality,
    _derive_tag_path,
    _extract_server_time,
    _extract_source_time,
    build_contextual_record,
)
from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
)

# ── Quality Assessment ─────────────────────────────────────────────


class TestAssessQuality:
    """Test data quality assessment heuristics."""

    def test_good_with_id_and_time(self):
        raw = {"barrel_id": "B1", "event_timestamp": "2026-04-06T14:00:00Z"}
        assert _assess_quality(raw) == QualityCode.GOOD

    def test_good_with_id_key(self):
        raw = {"id": "B1", "timestamp": "2026-04-06T14:00:00Z"}
        assert _assess_quality(raw) == QualityCode.GOOD

    def test_uncertain_with_id_only(self):
        raw = {"barrel_id": "B1"}
        assert _assess_quality(raw) == QualityCode.UNCERTAIN

    def test_uncertain_with_time_only(self):
        raw = {"event_timestamp": "2026-04-06T14:00:00Z"}
        assert _assess_quality(raw) == QualityCode.UNCERTAIN

    def test_not_available_empty(self):
        assert _assess_quality({}) == QualityCode.NOT_AVAILABLE

    def test_bad_on_error(self):
        raw = {"barrel_id": "B1", "error": "Connection timeout"}
        assert _assess_quality(raw) == QualityCode.BAD

    def test_bad_on_is_error_flag(self):
        raw = {"barrel_id": "B1", "is_error": True}
        assert _assess_quality(raw) == QualityCode.BAD


# ── Timestamp Extraction ──────────────────────────────────────────


class TestExtractSourceTime:
    """Test source time extraction from raw events."""

    def test_event_timestamp_string(self):
        raw = {"event_timestamp": "2026-04-06T14:30:00+00:00"}
        result = _extract_source_time(raw)
        assert result is not None
        assert result.year == 2026

    def test_timestamp_datetime_object(self):
        dt = datetime(2026, 4, 6, 14, 30, tzinfo=timezone.utc)
        raw = {"timestamp": dt}
        assert _extract_source_time(raw) == dt

    def test_z_suffix_parsing(self):
        raw = {"event_timestamp": "2026-04-06T14:30:00Z"}
        result = _extract_source_time(raw)
        assert result is not None

    def test_none_when_missing(self):
        assert _extract_source_time({}) is None

    def test_created_at_fallback(self):
        raw = {"created_at": "2026-04-06T14:30:00+00:00"}
        assert _extract_source_time(raw) is not None


class TestExtractServerTime:
    """Test server time extraction."""

    def test_server_time_present(self):
        raw = {"server_time": "2026-04-06T14:30:00+00:00"}
        assert _extract_server_time(raw) is not None

    def test_updated_at_fallback(self):
        raw = {"updated_at": "2026-04-06T14:30:00+00:00"}
        assert _extract_server_time(raw) is not None

    def test_none_when_missing(self):
        assert _extract_server_time({}) is None


# ── Tag Path Derivation ───────────────────────────────────────────


class TestDeriveTagPath:
    """Test tag path derivation from raw events."""

    def test_default_graphql(self):
        raw = {"entity_type": "barrel"}
        assert _derive_tag_path(raw) == "wms.graphql.barrel"

    def test_rabbitmq_source(self):
        raw = {"source_type": "rabbitmq", "entity_type": "lot"}
        assert _derive_tag_path(raw) == "wms.rabbitmq.lot"

    def test_record_name_fallback(self):
        raw = {"record_name": "BarrelState"}
        assert _derive_tag_path(raw) == "wms.graphql.barrelstate"

    def test_default_event(self):
        assert _derive_tag_path({}) == "wms.graphql.event"


# ── Full Record Building ──────────────────────────────────────────


class TestBuildContextualRecord:
    """Test full ContextualRecord assembly."""

    def _build(self, raw=None, context=None):
        raw = raw or {
            "barrel_id": "BRL-001",
            "event_timestamp": "2026-04-06T14:30:00+00:00",
            "event_type": "fill",
        }
        context = context or RecordContext()
        return build_contextual_record(
            raw_event=raw,
            context=context,
            adapter_id="whk-wms",
            adapter_version="0.1.0",
        )

    def test_returns_contextual_record(self):
        record = self._build()
        assert isinstance(record, ContextualRecord)

    def test_source_adapter_id(self):
        record = self._build()
        assert record.source.adapter_id == "whk-wms"
        assert record.source.system == "whk-wms"

    def test_lineage_schema_ref(self):
        record = self._build()
        assert record.lineage.schema_ref == "forge://schemas/whk-wms/v0.1.0"
        assert record.lineage.adapter_id == "whk-wms"
        assert record.lineage.adapter_version == "0.1.0"

    def test_value_preserves_raw(self):
        raw = {"barrel_id": "BRL-001", "event_timestamp": "2026-04-06T14:30:00+00:00"}
        record = self._build(raw=raw)
        assert record.value.raw == raw
        assert record.value.data_type == "object"

    def test_timestamp_source_time(self):
        record = self._build()
        assert record.timestamp.source_time is not None
        assert record.timestamp.ingestion_time is not None

    def test_context_passed_through(self):
        ctx = RecordContext(equipment_id="FERM-003", shift="day")
        record = self._build(context=ctx)
        assert record.context.equipment_id == "FERM-003"
        assert record.context.shift == "day"

    def test_record_has_uuid(self):
        record = self._build()
        assert record.record_id is not None

    def test_no_timestamp_uses_now(self):
        raw = {"barrel_id": "BRL-001"}
        record = self._build(raw=raw)
        assert record.timestamp.source_time is not None
