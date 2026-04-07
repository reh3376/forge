"""Map ERPI Item/ItemGroup/BomItem → Forge MaterialItem.

ERPI fields (from Prisma schema):
    Item: id, globalId, name, type, category, unitOfMeasure, transactionInitiator, ...
    ItemGroup: id, globalId, name, description
    BomItem: id, globalId, bomId, itemId, quantity, unit

Forge MaterialItem fields:
    item_number, name, description, category, unit_of_measure, vendor_id,
    external_ids, is_active
"""

from __future__ import annotations

import logging
from typing import Any

from forge.core.models.manufacturing.material_item import MaterialItem

logger = logging.getLogger(__name__)

_SOURCE_SYSTEM = "whk-erpi"


def map_item(raw: dict[str, Any]) -> MaterialItem | None:
    """Map an ERPI Item dict to a Forge MaterialItem."""
    global_id = raw.get("globalId") or raw.get("global_id")
    name = raw.get("name")
    if not global_id or not name:
        logger.warning("Item missing globalId or name — skipping: %s", raw)
        return None

    return MaterialItem(
        source_system=_SOURCE_SYSTEM,
        source_id=str(raw.get("id", global_id)),
        item_number=str(global_id),
        name=str(name),
        description=_str_or_none(raw.get("description")),
        category=_str_or_none(raw.get("category") or raw.get("type")),
        unit_of_measure=_str_or_none(
            raw.get("unitOfMeasure") or raw.get("unit_of_measure")
        ),
        vendor_id=_str_or_none(raw.get("vendorId") or raw.get("vendor_id")),
        external_ids=_build_external_ids(raw),
        is_active=raw.get("active", True),
        metadata=_build_metadata(raw),
    )


def map_item_group(raw: dict[str, Any]) -> MaterialItem | None:
    """Map an ERPI ItemGroup dict to a Forge MaterialItem (category-level).

    ItemGroups are classification containers — they map to MaterialItem
    with category='item_group' to distinguish them from individual items.
    """
    global_id = raw.get("globalId") or raw.get("global_id")
    name = raw.get("name")
    if not global_id or not name:
        logger.warning("ItemGroup missing globalId or name — skipping: %s", raw)
        return None

    return MaterialItem(
        source_system=_SOURCE_SYSTEM,
        source_id=str(raw.get("id", global_id)),
        item_number=str(global_id),
        name=str(name),
        description=_str_or_none(raw.get("description")),
        category="item_group",
        external_ids=_build_external_ids(raw),
        is_active=True,
        metadata=_build_metadata(raw),
    )


def map_bom_item(raw: dict[str, Any]) -> MaterialItem | None:
    """Map an ERPI BomItem dict to a Forge MaterialItem (BOM line item).

    BomItems are material requirements within a BOM. They reference an
    Item by itemId and carry quantity/unit data in metadata.
    """
    global_id = raw.get("globalId") or raw.get("global_id")
    item_id = raw.get("itemId") or raw.get("item_id")
    if not global_id:
        logger.warning("BomItem missing globalId — skipping: %s", raw)
        return None

    return MaterialItem(
        source_system=_SOURCE_SYSTEM,
        source_id=str(raw.get("id", global_id)),
        item_number=str(item_id or global_id),
        name=f"BOM Line: {item_id or global_id}",
        category="bom_item",
        unit_of_measure=_str_or_none(raw.get("unit")),
        external_ids=_build_external_ids(raw),
        is_active=True,
        metadata={
            **_build_metadata(raw),
            "bom_id": raw.get("bomId") or raw.get("bom_id"),
            "quantity": raw.get("quantity"),
        },
    )


def _build_external_ids(raw: dict[str, Any]) -> dict[str, str]:
    ids: dict[str, str] = {}
    if raw.get("globalId"):
        ids["global"] = str(raw["globalId"])
    if raw.get("id"):
        ids["erpi"] = str(raw["id"])
    return ids


def _build_metadata(raw: dict[str, Any]) -> dict[str, Any]:
    meta: dict[str, Any] = {}
    for key in ("transactionInitiator", "transactionStatus", "transactionType", "schemaVersion"):
        val = raw.get(key)
        if val is not None:
            meta[key] = val
    return meta


def _str_or_none(val: Any) -> str | None:
    return str(val) if val else None
