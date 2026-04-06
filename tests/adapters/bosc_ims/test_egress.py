"""Tests for the BOSC IMS egress translation."""

from forge.adapters.bosc_ims.egress import (
    ALLOWED_EGRESS_TAGS,
    ALLOWED_EGRESS_TYPES,
    INTELLIGENCE_TYPES,
    build_egress_record,
    build_intelligence_event,
    should_egress,
    wrap_egress_event,
)

# ── Egress Policy ────────────────────────────────────────────────


class TestEgressPolicy:
    """Verify the adapter's egress policy mirrors the Go core's."""

    def test_allowed_count(self):
        assert len(ALLOWED_EGRESS_TYPES) == 6

    def test_asset_received_allowed(self):
        assert should_egress("TRANSACTION_TYPE_ASSET_RECEIVED") is True

    def test_shipped_allowed(self):
        assert should_egress("TRANSACTION_TYPE_SHIPPED") is True

    def test_disposition_changed_allowed(self):
        assert should_egress("TRANSACTION_TYPE_DISPOSITION_CHANGED") is True

    def test_derived_allowed(self):
        assert should_egress("TRANSACTION_TYPE_DERIVED") is True

    def test_installed_allowed(self):
        assert should_egress("TRANSACTION_TYPE_INSTALLED") is True

    def test_removed_allowed(self):
        assert should_egress("TRANSACTION_TYPE_REMOVED") is True

    def test_quality_check_passed_blocked(self):
        assert should_egress("TRANSACTION_TYPE_QUALITY_CHECK_PASSED") is False

    def test_quality_check_failed_blocked(self):
        assert should_egress("TRANSACTION_TYPE_QUALITY_CHECK_FAILED") is False

    def test_asset_moved_blocked(self):
        assert should_egress("TRANSACTION_TYPE_ASSET_MOVED") is False

    def test_scan_rejected_blocked(self):
        assert should_egress("TRANSACTION_TYPE_SCAN_REJECTED") is False

    def test_notification_sent_blocked(self):
        assert should_egress("TRANSACTION_TYPE_NOTIFICATION_SENT") is False

    def test_none_blocked(self):
        assert should_egress(None) is False

    def test_short_name_allowed(self):
        assert should_egress("ASSET_RECEIVED") is True

    def test_short_name_blocked(self):
        assert should_egress("QUALITY_CHECK_PASSED") is False

    def test_allowed_tags_match_types(self):
        # 6 tags should correspond to 6 types
        assert len(ALLOWED_EGRESS_TAGS) == 6


# ── Egress Event Wrapping ────────────────────────────────────────


class TestWrapEgressEvent:
    """Verify HubEgressEvent envelope construction."""

    def test_wraps_event(self):
        event = {
            "event_id": "evt-001",
            "asset_id": "a1",
            "event_type": "TRANSACTION_TYPE_ASSET_RECEIVED",
        }
        wrapped = wrap_egress_event(
            event,
            spoke_id="bosc_ims_primary",
            spoke_version="0.7.0",
        )
        assert wrapped["spoke_id"] == "bosc_ims_primary"
        assert wrapped["spoke_version"] == "0.7.0"
        assert wrapped["inner_event"] is event
        assert wrapped["event_id"] == "evt-001"
        assert wrapped["emitted_at"] is not None

    def test_preserves_inner_event(self):
        event = {"event_id": "evt-002", "payload": {"quantity": 50}}
        wrapped = wrap_egress_event(
            event,
            spoke_id="spoke-1",
            spoke_version="1.0",
        )
        assert wrapped["inner_event"]["payload"]["quantity"] == 50


# ── Egress Record Builder ────────────────────────────────────────


class TestBuildEgressRecord:
    """Verify ContextualRecord construction from HubEgressEvent."""

    def _make_egress_event(self) -> dict:
        return {
            "event_id": "evt-001",
            "spoke_id": "bosc_ims_primary",
            "spoke_version": "0.7.0",
            "inner_event": {
                "event_id": "evt-001",
                "asset_id": "a1",
                "actor_id": "USR-01",
                "event_type": "TRANSACTION_TYPE_ASSET_RECEIVED",
                "occurred_at": "2026-04-06T14:00:00+00:00",
            },
            "emitted_at": "2026-04-06T14:00:05+00:00",
        }

    def test_source_fields(self):
        record = build_egress_record(
            self._make_egress_event(),
            adapter_id="bosc-ims",
            adapter_version="0.1.0",
        )
        assert record.source.adapter_id == "bosc-ims"
        assert record.source.system == "bosc-ims"
        assert record.source.tag_path == "bosc.egress.asset_received"

    def test_timestamps(self):
        record = build_egress_record(
            self._make_egress_event(),
            adapter_id="bosc-ims",
            adapter_version="0.1.0",
        )
        assert record.timestamp.source_time.year == 2026
        assert record.timestamp.server_time is not None

    def test_lineage(self):
        record = build_egress_record(
            self._make_egress_event(),
            adapter_id="bosc-ims",
            adapter_version="0.1.0",
        )
        chain = record.lineage.transformation_chain
        assert "bosc.v1.HubEgressEvent" in chain
        assert "bosc.v1.TransactionEvent" in chain

    def test_default_context(self):
        record = build_egress_record(
            self._make_egress_event(),
            adapter_id="bosc-ims",
            adapter_version="0.1.0",
        )
        assert record.context.site == "bosc_ims_primary"
        assert record.context.extra["asset_id"] == "a1"

    def test_value_contains_envelope(self):
        record = build_egress_record(
            self._make_egress_event(),
            adapter_id="bosc-ims",
            adapter_version="0.1.0",
        )
        assert "bosc_ims_primary" in record.value.raw
        assert "TRANSACTION_TYPE_ASSET_RECEIVED" in record.value.raw


# ── Intelligence Event Builder ───────────────────────────────────


class TestBuildIntelligenceEvent:
    """Verify HubIntelligenceEvent construction."""

    def test_predictive_logistics(self):
        evt = build_intelligence_event(
            event_id="intel-001",
            target_spoke_id="bosc_ims_primary",
            intelligence_type="PREDICTIVE_LOGISTICS",
            payload={"part_id": "PART-001", "expected_demand": 500},
        )
        assert evt["event_id"] == "intel-001"
        assert evt["target_spoke_id"] == "bosc_ims_primary"
        assert evt["type"] == 1
        assert evt["type_name"] == "PREDICTIVE_LOGISTICS"
        assert evt["payload"]["expected_demand"] == 500
        assert evt["generated_at"] is not None

    def test_vendor_alert(self):
        evt = build_intelligence_event(
            event_id="intel-002",
            target_spoke_id="bosc_ims_primary",
            intelligence_type="VENDOR_ALERT",
            payload={"vendor_id": "SUP-001", "alert": "cert revoked"},
        )
        assert evt["type"] == 2

    def test_global_recall(self):
        evt = build_intelligence_event(
            event_id="intel-003",
            target_spoke_id="bosc_ims_primary",
            intelligence_type="GLOBAL_RECALL",
            payload={"batch_id": "BATCH-001"},
        )
        assert evt["type"] == 3

    def test_unknown_type_defaults_to_zero(self):
        evt = build_intelligence_event(
            event_id="intel-004",
            target_spoke_id="bosc_ims_primary",
            intelligence_type="UNKNOWN_TYPE",
            payload={},
        )
        assert evt["type"] == 0

    def test_intelligence_types_complete(self):
        assert len(INTELLIGENCE_TYPES) == 3
