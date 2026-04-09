"""Map ERPI inventory entities → Forge Lot / ManufacturingUnit / OperationalEvent.

ERPI inventory entities flow primarily from WMS → ERPI → NetSuite:
    Barrel, BarrelEvent, BarrelReceipt, Lot, Kit, Inventory,
    InventoryTransfer, ItemReceipt

Note: ItemReceipt has a 1-week delayed posting threshold in ERPI
before being sent to NetSuite.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from forge.core.models.manufacturing.lot import Lot
from forge.core.models.manufacturing.manufacturing_unit import ManufacturingUnit
from forge.core.models.manufacturing.operational_event import OperationalEvent

logger = logging.getLogger(__name__)

_SOURCE_SYSTEM = "whk-erpi"


def map_barrel(raw: dict[str, Any]) -> ManufacturingUnit | None:
    """Map an ERPI Barrel to a Forge ManufacturingUnit."""
    global_id = raw.get("globalId") or raw.get("global_id")
    if not global_id:
        logger.warning("Barrel missing globalId — skipping: %s", raw)
        return None

    barrel_number = raw.get("barrelNumber") or raw.get("barrel_number") or global_id

    return ManufacturingUnit(
        source_system=_SOURCE_SYSTEM,
        source_id=str(raw.get("id", global_id)),
        serial_number=str(barrel_number),
        unit_type=str(raw.get("type") or raw.get("barrelType") or "barrel"),
        status=_map_unit_status(raw.get("status", "ACTIVE")),
        lot_id=_str_or_none(raw.get("lotId") or raw.get("lot_id")),
        metadata={
            **_build_metadata(raw),
            "entity_subtype": "barrel",
        },
    )


def map_barrel_event(raw: dict[str, Any]) -> OperationalEvent | None:
    """Map an ERPI BarrelEvent to a Forge OperationalEvent."""
    global_id = raw.get("globalId") or raw.get("global_id")
    if not global_id:
        logger.warning("BarrelEvent missing globalId — skipping: %s", raw)
        return None

    event_type = raw.get("eventType") or raw.get("event_type") or "barrel_event"
    barrel_id = raw.get("barrelId") or raw.get("barrel_id")
    event_time = _parse_datetime(raw.get("eventTime") or raw.get("event_time"))

    return OperationalEvent(
        source_system=_SOURCE_SYSTEM,
        source_id=str(raw.get("id", global_id)),
        event_type=str(event_type),
        entity_type="manufacturing_unit",
        entity_id=barrel_id or global_id,
        event_time=event_time,
        asset_id=_str_or_none(barrel_id),
        description=_str_or_none(raw.get("description") or raw.get("notes")),
        metadata={
            **_build_metadata(raw),
            "entity_subtype": "barrel_event",
            "barrel_id": barrel_id,
        },
    )


def map_barrel_receipt(raw: dict[str, Any]) -> OperationalEvent | None:
    """Map an ERPI BarrelReceipt to a Forge OperationalEvent."""
    global_id = raw.get("globalId") or raw.get("global_id")
    if not global_id:
        logger.warning("BarrelReceipt missing globalId — skipping: %s", raw)
        return None

    barrel_id = raw.get("barrelId") or raw.get("barrel_id")
    event_time = _parse_datetime(raw.get("eventTime") or raw.get("event_time"))

    return OperationalEvent(
        source_system=_SOURCE_SYSTEM,
        source_id=str(raw.get("id", global_id)),
        event_type="barrel_receipt",
        entity_type="manufacturing_unit",
        entity_id=barrel_id or global_id,
        event_time=event_time,
        asset_id=_str_or_none(barrel_id),
        metadata={
            **_build_metadata(raw),
            "entity_subtype": "barrel_receipt",
        },
    )


def map_lot(raw: dict[str, Any]) -> Lot | None:
    """Map an ERPI Lot to a Forge Lot."""
    global_id = raw.get("globalId") or raw.get("global_id")
    lot_number = raw.get("lotNumber") or raw.get("lot_number")
    if not global_id:
        logger.warning("Lot missing globalId — skipping: %s", raw)
        return None

    return Lot(
        source_system=_SOURCE_SYSTEM,
        source_id=str(raw.get("id", global_id)),
        lot_number=str(lot_number or global_id),
        status=str(raw.get("status", "CREATED")).upper(),
        metadata={
            **_build_metadata(raw),
            "entity_subtype": "lot",
        },
    )


def map_item_receipt(raw: dict[str, Any]) -> OperationalEvent | None:
    """Map an ERPI ItemReceipt to a Forge OperationalEvent.

    Note: ItemReceipts have a 1-week delayed posting threshold before
    being sent to NetSuite via the outbox pattern.
    """
    global_id = raw.get("globalId") or raw.get("global_id")
    if not global_id:
        logger.warning("ItemReceipt missing globalId — skipping: %s", raw)
        return None

    item_id = raw.get("itemId") or raw.get("item_id") or global_id
    event_time = _parse_datetime(raw.get("eventTime") or raw.get("event_time"))

    return OperationalEvent(
        source_system=_SOURCE_SYSTEM,
        source_id=str(raw.get("id", global_id)),
        event_type="item_receipt",
        entity_type="material_item",
        entity_id=item_id,
        event_time=event_time,
        description=_str_or_none(raw.get("description")),
        metadata={
            **_build_metadata(raw),
            "entity_subtype": "item_receipt",
            "delayed_posting": True,
            "quantity": raw.get("quantity"),
            "item_id": item_id,
        },
    )


def map_inventory(raw: dict[str, Any]) -> OperationalEvent | None:
    """Map an ERPI Inventory record to a Forge OperationalEvent."""
    global_id = raw.get("globalId") or raw.get("global_id")
    if not global_id:
        logger.warning("Inventory missing globalId — skipping: %s", raw)
        return None

    item_id = raw.get("itemId") or raw.get("item_id") or global_id
    event_time = _parse_datetime(raw.get("eventTime") or raw.get("event_time"))

    return OperationalEvent(
        source_system=_SOURCE_SYSTEM,
        source_id=str(raw.get("id", global_id)),
        event_type="inventory_snapshot",
        entity_type="material_item",
        entity_id=item_id,
        event_time=event_time,
        metadata={
            **_build_metadata(raw),
            "entity_subtype": "inventory",
            "quantity": raw.get("quantity"),
            "location_id": raw.get("locationId") or raw.get("location_id"),
            "item_id": item_id,
        },
    )


def map_inventory_transfer(raw: dict[str, Any]) -> OperationalEvent | None:
    """Map an ERPI InventoryTransfer to a Forge OperationalEvent."""
    global_id = raw.get("globalId") or raw.get("global_id")
    if not global_id:
        logger.warning("InventoryTransfer missing globalId — skipping: %s", raw)
        return None

    item_id = raw.get("itemId") or raw.get("item_id") or global_id
    event_time = _parse_datetime(raw.get("eventTime") or raw.get("event_time"))

    return OperationalEvent(
        source_system=_SOURCE_SYSTEM,
        source_id=str(raw.get("id", global_id)),
        event_type="inventory_transfer",
        entity_type="material_item",
        entity_id=item_id,
        event_time=event_time,
        metadata={
            **_build_metadata(raw),
            "entity_subtype": "inventory_transfer",
            "quantity": raw.get("quantity"),
            "from_location": raw.get("fromLocationId") or raw.get("from_location_id"),
            "to_location": raw.get("toLocationId") or raw.get("to_location_id"),
        },
    )


def _build_metadata(raw: dict[str, Any]) -> dict[str, Any]:
    meta: dict[str, Any] = {}
    for key in ("transactionInitiator", "transactionStatus", "transactionType", "schemaVersion"):
        val = raw.get(key)
        if val is not None:
            meta[key] = val
    return meta


def _str_or_none(val: Any) -> str | None:
    return str(val) if val else None


def _map_unit_status(erpi_status: Any) -> str:
    """Map ERPI status to valid UnitStatus.

    ERPI barrel statuses map to manufacturing unit lifecycle states.
    FILLED → ACTIVE, TRANSFERRED → TRANSFERRED, etc.
    """
    status_str = str(erpi_status or "ACTIVE").upper()

    # Map common ERPI barrel statuses to UnitStatus
    mapping = {
        "FILLED": "ACTIVE",
        "ACTIVE": "ACTIVE",
        "COMPLETE": "COMPLETE",
        "PENDING": "PENDING",
        "HELD": "HELD",
        "SCRAPPED": "SCRAPPED",
        "TRANSFERRED": "TRANSFERRED",
    }

    return mapping.get(status_str, "ACTIVE")


def _parse_datetime(val: Any) -> datetime:
    """Parse a datetime value, defaulting to now if missing or invalid.

    Accepts ISO 8601 strings or datetime objects.
    """
    if val is None:
        return datetime.now(timezone.utc)

    if isinstance(val, datetime):
        return val

    if isinstance(val, str):
        try:
            # Try ISO 8601 parsing
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            pass

    # Fallback to current time if parsing fails
    return datetime.now(timezone.utc)
