"""Map MES Batch -> Forge ManufacturingUnit (unit_type="batch").

MES Batch fields (from Prisma schema):
    id, status, currentStepIndex, assetId, customerId, lotId,
    productionOrderId, recipeId, startedAt, completedAt

The Batch is the primary manufacturing unit in MES (equivalent to
WMS's Barrel). Each production order may produce one or more batches.

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

_SOURCE_SYSTEM = "whk-mes"

# MES batch status -> Forge UnitStatus
_STATUS_TO_UNIT_STATUS: dict[str, UnitStatus] = {
    "CREATED": UnitStatus.PENDING,
    "STARTED": UnitStatus.ACTIVE,
    "IN_PROGRESS": UnitStatus.ACTIVE,
    "RUNNING": UnitStatus.ACTIVE,
    "PAUSED": UnitStatus.HELD,
    "ON_HOLD": UnitStatus.HELD,
    "COMPLETED": UnitStatus.COMPLETE,
    "COMPLETE": UnitStatus.COMPLETE,
    "CLOSED": UnitStatus.COMPLETE,
    "CANCELLED": UnitStatus.SCRAPPED,
    "ABORTED": UnitStatus.SCRAPPED,
}

# MES batch status -> Forge LifecycleState
_STATUS_TO_LIFECYCLE: dict[str, LifecycleState] = {
    "CREATED": LifecycleState.CREATED,
    "STARTED": LifecycleState.IN_PROCESS,
    "IN_PROGRESS": LifecycleState.IN_PROCESS,
    "RUNNING": LifecycleState.IN_PROCESS,
    "PAUSED": LifecycleState.IN_PROCESS,
    "COMPLETED": LifecycleState.COMPLETE,
    "COMPLETE": LifecycleState.COMPLETE,
    "CLOSED": LifecycleState.COMPLETE,
}


def map_batch(raw: dict[str, Any]) -> ManufacturingUnit | None:
    """Map an MES Batch dict to a Forge ManufacturingUnit.

    Returns None if the batch id (required source_id) is missing.
    """
    batch_id = raw.get("id") or raw.get("batch_id") or raw.get("batchId")
    if not batch_id:
        logger.warning("Batch dict missing id -- skipping: %s", raw)
        return None

    status_raw = str(raw.get("status", "")).upper()

    return ManufacturingUnit(
        source_system=_SOURCE_SYSTEM,
        source_id=str(batch_id),
        unit_type="batch",
        serial_number=raw.get("batchNumber") or raw.get("batch_number"),
        lot_id=_str_or_none(raw.get("lotId") or raw.get("lot_id")),
        location_id=_str_or_none(raw.get("assetId") or raw.get("asset_id")),
        owner_id=_str_or_none(raw.get("customerId") or raw.get("customer_id")),
        recipe_id=_str_or_none(raw.get("recipeId") or raw.get("recipe_id")),
        status=_STATUS_TO_UNIT_STATUS.get(status_raw, UnitStatus.PENDING),
        lifecycle_state=_STATUS_TO_LIFECYCLE.get(status_raw),
        quantity=_float_or_none(
            raw.get("expectedQuantity") or raw.get("expected_quantity")
        ),
        unit_of_measure=raw.get("unit") or raw.get("unitOfMeasure"),
        product_type=raw.get("whiskeyType") or raw.get("whiskey_type"),
        metadata={
            k: v
            for k, v in {
                "current_step_index": raw.get("currentStepIndex")
                or raw.get("current_step_index"),
                "production_order_id": raw.get("productionOrderId")
                or raw.get("production_order_id"),
                "started_at": raw.get("startedAt") or raw.get("started_at"),
                "completed_at": raw.get("completedAt") or raw.get("completed_at"),
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
