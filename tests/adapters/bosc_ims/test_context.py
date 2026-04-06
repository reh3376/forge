"""Tests for the BOSC IMS context builder."""


from forge.adapters.bosc_ims.context import (
    _normalize_event_type,
    build_record_context,
)


class TestNormalizeEventType:
    """Test TransactionType → Forge event type normalization."""

    def test_full_enum_name(self):
        assert _normalize_event_type("TRANSACTION_TYPE_ASSET_RECEIVED") == "asset.received"

    def test_shipped(self):
        assert _normalize_event_type("TRANSACTION_TYPE_SHIPPED") == "asset.shipped"

    def test_disposition_changed(self):
        result = _normalize_event_type("TRANSACTION_TYPE_DISPOSITION_CHANGED")
        assert result == "state.disposition_changed"

    def test_quality_passed(self):
        assert _normalize_event_type("TRANSACTION_TYPE_QUALITY_CHECK_PASSED") == "quality.passed"

    def test_removal_initiated(self):
        assert _normalize_event_type("TRANSACTION_TYPE_REMOVAL_INITIATED") == "removal.initiated"

    def test_none_returns_unknown(self):
        assert _normalize_event_type(None) == "unknown"

    def test_unknown_string(self):
        result = _normalize_event_type("SOMETHING_ELSE")
        assert result.startswith("unknown.")


class TestBuildRecordContext:
    """Test building RecordContext from TransactionEvent dicts."""

    def test_basic_event(self):
        event = {
            "event_id": "evt-001",
            "asset_id": "asset-001",
            "actor_id": "user-001",
            "event_type": "TRANSACTION_TYPE_ASSET_RECEIVED",
            "occurred_at": "2026-04-06T14:00:00Z",
        }
        ctx = build_record_context(event)
        assert ctx.operator_id == "user-001"
        assert ctx.extra["asset_id"] == "asset-001"
        assert ctx.extra["event_type"] == "asset.received"

    def test_with_asset_enrichment(self):
        event = {
            "event_id": "evt-002",
            "asset_id": "asset-002",
            "actor_id": "user-002",
            "event_type": "TRANSACTION_TYPE_DISPOSITION_CHANGED",
        }
        asset = {
            "id": "asset-002",
            "current_location_id": "LOC-A1-R3-B7",
            "part_id": "PART-BOLT-001",
            "disposition": "SERVICEABLE",
            "system_state": "ACTIVE",
            "asset_state": "NEW",
        }
        ctx = build_record_context(event, asset=asset)
        assert ctx.area == "LOC-A1-R3-B7"
        assert ctx.batch_id == "PART-BOLT-001"
        assert ctx.extra["disposition"] == "SERVICEABLE"
        assert ctx.extra["system_state"] == "ACTIVE"
        assert ctx.extra["asset_state"] == "NEW"

    def test_security_context_extraction(self):
        event = {
            "event_id": "evt-003",
            "asset_id": "asset-003",
            "actor_id": "user-003",
            "event_type": "TRANSACTION_TYPE_SHIPPED",
            "security_context": {
                "actor_role": "shipping_clerk",
                "source_station_id": "SHIP-STATION-01",
                "source_spoke_id": "bosc_ims_primary",
            },
        }
        ctx = build_record_context(event)
        assert ctx.equipment_id == "SHIP-STATION-01"
        assert ctx.site == "bosc_ims_primary"
        assert ctx.extra["actor_role"] == "shipping_clerk"

    def test_payload_fields_merged_into_extra(self):
        event = {
            "event_id": "evt-004",
            "asset_id": "asset-004",
            "actor_id": "user-004",
            "event_type": "TRANSACTION_TYPE_ASSET_RECEIVED",
            "payload": {
                "part_id": "PART-001",
                "supplier_id": "SUP-001",
                "quantity": 50,
                "unit_of_measure": "EA",
            },
        }
        ctx = build_record_context(event)
        assert ctx.extra["supplier_id"] == "SUP-001"
        assert ctx.extra["quantity"] == 50

    def test_reason_code_in_extra(self):
        event = {
            "event_id": "evt-005",
            "asset_id": "asset-005",
            "actor_id": "user-005",
            "event_type": "TRANSACTION_TYPE_REMOVAL_INITIATED",
            "reason_code": "DEFECTIVE_COMPONENT",
            "reason_description": "Hairline fracture detected during inspection",
        }
        ctx = build_record_context(event)
        assert ctx.extra["reason_code"] == "DEFECTIVE_COMPONENT"
        assert ctx.extra["reason_description"] == "Hairline fracture detected during inspection"

    def test_empty_event_minimal_context(self):
        ctx = build_record_context({})
        assert ctx.operator_id is None
        assert ctx.extra["event_type"] == "unknown"
