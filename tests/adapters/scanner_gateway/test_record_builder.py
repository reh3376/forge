"""Tests for the Scanner Gateway record builder."""

from datetime import datetime, timezone

from forge.adapters.scanner_gateway.record_builder import (
    _parse_timestamp,
    _scan_tag_path,
    build_contextual_record,
)
from forge.core.models.contextual_record import QualityCode, RecordContext

# ── Parse Timestamp ──────────────────────────────────────────────


class TestParseTimestamp:
    """Verify timestamp parsing from scanner event formats."""

    def test_none_returns_now(self):
        result = _parse_timestamp(None)
        assert result.tzinfo is not None

    def test_iso_string(self):
        result = _parse_timestamp("2026-04-06T14:30:00+00:00")
        assert result.year == 2026
        assert result.month == 4
        assert result.day == 6
        assert result.tzinfo is not None

    def test_iso_string_with_z(self):
        result = _parse_timestamp("2026-04-06T14:30:00Z")
        assert result.year == 2026
        assert result.tzinfo is not None

    def test_proto_timestamp_dict(self):
        result = _parse_timestamp({"seconds": 1775576400, "nanos": 0})
        assert isinstance(result, datetime)
        assert result.tzinfo is not None

    def test_unix_float(self):
        result = _parse_timestamp(1775576400.5)
        assert isinstance(result, datetime)
        assert result.tzinfo is not None

    def test_datetime_passthrough_with_tz(self):
        dt = datetime(2026, 4, 6, 14, 30, tzinfo=timezone.utc)
        result = _parse_timestamp(dt)
        assert result == dt

    def test_naive_datetime_gets_utc(self):
        dt = datetime(2026, 4, 6, 14, 30)
        result = _parse_timestamp(dt)
        assert result.tzinfo == timezone.utc


# ── Scan Tag Path ────────────────────────────────────────────────


class TestScanTagPath:
    """Verify tag path derivation from scan events."""

    def test_prefixed_scan_type(self):
        event = {"scan_type": "SCAN_TYPE_ENTRY"}
        assert _scan_tag_path(event) == "scanner.scan.entry"

    def test_unprefixed_scan_type(self):
        event = {"scan_type": "DUMP"}
        assert _scan_tag_path(event) == "scanner.scan.dump"

    def test_integer_scan_type(self):
        event = {"scan_type": 3}
        assert _scan_tag_path(event) == "scanner.scan.type_3"

    def test_missing_scan_type(self):
        assert _scan_tag_path({}) == "scanner.scan.unknown"


# ── Build Contextual Record ──────────────────────────────────────


class TestBuildContextualRecord:
    """Verify full ContextualRecord construction."""

    def _make_context(self) -> RecordContext:
        return RecordContext(
            equipment_id="DEV-001",
            area="Warehouse-A",
            operator_id="OP-001",
            extra={
                "scan_id": "scan-001",
                "scan_type": "barrel.entry",
                "barcode_value": "WHK-BBL-12345",
                "device_id": "DEV-001",
            },
        )

    def test_source_fields(self):
        record = build_contextual_record(
            scan_event={
                "scan_type": "SCAN_TYPE_ENTRY",
                "device_id": "DEV-001",
                "scanned_at": "2026-04-06T14:30:00+00:00",
            },
            context=self._make_context(),
            adapter_id="scanner-gateway",
            adapter_version="0.1.0",
        )
        assert record.source.adapter_id == "scanner-gateway"
        assert record.source.system == "scanner-gateway"
        assert record.source.tag_path == "scanner.scan.entry"
        assert record.source.connection_id == "DEV-001"

    def test_value_is_json(self):
        record = build_contextual_record(
            scan_event={
                "scan_type": "SCAN_TYPE_DUMP",
                "barcode_value": "WHK-BBL-99999",
                "scanned_at": "2026-04-06T15:00:00+00:00",
            },
            context=self._make_context(),
            adapter_id="scanner-gateway",
            adapter_version="0.1.0",
        )
        assert record.value.data_type == "json"
        assert record.value.quality == QualityCode.GOOD
        assert "WHK-BBL-99999" in record.value.raw

    def test_lineage(self):
        record = build_contextual_record(
            scan_event={
                "scan_type": "SCAN_TYPE_ENTRY",
                "scanned_at": "2026-04-06T14:30:00+00:00",
            },
            context=self._make_context(),
            adapter_id="scanner-gateway",
            adapter_version="0.1.0",
        )
        assert record.lineage.adapter_id == "scanner-gateway"
        assert record.lineage.adapter_version == "0.1.0"
        assert (
            record.lineage.schema_ref
            == "forge://schemas/scanner-gateway/v0.1.0"
        )
        assert "scanner.v1.ScanEvent" in record.lineage.transformation_chain

    def test_timestamps_populated(self):
        record = build_contextual_record(
            scan_event={
                "scan_type": "SCAN_TYPE_ENTRY",
                "scanned_at": "2026-04-06T14:30:00+00:00",
            },
            context=self._make_context(),
            adapter_id="scanner-gateway",
            adapter_version="0.1.0",
        )
        assert record.timestamp.source_time.year == 2026
        assert record.timestamp.server_time is not None
        assert record.timestamp.ingestion_time is not None

    def test_internal_fields_excluded_from_payload(self):
        record = build_contextual_record(
            scan_event={
                "scan_type": "SCAN_TYPE_ENTRY",
                "barcode_value": "BBL-001",
                "_routed_to": ["whk-wms"],
                "scanned_at": "2026-04-06T14:30:00+00:00",
            },
            context=self._make_context(),
            adapter_id="scanner-gateway",
            adapter_version="0.1.0",
        )
        assert "_routed_to" not in record.value.raw
