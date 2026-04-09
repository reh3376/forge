"""NMS event mappers — convert NMS events to OperationalEvent.

Maps various NMS event types to Forge OperationalEvent:
- SNMP traps → OperationalEvent (event_type="snmp_trap")
- Alerts → OperationalEvent (event_type="infrastructure_alert")
- Security events → OperationalEvent (event_type="security_event")
- Baseline anomalies → OperationalEvent (event_type="baseline_anomaly")
- SPOF detections → OperationalEvent (event_type="spof_detection")
"""

from __future__ import annotations

from datetime import datetime, timezone

from forge.core.models.manufacturing.operational_event import OperationalEvent
from forge.core.models.manufacturing.enums import EventCategory, EventSeverity


def map_trap_event(raw_trap: dict) -> OperationalEvent | None:
    """Map an NMS SNMP trap to OperationalEvent.

    Args:
        raw_trap: Raw trap record from /api/v1/snmp/traps.

    Returns:
        OperationalEvent with event_type="snmp_trap", or None if required
        fields are missing.
    """
    # Required: trap ID, device ID
    trap_id = raw_trap.get("id")
    if not trap_id:
        return None

    device_id = raw_trap.get("device_id") or raw_trap.get("deviceId")
    device_ip = raw_trap.get("device_ip") or raw_trap.get("deviceIp")
    entity_id = device_id or device_ip or str(trap_id)

    # Event details
    trap_type = raw_trap.get("trap_type") or raw_trap.get("trapType")
    oid = raw_trap.get("oid")
    result = _build_result(trap_type, oid)

    # Timestamp
    event_time = _parse_timestamp(
        raw_trap.get("trap_time")
        or raw_trap.get("trapTime")
        or raw_trap.get("received_at")
        or raw_trap.get("receivedAt")
    )

    # Severity (defaults to INFO)
    severity = _map_severity(raw_trap.get("severity", "info"))

    return OperationalEvent(
        source_id=str(trap_id),
        source_system="whk-nms",
        event_type="snmp_trap",
        event_subtype=trap_type,
        category=EventCategory.PRODUCTION,  # Network events affect production
        severity=severity,
        entity_type="network_device",
        entity_id=entity_id,
        event_time=event_time,
        result=result,
    )


def map_alert(raw_alert: dict) -> OperationalEvent | None:
    """Map an NMS alert to OperationalEvent.

    Args:
        raw_alert: Raw alert record from /api/v1/alerts/rules.

    Returns:
        OperationalEvent with event_type="infrastructure_alert", or None if
        required fields are missing.
    """
    # Required: alert ID
    alert_id = raw_alert.get("id")
    if not alert_id:
        return None

    device_id = raw_alert.get("device_id") or raw_alert.get("deviceId")
    device_ip = raw_alert.get("device_ip") or raw_alert.get("deviceIp")
    entity_id = device_id or device_ip or str(alert_id)

    # Alert details
    alert_name = raw_alert.get("name")
    alert_description = raw_alert.get("description")
    condition = raw_alert.get("condition")
    result = _build_alert_result(alert_name, alert_description, condition)

    # Timestamp
    event_time = _parse_timestamp(
        raw_alert.get("alert_time")
        or raw_alert.get("alertTime")
        or raw_alert.get("triggered_at")
        or raw_alert.get("triggeredAt")
    )

    # Severity
    severity = _map_severity(raw_alert.get("severity", "medium"))

    return OperationalEvent(
        source_id=str(alert_id),
        source_system="whk-nms",
        event_type="infrastructure_alert",
        event_subtype=alert_name,
        category=EventCategory.PRODUCTION,  # Infrastructure alerts affect production
        severity=severity,
        entity_type="network_device",
        entity_id=entity_id,
        event_time=event_time,
        result=result,
    )


def map_security_event(raw_event: dict) -> OperationalEvent | None:
    """Map an NMS security event (from FortiAnalyzer) to OperationalEvent.

    Args:
        raw_event: Raw security event record from /api/v1/security/events.

    Returns:
        OperationalEvent with event_type="security_event", or None if required
        fields are missing.
    """
    # Required: event ID
    event_id = raw_event.get("id")
    if not event_id:
        return None

    device_id = raw_event.get("device_id") or raw_event.get("deviceId")
    source_ip = raw_event.get("source_ip") or raw_event.get("sourceIp")
    entity_id = device_id or source_ip or str(event_id)

    # Event details
    event_type_name = raw_event.get("event_type") or raw_event.get("type", "unknown")
    threat_type = raw_event.get("threat_type") or raw_event.get("threatType")
    action_taken = raw_event.get("action") or raw_event.get("actionTaken")
    result = _build_security_result(event_type_name, threat_type, action_taken)

    # Timestamp
    event_time = _parse_timestamp(
        raw_event.get("event_time")
        or raw_event.get("eventTime")
        or raw_event.get("timestamp")
    )

    # Severity (defaults to HIGH for security events)
    severity = _map_severity(raw_event.get("severity", "high"))

    return OperationalEvent(
        source_id=str(event_id),
        source_system="whk-nms",
        event_type="security_event",
        event_subtype=threat_type or event_type_name,
        category=EventCategory.COMPLIANCE,  # Security and compliance
        severity=severity,
        entity_type="security_event",
        entity_id=entity_id,
        event_time=event_time,
        result=result,
    )


