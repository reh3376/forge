"""Map WMS Barrel → Forge ManufacturingUnit.

WMS Barrel fields (from Prisma schema):
    id, serialNumber, lotId, storageLocationId, ownerId, barrelTypeId,
    disposition (EnumBarrelDisposition), systemStatus, fillDate,
    proofGallons, wineGallons, entryDate, entryProof

Forge ManufacturingUnit fields:
    unit_type, serial_number, lot_id, location_id, owner_id,
    recipe_id, status, lifecycle_state, quantity, unit_of_measure,
    product_type + provenance envelope
"""

from __future__ import annotations

import logging
from typing import Any

from forge.core.models.manufacturing.enums import LifecycleState, UnitStatus
from forge.core.models.manufacturing.manufacturing_unit import ManufacturingUnit

logger = logging.getLogger(__name__)

_SOURCE_SYSTEM = "whk-wms"

# WMS EnumBarrelDisposition → Forge UnitStatus
_DISPOSITION_TO_STATUS: dict[str, UnitStatus] = {
    "IN_STORAGE": UnitStatus.ACTIVE,
    "IN_TRANSIT": UnitStatus.ACTIVE,
    "AVAILABLE": UnitStatus.ACTIVE,
    "ON_HOLD": UnitStatus.HELD,
    "PENDING": UnitStatus.PENDING,
    "DUMPED": UnitStatus.SCRAPPED,
    "WITHDRAWN": UnitStatus.COMPLETE,
    "TRANSFERRED": UnitStatus.TRANSFERRED,
}

# WMS EnumBarrelDisposition → Forge LifecycleState
_DISPOSITION_TO_LIFECYCLE: dict[str, LifecycleState] = {
    "IN_STORAGE": LifecycleState.IN_STORAGE,
    "IN_TRANSIT": LifecycleState.IN_TRANSIT,
    "AVAILABLE": LifecycleState.AGING,
    "PENDING": LifecycleState.CREATED,
    "FILLING": LifecycleState.FILLING,
    "DUMPED": LifecycleState.DUMPED,
    "WITHDRAWN": LifecycleState.WITHDRAWN,
    "SAMPLING": LifecycleState.SAMPLING,
}


def map_barrel(raw: dict[str, Any]) -> ManufacturingUnit | None:
    """Map a WMS Barrel dict to a Forge ManufacturingUnit.

    Returns None if the barrel_id (required source_id) is missing.
    """
    barrel_id = raw.get("id") or raw.get("barrel_id")
    if not barrel_id:
        logger.warning("Barrel dict missing id — skipping: %s", raw)
        return None

    disposition = str(raw.get("disposition", "")).upper()

    return ManufacturingUnit(
        source_system=_SOURCE_SYSTEM,
        source_id=str(barrel_id),
        unit_type="barrel",
        serial_number=raw.get("serialNumber") or raw.get("serial_number"),
        lot_id=_str_or_none(raw.get("lotId") or raw.get("lot_id")),
        location_id=_str_or_none(
            raw.get("storageLocationId") or raw.get("storage_location_id")
        ),
        owner_id=_str_or_none(raw.get("ownerId") or raw.get("owner_id")),
        recipe_id=_str_or_none(raw.get("mashbillId") or raw.get("mashbill_id")),
        status=_DISPOSITION_TO_STATUS.get(disposition, UnitStatus.PENDING),
        lifecycle_state=_DISPOSITION_TO_LIFECYCLE.get(disposition),
        quantity=_float_or_none(
            raw.get("proofGallons") or raw.get("proof_gallons")
        ),
        unit_of_measure="proof_gallons" if raw.get("proofGallons") else None,
        product_type=raw.get("whiskeyType") or raw.get("whiskey_type"),
        metadata={
            k: v
            for k, v in {
                "barrel_type": raw.get("barrelTypeId") or raw.get("barrel_type"),
                "fill_date": raw.get("fillDate") or raw.get("fill_date"),
                "entry_proof": raw.get("entryProof") or raw.get("entry_proof"),
                "wine_gallons": raw.get("wineGallons") or raw.get("wine_gallons"),
            }.items()
            if v is not None
        },
    )


def _str_or_none(val: Any) -> str | None:
    """Convert to string or return None for falsy values."""
    return str(val) if val else None


def _float_or_none(val: Any) -> float | None:
    """Convert to float or return None."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None
