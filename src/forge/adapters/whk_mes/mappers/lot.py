"""Map MES Lot -> Forge Lot.

MES Lot fields (from Prisma schema):
    id, globalId, externalId, whiskeyType, whiskeyTypeId, status,
    quantity, unit, recipeId, customerId

The MES Lot model is structurally similar to WMS Lot. The lot_id
field is a cross-spoke field -- it enables traceability from
production (MES) through storage (WMS).

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

_SOURCE_SYSTEM = "whk-mes"


def map_lot(raw: dict[str, Any]) -> Lot | None:
    """Map an MES Lot dict to a Forge Lot.

    Returns None if the id or a lot number equivalent is missing.
    """
    lot_id = raw.get("id") or raw.get("lot_id") or raw.get("lotId")
    lot_number = (
        raw.get("globalId")
        or raw.get("global_id")
        or raw.get("externalId")
        or raw.get("external_id")
        or raw.get("lotNumber")
        or raw.get("lot_number")
    )
    if not lot_id or not lot_number:
        logger.warning("Lot dict missing id or lot_number -- skipping: %s", raw)
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
        quantity=_float_or_none(raw.get("quantity")),
        unit_of_measure=raw.get("unit") or raw.get("unitOfMeasure"),
        metadata={
            k: v
            for k, v in {
                "whiskey_type_id": raw.get("whiskeyTypeId")
                or raw.get("whiskey_type_id"),
                "external_id": raw.get("externalId") or raw.get("external_id"),
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
