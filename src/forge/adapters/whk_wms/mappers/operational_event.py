"""Map WMS BarrelEvent → Forge OperationalEvent.

WMS BarrelEvent fields (from Prisma schema):
    id, barrelId, eventTypeId, eventTime, createdById (user),
    result, reason, notes

WMS EventType (enum/table):
    Entry, Withdrawal, Transfer, Fill, Dump, Gauge, Weight,
    OwnershipChange, LocationChange, StatusChange

Forge OperationalEvent fields:
    event_type, event_subtype, category, severity, entity_type,
    entity_id, asset_id, operator_id, event_time, result,
    work_order_id + provenance envelope
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from forge.core.models.manufacturing.enums import EventCategory, EventSeverity
from forge.core.models.manufacturing.operational_event import OperationalEvent

logger = logging.getLogger(__name__)

_SOURCE_SYSTEM = "whk-wms"

# WMS EventType → Forge EventCategory
_EVENT_TYPE_TO_CATEGORY: dict[str, EventCategory] = {
    "entry": EventCategory.LOGISTICS,
    "withdrawal": EventCategory.LOGISTICS,
    "transfer": EventCategory.LOGISTICS,
    "fill": EventCategory.PRODUCTION,
    "dump": EventCategory.PRODUCTION,
    "gauge": EventCategory.QUALITY,
    "weight": EventCategory.QUALITY,
    "ownershipchange": EventCategory.COMPLIANCE,
    "ownership_change": EventCategory.COMPLIANCE,
    "locationchange": EventCategory.LOGISTICS,
    "location_change": EventCategory.LOGISTICS,
    "statuschange": EventCategory.PRODUCTION,
    "status_change": EventCategory.PRODUCTION,
    "sample": EventCategory.QUALITY,
}


def map_barrel_event(raw: dict[str, Any]) -> OperationalEvent | None:
    """Map a WMS BarrelEvent dict to a Forge OperationalEvent.

    Returns None if required fields (id, barrelId, eventType) are missing.
    """
    event_id = raw.get("id") or raw.get("event_id")
    barrel_id = raw.get("barrelId") or raw.get("barrel_id")
    event_type_raw = (
        raw.get("eventType")
        or raw.get("event_type")
        or raw.get("eventTypeId")
        or raw.get("event_type_id")
    )

    if not event_id or not barrel_id:
        logger.warning("BarrelEvent missing id or barrelId — skipping: %s", raw)
        return None

    event_type = str(event_type_raw or "unknown").strip()
    category = _EVENT_TYPE_TO_CATEGORY.get(event_type.lower())

    # Parse event time
    event_time = _parse_datetime(
        raw.get("eventTime") or raw.get("event_time") or raw.get("timestamp")
    )
    if event_time is None:
        event_time = datetime.now(tz=UTC)
    return OperationalEvent(
        source_system=_SOURCE_SYSTEM,
        source_id=str(event_id),
        event_type=event_type,
        event_subtype=raw.get("reason") or raw.get("event_reason"),
        category=category,
        severity=EventSeverity.INFO,
        entity_type="manufacturing_unit",
        entity_id=str(barrel_id),
        asset_id=_str_or_none(
            raw.get("storageLocationId") or raw.get("storage_location_id")
        ),
        operator_id=_str_or_none(
            raw.get("createdById") or raw.get("created_by_id") or raw.get("userId")
        ),
        event_time=event_time,
        result=raw.get("result"),
        work_order_id=_str_or_none(
            raw.get("warehouseJobId") or raw.get("warehouse_job_id")
        ),
        metadata={
            k: v
            for k, v in {
                "notes": raw.get("notes"),
                "reason": raw.get("reason"),
            }.items()
            if v is not None
        },
    )


def _parse_datetime(val: Any) -> datetime | None:
    """Parse a datetime from a string or return it if already a datetime."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, str):
        try:
            return datetime.fromisoformat(val)
        except (ValueError, TypeError):
            return None
    return None


def _str_or_none(val: Any) -> str | None:
    return str(val) if val else None
