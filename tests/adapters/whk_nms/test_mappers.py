"""Tests for NMS mappers."""

from __future__ import annotations

from datetime import datetime, timezone

from forge.adapters.whk_nms.mappers import (
    map_device,
    map_trap_event,
    map_alert,
    map_security_event,
    map_baseline_anomaly,
    map_spof_detection,
)
from forge.core.models.manufacturing.enums import UnitStatus, EventSeverity


class TestMapDevice:
    def test_map_device_minimal(self):
        raw_device = {
            "id": "dev-001",
            "ip_address": "10.0.0.1",
            "name": "core-router",
            "type": "router",
            "health_status": "healthy",
        }

        unit = map_device(raw_device)

        assert unit is not None
        assert unit.source_id == "dev-001"
        assert unit.source_system == "whk-nms"
        assert unit.unit_type == "network_device"
        assert unit.status == UnitStatus.ACTIVE

    def test_map_device_with_metadata(self):
        raw_device = {
            "id": "dev-002",
            "ip_address": "10.0.0.2",
            "name": "switch-01",
            "type": "switch",
            "health_status": "healthy",
            "location": "data-center-1",
            "device_metadata": {
                "serial_number": "SN-123456",
                "vendor": "Cisco",
                "model": "Catalyst 9000",
                "mac_address": "00:11:22:33:44:55",
            },
        }

        unit = map_device(raw_device)

        assert unit is not None
        assert unit.serial_number == "SN-123456"
        assert unit.location_id == "data-center-1"
        assert "Cisco" in unit.product_type
        assert "Catalyst 9000" in unit.product_type

    def test_map_device_no_metadata(self):
        raw_device = {
            "id": "dev-003",
            "ip_address": "10.0.0.3",
        }

        unit = map_device(raw_device)

        assert unit is not None
        # Should use IP as fallback serial_number
        assert unit.serial_number == "10.0.0.3" or unit.serial_number is None

    def test_map_device_missing_id(self):
        raw_device = {
            "ip_address": "10.0.0.4",
            # no id
        }

        unit = map_device(raw_device)

        assert unit is None

    def test_map_device_status_healthy(self):
        raw_device = {
            "id": "dev-005",
            "health_status": "healthy",
        }

        unit = map_device(raw_device)

        assert unit.status == UnitStatus.ACTIVE

    def test_map_device_status_degraded(self):
        raw_device = {
            "id": "dev-006",
            "health_status": "degraded",
        }

        unit = map_device(raw_device)

        # Degraded should still be ACTIVE (operational)
        assert unit.status == UnitStatus.ACTIVE

    def test_map_device_status_failed(self):
        raw_device = {
            "id": "dev-007",
            "health_status": "failed",
        }

        unit = map_device(raw_device)

        assert unit.status == UnitStatus.HELD


class TestMapTrapEvent:
    def test_map_trap_event_minimal(self):
        raw_trap = {
            "id": "trap-001",
            "device_id": "plc-001",
            "device_ip": "10.1.0.50",
        }

        event = map_trap_event(raw_trap)

        assert event is not None
        assert event.source_id == "trap-001"
        assert event.source_system == "whk-nms"
        assert event.event_type == "snmp_trap"
        assert event.entity_type == "network_device"
        assert event.entity_id == "plc-001"

    def test_map_trap_event_full(self):
        raw_trap = {
            "id": "trap-001",
            "device_id": "plc-001",
            "device_ip": "10.1.0.50",
            "trap_type": "linkDown",
            "oid": "1.3.6.1.6.3.1.1.5.3",
            "severity": "high",
            "trap_time": "2026-04-07T14:30:00Z",
        }

        event = map_trap_event(raw_trap)

        assert event is not None
        assert event.event_subtype == "linkDown"
        assert event.severity == EventSeverity.ERROR  # "high" maps to ERROR
        assert event.result is not None
        assert "linkDown" in event.result

    def test_map_trap_event_missing_id(self):
        raw_trap = {
            "device_id": "plc-001",
            # no id
        }

        event = map_trap_event(raw_trap)

        assert event is None

    def test_map_trap_event_uses_device_ip_fallback(self):
        raw_trap = {
            "id": "trap-001",
            # no device_id, only device_ip
            "device_ip": "10.1.0.50",
        }

        event = map_trap_event(raw_trap)

        assert event is not None
        assert event.entity_id == "10.1.0.50"


class TestMapAlert:
    def test_map_alert_minimal(self):
        raw_alert = {
            "id": "alert-001",
            "device_id": "switch-01",
        }

        event = map_alert(raw_alert)

        assert event is not None
        assert event.source_id == "alert-001"
        assert event.event_type == "infrastructure_alert"
        assert event.severity == EventSeverity.WARNING  # default medium → WARNING

    def test_map_alert_full(self):
        raw_alert = {
            "id": "alert-001",
            "device_id": "switch-01",
            "device_ip": "10.0.0.2",
            "name": "HighCpuUsage",
            "description": "CPU usage exceeded 85%",
            "condition": "cpu > 85%",
            "severity": "high",
            "alert_time": "2026-04-07T14:35:00Z",
        }

        event = map_alert(raw_alert)

        assert event is not None
        assert event.event_subtype == "HighCpuUsage"
        assert event.severity == EventSeverity.ERROR  # "high" maps to ERROR
        assert event.result is not None  # result should be built from name/description/condition

    def test_map_alert_missing_id(self):
        raw_alert = {
            "device_id": "switch-01",
            # no id
        }

        event = map_alert(raw_alert)

        assert event is None


