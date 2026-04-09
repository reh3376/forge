"""NMS device mapper — convert discovered hosts to ManufacturingUnit.

Maps NMS discovered_hosts + device_metadata to Forge ManufacturingUnit with
unit_type="network_device". Embeds device metadata as serial_number and
location_id for topology correlation.
"""

from __future__ import annotations

from datetime import datetime, timezone

from forge.core.models.manufacturing.manufacturing_unit import ManufacturingUnit
from forge.core.models.manufacturing.enums import UnitStatus, LifecycleState


def map_device(raw_device: dict) -> ManufacturingUnit | None:
    """Map an NMS discovered_hosts record to ManufacturingUnit.

    Args:
        raw_device: Raw device record from /api/v1/devices or /api/v1/devices/{id}.

    Returns:
        ManufacturingUnit with unit_type="network_device", or None if required
        fields are missing.
    """
    # Required: ID
    device_id = raw_device.get("id")
    if not device_id:
        return None

    # Extract basic info
    device_ip = raw_device.get("ip_address") or raw_device.get("ipAddress")
    device_name = raw_device.get("name") or raw_device.get("hostname")
    device_type = raw_device.get("type") or raw_device.get("deviceType")

    # Extract metadata if present
    metadata = raw_device.get("device_metadata") or raw_device.get("metadata") or {}
    serial_number = metadata.get("serial_number") or metadata.get("serialNumber")
    vendor = metadata.get("vendor")
    model = metadata.get("model")
    mac_address = metadata.get("mac_address") or metadata.get("macAddress")

    # Extract status
    raw_status = (
        raw_device.get("status")
        or raw_device.get("healthStatus")
        or raw_device.get("health_status")
        or "unknown"
    )
    status = _map_status(raw_status)

    # Extract location/site
    location_id = raw_device.get("location") or raw_device.get("site")

    # Build product type from vendor + model
    product_type = None
    if vendor and model:
        product_type = f"{vendor} {model}"
    elif vendor:
        product_type = vendor
    elif model:
        product_type = model

    # Build product type with device_type if available
    if device_type:
        if product_type:
            product_type = f"{product_type} ({device_type})"
        else:
            product_type = device_type

    # Build serial_number field: prefer mac_address, fall back to device_ip
    effective_serial = serial_number or mac_address or device_ip

    return ManufacturingUnit(
        source_id=str(device_id),
        source_system="whk-nms",
        unit_type="network_device",
        serial_number=effective_serial,
        location_id=location_id,
        status=status,
        lifecycle_state=_map_lifecycle_state(raw_status),
        product_type=product_type,
    )


def _map_status(raw_status: str) -> UnitStatus:
    """Map NMS health status to UnitStatus."""
    if not raw_status:
        return UnitStatus.PENDING

    lower = raw_status.lower().strip()

    if lower in ("healthy", "up", "online", "active", "normal"):
        return UnitStatus.ACTIVE
    elif lower in ("degraded", "warning"):
        return UnitStatus.ACTIVE  # Still active but degraded
    elif lower in ("down", "offline", "failed", "critical"):
        return UnitStatus.HELD  # Device not operating normally
    elif lower in ("quarantined", "blocked", "unauthorized"):
        return UnitStatus.HELD  # Device held from service
    elif lower in ("unknown", "pending"):
        return UnitStatus.PENDING
    else:
        return UnitStatus.PENDING


def _map_lifecycle_state(raw_status: str) -> LifecycleState | None:
    """Map NMS health status to LifecycleState."""
    if not raw_status:
        return None

    lower = raw_status.lower().strip()

    if lower in ("healthy", "up", "online", "active", "normal"):
        return LifecycleState.IN_PROCESS
    elif lower in ("degraded", "warning"):
        return LifecycleState.IN_PROCESS
    elif lower in ("down", "offline", "failed", "critical"):
        return LifecycleState.WITHDRAWN
    elif lower in ("quarantined", "blocked", "unauthorized"):
        return LifecycleState.WITHDRAWN
    else:
        return None
