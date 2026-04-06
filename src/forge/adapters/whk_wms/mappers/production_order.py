"""Map WMS ProductionOrder → Forge ProductionOrder.

WMS ProductionOrder fields (from Prisma schema):
    id, globalId, data (JSON — orderNumber, recipeId, customerId,
    productType, status, quantities), minQuantity, maxQuantity,
    barrelingStatus

Forge ProductionOrder fields:
    order_number, recipe_id, customer_id, status, product_type,
    planned_quantity, actual_quantity, unit_of_measure, planned_start,
    planned_end, actual_start, actual_end, lot_ids, priority
    + provenance envelope
"""

from __future__ import annotations

import logging
from typing import Any

from forge.core.models.manufacturing.enums import OrderStatus
from forge.core.models.manufacturing.production_order import ProductionOrder

logger = logging.getLogger(__name__)

_SOURCE_SYSTEM = "whk-wms"

# WMS production order status → Forge OrderStatus
_STATUS_MAP: dict[str, OrderStatus] = {
    "DRAFT": OrderStatus.DRAFT,
    "PLANNED": OrderStatus.PLANNED,
    "RELEASED": OrderStatus.RELEASED,
    "IN_PROGRESS": OrderStatus.IN_PROGRESS,
    "ACTIVE": OrderStatus.IN_PROGRESS,
    "BARRELING": OrderStatus.IN_PROGRESS,
    "PAUSED": OrderStatus.PAUSED,
    "COMPLETE": OrderStatus.COMPLETE,
    "COMPLETED": OrderStatus.COMPLETE,
    "CLOSED": OrderStatus.CLOSED,
    "CANCELLED": OrderStatus.CANCELLED,
    "CANCELED": OrderStatus.CANCELLED,
}


def map_production_order(raw: dict[str, Any]) -> ProductionOrder | None:
    """Map a WMS ProductionOrder dict to a Forge ProductionOrder.

    WMS stores order details in a nested `data` JSON field.
    Returns None if the id or order_number is missing.
    """
    order_id = raw.get("id") or raw.get("production_order_id")
    if not order_id:
        logger.warning("ProductionOrder missing id — skipping: %s", raw)
        return None

    # WMS embeds order details in 'data' JSON
    data = raw.get("data", {}) or {}
    if isinstance(data, str):
        import json

        try:
            data = json.loads(data)
        except (json.JSONDecodeError, TypeError):
            data = {}

    order_number = (
        raw.get("orderNumber")
        or raw.get("order_number")
        or data.get("orderNumber")
        or raw.get("globalId")
        or raw.get("global_id")
        or str(order_id)
    )

    status_raw = str(
        raw.get("status")
        or raw.get("barrelingStatus")
        or data.get("status")
        or "DRAFT"
    ).upper()

    # Quantities — WMS uses minQuantity/maxQuantity for barrel count targets
    planned_qty = _float_or_none(
        raw.get("maxQuantity")
        or raw.get("max_quantity")
        or data.get("targetQuantity")
    )
    actual_qty = _float_or_none(
        raw.get("actualQuantity")
        or raw.get("actual_quantity")
        or data.get("actualQuantity")
    )

    lot_ids_raw = raw.get("lotIds") or raw.get("lot_ids") or data.get("lotIds") or []
    lot_ids = [str(lid) for lid in lot_ids_raw] if isinstance(lot_ids_raw, list) else []

    return ProductionOrder(
        source_system=_SOURCE_SYSTEM,
        source_id=str(order_id),
        order_number=str(order_number),
        recipe_id=_str_or_none(
            raw.get("recipeId") or raw.get("recipe_id") or data.get("recipeId")
        ),
        customer_id=_str_or_none(
            raw.get("customerId") or raw.get("customer_id") or data.get("customerId")
        ),
        status=_STATUS_MAP.get(status_raw, OrderStatus.DRAFT),
        product_type=(
            raw.get("productType")
            or raw.get("product_type")
            or data.get("productType")
        ),
        planned_quantity=planned_qty,
        actual_quantity=actual_qty,
        unit_of_measure="barrels",
        planned_start=_parse_datetime(
            raw.get("plannedStart") or raw.get("planned_start") or data.get("startDate")
        ),
        planned_end=_parse_datetime(
            raw.get("plannedEnd") or raw.get("planned_end") or data.get("endDate")
        ),
        actual_start=_parse_datetime(
            raw.get("actualStart") or raw.get("actual_start")
        ),
        actual_end=_parse_datetime(
            raw.get("actualEnd") or raw.get("actual_end")
        ),
        lot_ids=lot_ids,
        priority=_int_or_none(raw.get("priority") or data.get("priority")),
        metadata={
            k: v
            for k, v in {
                "global_id": raw.get("globalId") or raw.get("global_id"),
                "barreling_status": raw.get("barrelingStatus"),
                "min_quantity": raw.get("minQuantity") or raw.get("min_quantity"),
            }.items()
            if v is not None
        },
    )


def _str_or_none(val: Any) -> str | None:
    return str(val) if val else None


def _float_or_none(val: Any) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _int_or_none(val: Any) -> int | None:
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _parse_datetime(val: Any) -> Any:
    if val is None:
        return None
    if isinstance(val, str):
        from datetime import datetime

        try:
            return datetime.fromisoformat(val)
        except (ValueError, TypeError):
            return None
    return val
