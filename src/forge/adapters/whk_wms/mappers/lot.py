"""Map WMS Lot → Forge Lot.

WMS Lot fields (from Prisma schema):
    id, lotNumber, recipeId, productionOrderId, whiskeyTypeId,
    customerId, status, bblTotal, totalPGs, totalWGs, mashbillId

Forge Lot fields:
    lot_number, product_type, recipe_id, production_order_id,
    customer_id, status, quantity, unit_of_measure, parent_lot_id,
    unit_count + provenance envelope
"""

from __future__ import annotations

import logging
from typing import Any

from forge.core.models.manufacturing.lot import Lot

logger = logging.getLogger(__name__)

_SOURCE_SYSTEM = "whk-wms"


def map_lot(raw: dict[str, Any]) -> Lot | None:
    """Map a WMS Lot dict to a Forge Lot.

    Returns None if the lot id or lot_number is missing.
    """
    lot_id = raw.get("id") or raw.get("lot_id")
    lot_number = raw.get("lotNumber") or raw.get("lot_number")
    if not lot_id or not lot_number:
        logger.warning("Lot dict missing id or lotNumber — skipping: %s", raw)
        return None

    return Lot(
        source_system=_SOURCE_SYSTEM,
        source_id=str(lot_id),
        lot_number=str(lot_number),
        product_type=raw.get("whiskeyType") or raw.get("whiskey_type"),
        recipe_id=_str_or_none(raw.get("recipeId") or raw.get("recipe_id")),
        production_order_id=_str_or_none(
            raw.get("productionOrderId") or raw.get("production_order_id")
        ),
        customer_id=_str_or_none(raw.get("customerId") or raw.get("customer_id")),
        status=str(raw.get("status", "CREATED")).upper(),
        quantity=_float_or_none(raw.get("totalPGs") or raw.get("total_pgs")),
        unit_of_measure="proof_gallons" if raw.get("totalPGs") else None,
        parent_lot_id=_str_or_none(
            raw.get("parentLotId") or raw.get("parent_lot_id")
        ),
        unit_count=_int_or_none(raw.get("bblTotal") or raw.get("bbl_total")),
        metadata={
            k: v
            for k, v in {
                "mashbill_id": raw.get("mashbillId") or raw.get("mashbill_id"),
                "wine_gallons": raw.get("totalWGs") or raw.get("total_wgs"),
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
