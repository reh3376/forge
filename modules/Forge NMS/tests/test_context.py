"""Tests for NMS context builder."""

from __future__ import annotations

from forge.adapters.whk_nms.context import build_record_context


class TestDeviceContext:
    def test_device_context_with_all_fields(self):
        raw_device = {
            "id": "dev-001",
            "ip_address": "10.0.0.1",
            "name": "core-router-01",
            "type": "router",
            "role": "gateway",
            "category": "net_core",
            "is_critical": True,
            "is_ot_device": False,
            "location": "data-center-1",
            "health_status": "healthy",
            "poll_tier": "critical",
            "network_role": "upstream",
        }

        context = build_record_context(raw_device, entity_type="network_device", event_type="device_discovery")

        assert context.extra["cross_system_id"] == "dev-001"
        assert context.extra["source_system"] == "whk-nms"
        assert context.extra["entity_type"] == "network_device"
        assert context.extra["event_type"] == "device_discovery"
        assert context.extra["device_ip"] == "10.0.0.1"
        assert context.extra["device_type"] == "router"
        assert context.extra["device_role"] == "gateway"
        assert context.extra["device_category"] == "net_core"
        assert context.extra["is_critical"] is True
        # is_ot_device=False is not added to extra (conditional: if is_ot_device:)
        assert context.extra["location"] == "data-center-1"
        assert context.extra["health_status"] == "healthy"
        assert context.extra["poll_tier"] == "critical"
        assert context.extra["network_role"] == "upstream"

    def test_device_context_minimal_fields(self):
        raw_device = {
            "id": "dev-002",
            "ip_address": "10.0.0.2",
        }

        context = build_record_context(raw_device, entity_type="network_device", event_type="device_discovery")

        assert context.extra["cross_system_id"] == "dev-002"
        assert context.extra["device_ip"] == "10.0.0.2"
        assert "device_name" not in context.extra

    def test_device_context_null_fallback(self):
        raw_device = {
            "id": "dev-003",
            # No ip_address
        }

        context = build_record_context(raw_device, entity_type="network_device", event_type="device_discovery")

        assert context.extra["cross_system_id"] == "dev-003"
        assert "device_ip" not in context.extra


class TestDeviceCategory:
    def test_device_category_explicit(self):
        raw_device = {
            "id": "dev-001",
            "category": "net_core",
        }

        context = build_record_context(raw_device, entity_type="network_device", event_type="device_discovery")

        assert context.extra["device_category"] == "net_core"

    def test_device_category_derived_from_type(self):
        raw_device = {
            "id": "dev-001",
            "type": "plc",
            # no explicit category
        }

        context = build_record_context(raw_device, entity_type="network_device", event_type="device_discovery")

        # Should be derived from type mapping
        assert context.extra["device_category"] == "ot_control"

    def test_device_category_unknown(self):
        raw_device = {
            "id": "dev-001",
            "type": "unknown_device_type",
        }

        context = build_record_context(raw_device, entity_type="network_device", event_type="device_discovery")

        assert context.extra["device_category"] == "unknown"


class TestEventContext:
    def test_trap_event_context(self):
        raw_trap = {
            "id": "trap-001",
            "device_id": "plc-001",
            "device_ip": "10.1.0.50",
            "trap_type": "linkDown",
            "oid": "1.3.6.1.6.3.1.1.5.3",
            "severity": "high",
        }

        context = build_record_context(raw_trap, entity_type="network_device", event_type="snmp_trap")

        assert context.extra["entity_type"] == "network_device"
        assert context.extra["event_type"] == "snmp_trap"
        # device_ip is not in raw_trap as a direct field (it's from device_id lookup)
        assert context.extra.get("severity") == "high"

    def test_security_event_context(self):
        raw_event = {
            "id": "sec-001",
            "device_id": "firewall-01",
            "source_ip": "192.168.1.100",
            "threat_type": "exploit_attempt",
            "severity": "critical",
        }

        context = build_record_context(raw_event, entity_type="security_event", event_type="security_event")

        assert context.extra["entity_type"] == "security_event"
        assert context.extra["event_type"] == "security_event"
        assert context.extra["severity"] == "critical"

    def test_baseline_anomaly_context(self):
        raw_device = {
            "id": "dev-099",
            "ip_address": "10.2.0.99",
            "baseline_status": "suspicious",
        }

        context = build_record_context(raw_device, entity_type="network_device", event_type="baseline_anomaly")

        assert context.extra["baseline_status"] == "suspicious"
        assert context.extra["event_type"] == "baseline_anomaly"


class TestOperationContext:
    def test_operation_context_field(self):
        raw_device = {
            "id": "dev-001",
            "ip_address": "10.0.0.1",
        }

        context = build_record_context(raw_device, entity_type="network_device", event_type="device_discovery")

        assert context.extra["operation_context"] == "network_monitoring"

    def test_area_field(self):
        raw_device = {
            "id": "dev-001",
        }

        context = build_record_context(raw_device, entity_type="network_device", event_type="device_discovery")

        assert context.area == "network_infrastructure"

    def test_site_field(self):
        raw_device = {
            "id": "dev-001",
        }

        context = build_record_context(raw_device, entity_type="network_device", event_type="device_discovery")

        assert context.site == "whk01"


class TestBlastRadius:
    def test_blast_radius_integer(self):
        raw_spof = {
            "id": "spof-001",
            "device_id": "core-switch-01",
            "blast_radius": 45,
        }

        context = build_record_context(raw_spof, entity_type="network_device", event_type="spof_detection")

        assert context.extra["blast_radius"] == 45
        assert isinstance(context.extra["blast_radius"], int)

    def test_blast_radius_string(self):
        raw_spof = {
            "id": "spof-001",
            "device_id": "core-switch-01",
            "blastRadius": "25",  # camelCase, string
        }

        context = build_record_context(raw_spof, entity_type="network_device", event_type="spof_detection")

        assert context.extra["blast_radius"] == 25
        assert isinstance(context.extra["blast_radius"], int)

    def test_blast_radius_missing(self):
        raw_spof = {
            "id": "spof-001",
            "device_id": "core-switch-01",
        }

        context = build_record_context(raw_spof, entity_type="network_device", event_type="spof_detection")

        assert "blast_radius" not in context.extra
