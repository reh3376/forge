"""Map MES Lot -> Forge Lot.

MES Lot fields (from Prisma schema):
    id, globalId, externalId, whiskeyType, whiskeyTypeId, status,
    quantity, unit, recipeId, customerId, item[] (ItemOnLots),
    continerItemId

The MES Lot model is structurally similar to WMS Lot. The lot_id
field is a cross-spoke field -- it enables traceability from
production (MES) through storage (WMS).

Forge Lot fields:
    lot_number, product_type, item_id, recipe_id, production_order_id,
    customer_id, status, quantity, unit_of_measure, parent_lot_id,
    unit_count + provenance envelope

``item_id`` (FB-010) is the lot's MaterialItem by source_id: ``itemId`` when
the payload names one, else the first of the MES item list (``item`` /
``items`` / ``itemIds``), the whole list kept in ``metadata["item_ids"]``
when there is more than one. ``continerItemId`` is the container, not the
material.
"""

from __future__ import annotations

import logging
from typing import Any

from forge.core.models.manufacturing.lot import Lot

logger = logging.getLogger(__name__)

_SOURCE_SYSTEM = "forge-mes"


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

    item_id, item_ids = _item_reference(raw)
    return Lot(
        source_system=_SOURCE_SYSTEM,
        source_id=str(lot_id),
        lot_number=str(lot_number),
        product_type=raw.get("whiskeyType") or raw.get("whiskey_type"),
        item_id=item_id,
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
                "whiskey_type_id": raw.get("whiskeyTypeId") or raw.get("whiskey_type_id"),
                "external_id": raw.get("externalId") or raw.get("external_id"),
                "item_ids": item_ids if len(item_ids) > 1 else None,
            }.items()
            if v is not None
        },
    )


def _item_reference(raw: dict[str, Any]) -> tuple[str | None, list[str]]:
    """The lot's MaterialItem reference and the full item list it came from (FB-010)."""
    listed = raw.get("itemIds") or raw.get("item_ids") or raw.get("items") or raw.get("item")
    ids: list[str] = []
    if isinstance(listed, list):
        for entry in listed:
            value = entry.get("id") if isinstance(entry, dict) else entry
            if value:
                ids.append(str(value))
    single = raw.get("itemId") or raw.get("item_id")
    if single:
        return str(single), ids
    return (ids[0] if ids else None), ids


def _str_or_none(val: Any) -> str | None:
    return str(val) if val else None


def _float_or_none(val: Any) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None