def map_baseline_anomaly(raw_device: dict) -> OperationalEvent | None:
    """Map an NMS baseline anomaly to OperationalEvent.

    Args:
        raw_device: Raw device record from /api/v1/baseline/devices with
                    baseline_status set.

    Returns:
        OperationalEvent with event_type="baseline_anomaly", or None if required
        fields are missing.
    """
    # Required: device ID
    device_id = raw_device.get("id")
    if not device_id:
        return None

    device_ip = raw_device.get("ip_address") or raw_device.get("ipAddress")
    baseline_status = raw_device.get("baseline_status") or raw_device.get("baselineStatus")

    # If not anomalous, skip
    if baseline_status and baseline_status.lower() == "normal":
        return None

    # Anomaly details
    suspicious_reason = raw_device.get("suspicious_reason") or raw_device.get("suspiciousReason")
    blocked_reason = raw_device.get("blocked_reason") or raw_device.get("blockedReason")
    reason = suspicious_reason or blocked_reason or baseline_status
    result = f"Baseline anomaly detected: {reason}" if reason else "Baseline anomaly"

    # Timestamp (use device's last update time)
    event_time = _parse_timestamp(
        raw_device.get("anomaly_detected_at")
        or raw_device.get("anomalyDetectedAt")
        or raw_device.get("updated_at")
        or raw_device.get("updatedAt")
    )

    # Severity based on status
    if baseline_status and "blocked" in baseline_status.lower():
        severity = EventSeverity.CRITICAL
    elif baseline_status and "suspicious" in baseline_status.lower():
        severity = EventSeverity.ERROR
    else:
        severity = EventSeverity.WARNING

    return OperationalEvent(
        source_id=f"{device_id}-baseline",
        source_system="whk-nms",
        event_type="baseline_anomaly",
        event_subtype=baseline_status,
        category=EventCategory.COMPLIANCE,  # Security and compliance
        severity=severity,
        entity_type="network_device",
        entity_id=device_id,
        event_time=event_time,
        result=result,
    )


def map_spof_detection(raw_spof: dict) -> OperationalEvent | None:
    """Map an NMS SPOF detection to OperationalEvent.

    Args:
        raw_spof: Raw SPOF record from /api/v1/spof/active.

    Returns:
        OperationalEvent with event_type="spof_detection", or None if required
        fields are missing.
    """
    # Required: device ID
    device_id = raw_spof.get("id") or raw_spof.get("device_id") or raw_spof.get("deviceId")
    if not device_id:
        return None

    device_ip = raw_spof.get("ip_address") or raw_spof.get("ipAddress")
    entity_id = device_id or device_ip or str(device_id)

    # SPOF details
    spof_type = raw_spof.get("spof_type") or raw_spof.get("spofType")
    blast_radius = raw_spof.get("blast_radius") or raw_spof.get("blastRadius")
    affected_services = raw_spof.get("affected_services") or raw_spof.get("affectedServices")

    # Build result with blast radius
    result = f"SPOF detected: {spof_type or 'unknown'}"
    if blast_radius:
        result = f"{result} (blast radius: {blast_radius})"
    if affected_services:
        if isinstance(affected_services, list):
            result = f"{result} [affects: {', '.join(affected_services)}]"
        else:
            result = f"{result} [affects: {affected_services}]"

    # Timestamp
    event_time = _parse_timestamp(
        raw_spof.get("detected_at")
        or raw_spof.get("detectedAt")
        or raw_spof.get("timestamp")
    )

    # Severity based on blast radius
    if blast_radius:
        try:
            br_int = int(blast_radius)
            if br_int > 10:
                severity = EventSeverity.CRITICAL
            elif br_int > 5:
                severity = EventSeverity.ERROR
            else:
                severity = EventSeverity.WARNING
        except (ValueError, TypeError):
            severity = EventSeverity.ERROR
    else:
        severity = EventSeverity.ERROR

    return OperationalEvent(
        source_id=f"{device_id}-spof",
        source_system="whk-nms",
        event_type="spof_detection",
        event_subtype=spof_type,
        category=EventCategory.PRODUCTION,  # SPOF affects production
        severity=severity,
        entity_type="network_device",
        entity_id=entity_id,
        event_time=event_time,
        result=result,
    )


# ── Helper Functions ───────────────────────────────────────────

def _parse_timestamp(value: any) -> datetime:
    """Parse an ISO timestamp string, falling back to now(utc)."""
    if value is None:
        return datetime.now(tz=timezone.utc)
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        s = str(value)
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return datetime.now(tz=timezone.utc)


def _map_severity(raw_severity: str) -> EventSeverity:
    """Map NMS severity to EventSeverity enum."""
    if not raw_severity:
        return EventSeverity.INFO

    lower = raw_severity.lower().strip()

    if lower in ("critical",):
        return EventSeverity.CRITICAL
    elif lower in ("high", "warning", "alert", "error"):
        return EventSeverity.ERROR
    elif lower in ("medium", "moderate"):
        return EventSeverity.WARNING
    elif lower in ("low", "minor", "info", "information"):
        return EventSeverity.INFO
    else:
        return EventSeverity.INFO


def _build_result(trap_type: str | None, oid: str | None) -> str | None:
    """Build result string for trap event."""
    if trap_type and oid:
        return f"{trap_type} (OID: {oid})"
    elif trap_type:
        return trap_type
    elif oid:
        return f"OID: {oid}"
    return None


def _build_alert_result(name: str | None, description: str | None, condition: str | None) -> str | None:
    """Build result string for alert event."""
    parts = []
    if name:
        parts.append(f"Alert: {name}")
    if description:
        parts.append(description)
    if condition:
        parts.append(f"Condition: {condition}")
    return " | ".join(parts) if parts else None


def _build_security_result(
    event_type: str | None, threat_type: str | None, action: str | None
) -> str | None:
    """Build result string for security event."""
    parts = []
    if event_type:
        parts.append(f"Type: {event_type}")
    if threat_type:
        parts.append(f"Threat: {threat_type}")
    if action:
        parts.append(f"Action: {action}")
    return " | ".join(parts) if parts else None
