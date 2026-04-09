"""Tests for NMS record builder."""

from __future__ import annotations

from datetime import datetime, timezone

from forge.adapters.whk_nms.context import build_record_context
from forge.adapters.whk_nms.record_builder import build_contextual_record
from forge.core.models.contextual_record import QualityCode


class TestRecordBuilder:
    def test_build_record_device(self):
        raw_device = {
            "id": "dev-001",
            "ip_address": "10.0.0.1",
            "name": "core-router",
            "type": "router",
            "health_status": "healthy",
        }

        context = build_record_context(raw_device, entity_type="network_device", event_type="device_discovery")
        record = build_contextual_record(
            raw_event=raw_device,
            context=context,
            adapter_id="whk-nms",
            adapter_version="0.1.0",
            entity_type="network_device",
            event_type="device_discovery",
        )

        assert record is not None
        assert record.source.adapter_id == "whk-nms"
        assert record.source.system == "whk-nms"
        assert "network_device" in record.source.tag_path
        assert record.value.quality == QualityCode.GOOD
        assert record.value.data_type == "json"

    def test_record_timestamp_source_and_server(self):
        raw_event = {
            "id": "trap-001",
            "device_id": "plc-001",
            "trap_time": "2026-04-07T14:30:00Z",
        }

        context = build_record_context(raw_event, entity_type="network_device", event_type="snmp_trap")
        record = build_contextual_record(
            raw_event=raw_event,
            context=context,
            adapter_id="whk-nms",
            adapter_version="0.1.0",
            entity_type="network_device",
            event_type="snmp_trap",
        )

        assert record.timestamp.source_time is not None
        assert record.timestamp.server_time is not None
        assert record.timestamp.ingestion_time is not None
        assert record.timestamp.source_time.tzinfo is not None
        assert record.timestamp.server_time.tzinfo is not None

    def test_record_tag_path_format(self):
        raw_event = {
            "id": "alert-001",
            "device_id": "switch-01",
        }

        context = build_record_context(raw_event, entity_type="network_device", event_type="infrastructure_alert")
        record = build_contextual_record(
            raw_event=raw_event,
            context=context,
            adapter_id="whk-nms",
            adapter_version="0.1.0",
            entity_type="network_device",
            event_type="infrastructure_alert",
        )

        # Tag path should be: nms.<entity_type>.<event_type>.<entity_id>
        assert "nms." in record.source.tag_path
        assert "network_device" in record.source.tag_path
        assert "infrastructure_alert" in record.source.tag_path

    def test_record_connection_id(self):
        raw_event = {
            "id": "sec-001",
        }

        context = build_record_context(raw_event, entity_type="security_event", event_type="security_event")
        record = build_contextual_record(
            raw_event=raw_event,
            context=context,
            adapter_id="whk-nms",
            adapter_version="0.1.0",
            entity_type="security_event",
            event_type="security_event",
        )

        assert "nms." in record.source.connection_id
        assert "security_event" in record.source.connection_id

    def test_record_lineage_transformation_chain(self):
        raw_event = {
            "id": "spof-001",
        }

        context = build_record_context(raw_event, entity_type="network_device", event_type="spof_detection")
        record = build_contextual_record(
            raw_event=raw_event,
            context=context,
            adapter_id="whk-nms",
            adapter_version="0.1.0",
            entity_type="network_device",
            event_type="spof_detection",
        )

        assert record.lineage.adapter_id == "whk-nms"
        assert record.lineage.adapter_version == "0.1.0"
        assert len(record.lineage.transformation_chain) > 0
        assert "build_record_context" in record.lineage.transformation_chain[1]
        assert "build_contextual_record" in record.lineage.transformation_chain[2]

    def test_record_schema_ref(self):
        raw_event = {"id": "test-001"}

        context = build_record_context(raw_event, entity_type="network_device", event_type="unknown")
        record = build_contextual_record(
            raw_event=raw_event,
            context=context,
            adapter_id="whk-nms",
            adapter_version="0.1.0",
            entity_type="network_device",
            event_type="unknown",
        )

        assert "whk-nms" in record.lineage.schema_ref
        assert "v0.1.0" in record.lineage.schema_ref

    def test_record_context_preserved(self):
        raw_event = {
            "id": "dev-001",
            "ip_address": "10.0.0.1",
            "is_critical": True,
        }

        context = build_record_context(raw_event, entity_type="network_device", event_type="device_discovery")
        record = build_contextual_record(
            raw_event=raw_event,
            context=context,
            adapter_id="whk-nms",
            adapter_version="0.1.0",
            entity_type="network_device",
            event_type="device_discovery",
        )

        assert record.context is context
        assert record.context.extra["device_ip"] == "10.0.0.1"
        assert record.context.extra["is_critical"] is True

    def test_record_raw_value_json(self):
        raw_event = {
            "id": "test-001",
            "name": "Test Device",
            "complex": {"nested": "value"},
        }

        context = build_record_context(raw_event, entity_type="network_device", event_type="unknown")
        record = build_contextual_record(
            raw_event=raw_event,
            context=context,
            adapter_id="whk-nms",
            adapter_version="0.1.0",
            entity_type="network_device",
            event_type="unknown",
        )

        assert record.value.raw is not None
        assert '"id": "test-001"' in record.value.raw
        assert '"name": "Test Device"' in record.value.raw
        assert "nested" in record.value.raw

    def test_record_missing_id_uses_ip(self):
        raw_event = {
            # no id
            "ip_address": "10.0.0.1",
        }

        context = build_record_context(raw_event, entity_type="network_device", event_type="unknown")
        record = build_contextual_record(
            raw_event=raw_event,
            context=context,
            adapter_id="whk-nms",
            adapter_version="0.1.0",
            entity_type="network_device",
            event_type="unknown",
        )

        assert "10.0.0.1" in record.source.tag_path

    def test_record_missing_timestamp_defaults_to_now(self):
        raw_event = {"id": "test-001"}
        # no timestamp field

        context = build_record_context(raw_event, entity_type="network_device", event_type="unknown")
        record = build_contextual_record(
            raw_event=raw_event,
            context=context,
            adapter_id="whk-nms",
            adapter_version="0.1.0",
            entity_type="network_device",
            event_type="unknown",
        )

        # Should have current timestamp
        assert record.timestamp.source_time is not None
        now = datetime.now(tz=timezone.utc)
        # Allow some time difference
        time_diff = abs((now - record.timestamp.source_time).total_seconds())
        assert time_diff < 5  # within 5 seconds