class TestMapSecurityEvent:
    def test_map_security_event_minimal(self):
        raw_event = {
            "id": "sec-001",
            "device_id": "firewall-01",
        }

        event = map_security_event(raw_event)

        assert event is not None
        assert event.source_id == "sec-001"
        assert event.event_type == "security_event"
        assert event.entity_type == "security_event"

    def test_map_security_event_full(self):
        raw_event = {
            "id": "sec-001",
            "device_id": "firewall-01",
            "source_ip": "192.168.1.100",
            "event_type": "ips_signature_match",
            "threat_type": "exploit_attempt",
            "action": "blocked",
            "severity": "critical",
            "timestamp": "2026-04-07T14:40:00Z",
        }

        event = map_security_event(raw_event)

        assert event is not None
        assert event.severity == EventSeverity.CRITICAL
        assert "exploit_attempt" in str(event.event_subtype)
        assert "blocked" in event.result

    def test_map_security_event_missing_id(self):
        raw_event = {
            "device_id": "firewall-01",
            # no id
        }

        event = map_security_event(raw_event)

        assert event is None


class TestMapBaselineAnomaly:
    def test_map_baseline_anomaly_suspicious(self):
        raw_device = {
            "id": "dev-099",
            "ip_address": "10.2.0.99",
            "baseline_status": "suspicious",
            "suspicious_reason": "Unusual outbound traffic",
        }

        event = map_baseline_anomaly(raw_device)

        assert event is not None
        assert event.event_type == "baseline_anomaly"
        assert event.severity == EventSeverity.ERROR  # suspicious maps to ERROR
        assert "Unusual outbound traffic" in event.result

    def test_map_baseline_anomaly_blocked(self):
        raw_device = {
            "id": "dev-100",
            "ip_address": "10.2.0.100",
            "baseline_status": "blocked",
            "blocked_reason": "Multiple failed login attempts",
        }

        event = map_baseline_anomaly(raw_device)

        assert event is not None
        assert event.severity == EventSeverity.CRITICAL

    def test_map_baseline_anomaly_normal_ignored(self):
        raw_device = {
            "id": "dev-101",
            "baseline_status": "normal",
        }

        event = map_baseline_anomaly(raw_device)

        # Should return None for normal status
        assert event is None

    def test_map_baseline_anomaly_missing_id(self):
        raw_device = {
            "ip_address": "10.2.0.102",
            "baseline_status": "suspicious",
            # no id
        }

        event = map_baseline_anomaly(raw_device)

        assert event is None


class TestMapSpofDetection:
    def test_map_spof_detection_minimal(self):
        raw_spof = {
            "id": "spof-001",
            "device_id": "core-switch-01",
        }

        event = map_spof_detection(raw_spof)

        assert event is not None
        assert event.event_type == "spof_detection"
        assert event.severity == EventSeverity.ERROR  # "high" maps to ERROR

    def test_map_spof_detection_full(self):
        raw_spof = {
            "id": "spof-001",
            "device_id": "core-switch-01",
            "ip_address": "10.0.0.3",
            "spof_type": "gateway_router",
            "blast_radius": 45,
            "affected_services": ["production_network", "scada_network"],
            "detected_at": "2026-04-07T14:25:00Z",
        }

        event = map_spof_detection(raw_spof)

        assert event is not None
        assert event.event_subtype == "gateway_router"
        assert event.severity == EventSeverity.CRITICAL  # blast_radius > 10
        assert "45" in event.result
        assert "production_network" in event.result

    def test_map_spof_detection_low_blast_radius(self):
        raw_spof = {
            "id": "spof-001",
            "device_id": "edge-switch-01",
            "blast_radius": 2,
        }

        event = map_spof_detection(raw_spof)

        assert event is not None
        assert event.severity == EventSeverity.WARNING  # "medium" maps to WARNING

    def test_map_spof_detection_missing_id(self):
        raw_spof = {
            "ip_address": "10.0.0.4",
            # no id or device_id
        }

        event = map_spof_detection(raw_spof)

        assert event is None


class TestNullSafety:
    def test_map_device_with_none_fields(self):
        raw_device = {
            "id": "dev-001",
            "type": None,
            "device_metadata": None,
        }

        unit = map_device(raw_device)

        assert unit is not None
        assert unit.product_type is None

    def test_map_trap_with_missing_timestamps(self):
        raw_trap = {
            "id": "trap-001",
            "device_id": "plc-001",
            # no trap_time
        }

        event = map_trap_event(raw_trap)

        assert event is not None
        assert event.event_time is not None  # Should default to now()
        assert isinstance(event.event_time, datetime)

    def test_map_alert_with_missing_severity(self):
        raw_alert = {
            "id": "alert-001",
            "device_id": "switch-01",
            # no severity field
        }

        event = map_alert(raw_alert)

        assert event is not None
        # Default is "medium" which maps to WARNING
        assert event.severity == EventSeverity.WARNING  # Default for alerts
