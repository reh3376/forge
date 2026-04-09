"""NMS context builder — extract operational context from NMS API responses.

Network management systems carry rich device and event metadata that most
manufacturing systems lack. The context builder extracts these as first-class
context fields:

- device_ip — IP address for correlation with network logs
- device_type — device classification (router, switch, firewall, etc.)
- device_role — device role in network (core, edge, management, etc.)
- device_category — OT vs IT (net_core, net_edge, ot_control, etc.)
- is_critical — critical infrastructure device
- is_ot_device — operational technology device vs IT
- severity — event severity (critical, high, medium, low, info)
- health_status — device health (healthy, degraded, failed, unknown)
- blast_radius — SPOF blast radius count
- baseline_status — baseline anomaly status (normal, suspicious, blocked)
- location — physical location/site
- poll_tier — SNMP polling tier (critical, high, standard)
- network_role — network role (upstream, downstream, isolated)

These fields enable Forge to answer decision-quality questions like
"which critical OT devices have baseline anomalies?"
"""

from __future__ import annotations

import logging
from typing import Any

from forge.core.models.contextual_record import RecordContext

logger = logging.getLogger(__name__)

# ── Device Category Mapping ────────────────────────────────────

_DEVICE_CATEGORY_MAPPING: dict[str, str] = {
    "router": "net_core",
    "switch": "net_core",
    "firewall": "net_core",
    "plc": "ot_control",
    "rtu": "ot_control",
    "dcs": "ot_control",
    "scada": "ot_control",
    "hmi": "ot_control",
    "server": "it_core",
    "workstation": "it_edge",
    "printer": "it_edge",
    "camera": "it_edge",
    "access_point": "net_edge",
    "managed_switch": "net_edge",
}

# ── Severity Mapping ───────────────────────────────────────────

_SEVERITY_MAPPING: dict[str, str] = {
    "critical": "critical",
    "high": "high",
    "medium": "medium",
    "low": "low",
    "warning": "high",
    "info": "info",
    "informational": "info",
}


def build_record_context(
    raw_event: dict[str, Any],
    *,
    entity_type: str = "network_device",
    event_type: str = "unknown",
) -> RecordContext:
    """Transform a raw NMS API response into a RecordContext.

    Extracts NMS's native device and event metadata as first-class context,
    preserving the network topology and health information that enables
    cross-module manufacturing decision analysis.

    Args:
        raw_event: Full NMS entity dict (device, trap, alert, etc.).
        entity_type: Type of entity (network_device, security_event, etc.).
        event_type: Type of event (snmp_trap, baseline_anomaly, etc.).

    Returns:
        RecordContext with NMS-specific fields in the extra dict.
    """
    # ── Core Identity Fields ───────────────────────────────────
    device_id = _str_or_none(raw_event.get("id"))
    device_ip = _str_or_none(raw_event.get("ip_address") or raw_event.get("ipAddress"))
    device_name = _str_or_none(raw_event.get("name") or raw_event.get("hostname"))
    device_type = _str_or_none(raw_event.get("type") or raw_event.get("deviceType"))
    device_role = _str_or_none(raw_event.get("role") or raw_event.get("deviceRole"))
    device_category = _str_or_none(raw_event.get("category") or raw_event.get("deviceCategory"))

    # ── Device Classification ──────────────────────────────────
    is_critical = _bool_or_false(raw_event.get("is_critical") or raw_event.get("isCritical"))
    is_ot_device = _bool_or_false(raw_event.get("is_ot_device") or raw_event.get("isOtDevice"))
    location = _str_or_none(raw_event.get("location") or raw_event.get("site"))

    # ── Device Health & Status ─────────────────────────────────
    health_status = _str_or_none(raw_event.get("health_status") or raw_event.get("healthStatus"))
    poll_tier = _str_or_none(raw_event.get("poll_tier") or raw_event.get("pollTier"))
    network_role = _str_or_none(raw_event.get("network_role") or raw_event.get("networkRole"))

    # ── Event-Specific Fields ──────────────────────────────────
    severity = _str_or_none(raw_event.get("severity"))
    blast_radius = raw_event.get("blast_radius") or raw_event.get("blastRadius")
    if blast_radius is not None:
        blast_radius = int(blast_radius)

    baseline_status = _str_or_none(
        raw_event.get("baseline_status") or raw_event.get("baselineStatus")
    )

    # ── Derived Category ───────────────────────────────────────
    if not device_category and device_type:
        device_category = _DEVICE_CATEGORY_MAPPING.get(device_type.lower(), "unknown")
    elif not device_category:
        device_category = "unknown"

    # ── Derived Severity ───────────────────────────────────────
    if severity:
        severity = _SEVERITY_MAPPING.get(severity.lower(), severity)

    # ── Build Extra Context Dict ───────────────────────────────
    extra: dict[str, Any] = {
        "cross_system_id": device_id or device_ip or "",
        "source_system": "whk-nms",
        "entity_type": entity_type,
        "event_type": event_type,
        "operation_context": "network_monitoring",
    }

    # Device attributes
    if device_ip:
        extra["device_ip"] = device_ip
    if device_name:
        extra["device_name"] = device_name
    if device_type:
        extra["device_type"] = device_type
    if device_role:
        extra["device_role"] = device_role
    if device_category:
        extra["device_category"] = device_category
    if is_critical:
        extra["is_critical"] = is_critical
    if is_ot_device:
        extra["is_ot_device"] = is_ot_device
    if location:
        extra["location"] = location
    if poll_tier:
        extra["poll_tier"] = poll_tier
    if network_role:
        extra["network_role"] = network_role

    # Event attributes
    if severity:
        extra["severity"] = severity
    if health_status:
        extra["health_status"] = health_status
    if blast_radius is not None:
        extra["blast_radius"] = blast_radius
    if baseline_status:
        extra["baseline_status"] = baseline_status

    return RecordContext(
        equipment_id=device_id or device_ip,
        area="network_infrastructure",
        site="whk01",  # primary site
        extra=extra,
    )


def _str_or_none(val: Any) -> str | None:
    """Convert to str if truthy, else None."""
    return str(val).strip() if val else None


def _bool_or_false(val: Any) -> bool:
    """Convert to bool, default False."""
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.lower() in ("true", "yes", "1", "on")
    return bool(val) if val else False
