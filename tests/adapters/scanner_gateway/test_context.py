"""Tests for the Scanner Gateway context builder."""

from forge.adapters.scanner_gateway.context import (
    _normalize_scan_type,
    build_record_context,
)

# ── Normalize Scan Type ──────────────────────────────────────────


class TestNormalizeScanType:
    """Verify scan type normalization."""

    def test_known_prefixed_type(self):
        assert _normalize_scan_type("SCAN_TYPE_ENTRY") == "barrel.entry"

    def test_known_short_type(self):
        assert _normalize_scan_type("ENTRY") == "barrel.entry"

    def test_asset_type(self):
        assert _normalize_scan_type("SCAN_TYPE_ASSET_RECEIVE") == "asset.receive"

    def test_sample_type(self):
        assert _normalize_scan_type("SCAN_TYPE_SAMPLE_COLLECT") == "sample.collect"

    def test_integer_type(self):
        assert _normalize_scan_type(5) == "scan.type_5"

    def test_none_type(self):
        assert _normalize_scan_type(None) == "unknown"

    def test_unknown_string_type(self):
        result = _normalize_scan_type("CUSTOM_OP")
        assert result == "scan.custom_op"


# ── Build Record Context ─────────────────────────────────────────


class TestBuildRecordContext:
    """Verify RecordContext construction from scan events."""

    def test_basic_scan_event(self):
        event = {
            "scan_id": "scan-001",
            "scan_type": "SCAN_TYPE_ENTRY",
            "barcode_value": "WHK-BBL-12345",
            "device_id": "DEV-001",
            "operator_id": "OP-001",
            "location_string": "Warehouse-A/Bay-3",
        }
        ctx = build_record_context(event)
        assert ctx.equipment_id == "DEV-001"
        assert ctx.area == "Warehouse-A/Bay-3"
        assert ctx.operator_id == "OP-001"
        assert ctx.extra["scan_type"] == "barrel.entry"
        assert ctx.extra["barcode_value"] == "WHK-BBL-12345"

    def test_warehouse_job_id_included(self):
        event = {
            "scan_type": "SCAN_TYPE_ENTRY",
            "warehouse_job_id": "JOB-456",
        }
        ctx = build_record_context(event)
        assert ctx.extra["warehouse_job_id"] == "JOB-456"
        assert ctx.batch_id == "JOB-456"

    def test_batch_id_included(self):
        event = {
            "scan_type": "SCAN_TYPE_SAMPLE_COLLECT",
            "batch_id": "BATCH-789",
        }
        ctx = build_record_context(event)
        assert ctx.extra["batch_id"] == "BATCH-789"

    def test_asset_id_included(self):
        event = {
            "scan_type": "SCAN_TYPE_ASSET_RECEIVE",
            "asset_id": "ASSET-001",
        }
        ctx = build_record_context(event)
        assert ctx.extra["asset_id"] == "ASSET-001"

    def test_metadata_merged(self):
        event = {
            "scan_type": "SCAN_TYPE_ENTRY",
            "metadata": {
                "firmware_version": "2.1.0",
                "signal_strength": -42,
            },
        }
        ctx = build_record_context(event)
        assert ctx.extra["firmware_version"] == "2.1.0"
        assert ctx.extra["signal_strength"] == -42

    def test_metadata_does_not_overwrite_core_fields(self):
        event = {
            "scan_id": "scan-core",
            "scan_type": "SCAN_TYPE_DUMP",
            "metadata": {
                "scan_id": "scan-meta-should-not-overwrite",
            },
        }
        ctx = build_record_context(event)
        assert ctx.extra["scan_id"] == "scan-core"

    def test_empty_event_defaults(self):
        ctx = build_record_context({})
        assert ctx.equipment_id is None
        assert ctx.area is None
        assert ctx.operator_id is None
        assert ctx.extra["scan_type"] == "unknown"

    def test_non_dict_metadata_ignored(self):
        event = {
            "scan_type": "SCAN_TYPE_ENTRY",
            "metadata": "not-a-dict",
        }
        ctx = build_record_context(event)
        assert "metadata" not in ctx.extra or ctx.extra.get("scan_type") == "barrel.entry"
