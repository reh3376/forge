"""Tests for the BOSC IMS record builder."""

import json

from forge.adapters.bosc_ims.context import build_record_context
from forge.adapters.bosc_ims.record_builder import (
    _event_tag_path,
    _parse_timestamp,
    _serialize_payload,
    build_asset_record,
    build_contextual_record,
)
from forge.core.models.contextual_record import QualityCode


class TestParseTimestamp:
    """Test timestamp parsing from various BOSC IMS formats."""

    def test_iso_string(self):
        ts = _parse_timestamp("2026-04-06T14:30:00+00:00")
        assert ts.year == 2026
        assert ts.month == 4
        assert ts.hour == 14

    def test_iso_string_with_z(self):
        ts = _parse_timestamp("2026-04-06T14:30:00Z")
        assert ts.year == 2026

    def test_proto_timestamp_dict(self):
        ts = _parse_timestamp({"seconds": 1775661000, "nanos": 0})
        assert ts.tzinfo is not None

    def test_none_returns_now(self):
        ts = _parse_timestamp(None)
        assert ts.tzinfo is not None

    def test_unix_float(self):
        ts = _parse_timestamp(1775661000.0)
        assert ts.tzinfo is not None


class TestSerializePayload:
    """Test payload serialization to JSON string."""

    def test_dict_payload(self):
        event = {"payload": {"part_id": "P1", "quantity": 50}}
        result = _serialize_payload(event)
        parsed = json.loads(result)
        assert parsed["part_id"] == "P1"

    def test_no_payload(self):
        result = _serialize_payload({})
        assert result == "{}"

    def test_string_payload_passthrough(self):
        event = {"payload": '{"already": "serialized"}'}
        result = _serialize_payload(event)
        assert result == '{"already": "serialized"}'


class TestEventTagPath:
    """Test tag path derivation from event types."""

    def test_asset_received(self):
        event = {"event_type": "TRANSACTION_TYPE_ASSET_RECEIVED"}
        assert _event_tag_path(event) == "bosc.event.asset_received"

    def test_shipped(self):
        event = {"event_type": "TRANSACTION_TYPE_SHIPPED"}
        assert _event_tag_path(event) == "bosc.event.shipped"

    def test_integer_type(self):
        event = {"event_type": 5}
        assert _event_tag_path(event) == "bosc.event.type_5"

    def test_unknown(self):
        event = {}
        assert _event_tag_path(event) == "bosc.event.unknown"


class TestBuildContextualRecord:
    """Test full ContextualRecord construction from events."""

    def _make_event(self, **overrides):
        base = {
            "event_id": "evt-001",
            "asset_id": "asset-001",
            "actor_id": "user-001",
            "event_type": "TRANSACTION_TYPE_ASSET_RECEIVED",
            "occurred_at": "2026-04-06T14:30:00+00:00",
            "schema_version": "1.0",
            "payload": {"part_id": "P1", "quantity": 10},
        }
        base.update(overrides)
        return base

    def test_source_fields(self):
        event = self._make_event()
        ctx = build_record_context(event)
        record = build_contextual_record(
            raw_event=event,
            context=ctx,
            adapter_id="bosc-ims",
            adapter_version="0.1.0",
        )
        assert record.source.adapter_id == "bosc-ims"
        assert record.source.system == "bosc-ims"
        assert record.source.tag_path == "bosc.event.asset_received"
        assert record.source.connection_id == "asset-001"

    def test_timestamp_fields(self):
        event = self._make_event()
        ctx = build_record_context(event)
        record = build_contextual_record(
            raw_event=event,
            context=ctx,
            adapter_id="bosc-ims",
            adapter_version="0.1.0",
        )
        assert record.timestamp.source_time.year == 2026
        assert record.timestamp.ingestion_time is not None

    def test_value_is_json(self):
        event = self._make_event()
        ctx = build_record_context(event)
        record = build_contextual_record(
            raw_event=event,
            context=ctx,
            adapter_id="bosc-ims",
            adapter_version="0.1.0",
        )
        assert record.value.data_type == "json"
        assert record.value.quality == QualityCode.GOOD
        # Value should be a JSON string of the payload
        parsed = json.loads(record.value.raw)
        assert parsed["part_id"] == "P1"

    def test_lineage_chain(self):
        event = self._make_event()
        ctx = build_record_context(event)
        record = build_contextual_record(
            raw_event=event,
            context=ctx,
            adapter_id="bosc-ims",
            adapter_version="0.1.0",
        )
        assert record.lineage.schema_ref == "forge://schemas/bosc-ims/v0.1.0"
        assert "bosc.v1.TransactionEvent" in record.lineage.transformation_chain


class TestBuildAssetRecord:
    """Test ContextualRecord construction from Asset snapshots."""

    def test_asset_snapshot(self):
        asset = {
            "id": "asset-snap-001",
            "current_location_id": "LOC-01",
            "part_id": "PART-01",
            "disposition": "SERVICEABLE",
            "system_state": "ACTIVE",
            "asset_state": "NEW",
            "created_at": "2026-04-01T10:00:00Z",
            "updated_at": "2026-04-06T14:00:00Z",
        }
        record = build_asset_record(
            asset=asset,
            adapter_id="bosc-ims",
            adapter_version="0.1.0",
        )
        assert record.source.tag_path == "bosc.asset.snapshot"
        assert record.source.connection_id == "asset-snap-001"
        assert record.value.data_type == "json"
        assert "bosc.v1.Asset" in record.lineage.transformation_chain

    def test_asset_snapshot_value_contains_state(self):
        asset = {
            "id": "asset-002",
            "disposition": "QUARANTINED",
            "system_state": "SUSPENDED",
            "asset_state": "INSTALLED",
        }
        record = build_asset_record(
            asset=asset,
            adapter_id="bosc-ims",
            adapter_version="0.1.0",
        )
        parsed = json.loads(record.value.raw)
        assert parsed["disposition"] == "QUARANTINED"
        assert parsed["system_state"] == "SUSPENDED"
