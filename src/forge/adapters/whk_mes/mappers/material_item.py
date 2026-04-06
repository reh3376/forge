"""Map MES Item -> Forge MaterialItem.

MES Item fields (from Prisma schema):
    id, globalId, erpId, name, description, vendorId,
    itemGroupId, isActive, unit

Forge MaterialItem fields:
    item_number, name, description, category, unit_of_measure,
    vendor_id, external_ids, is_active + provenance envelope
"""

from __future__ import annotations

import logging
from typing import Any

from forge.core.models.manufacturing.material_item import MaterialItem

logger = logging.getLogger(__name__)

_SOURCE_SYSTEM = "whk-mes"


def map_item(raw: dict[str, Any]) -> MaterialItem | None:
    """Map an MES Item dict to a Forge MaterialItem.

    Returns None if the item id or name is missing.
    """
    item_id = raw.get("id") or raw.get("item_id") or raw.get("itemId")
    name = raw.get("name") or raw.get("itemName") or raw.get("item_name")
    if not item_id or not name:
        logger.warning("Item dict missing id or name -- skipping: %s", raw)
        return None

    # Build item number from best available identifier
    item_number = (
        raw.get("erpId")
        or raw.get("erp_id")
        or raw.get("globalId")
        or raw.get("global_id")
        or str(item_id)
    )

    # External IDs for cross-system reconciliation
    external_ids: dict[str, str] = {}
    global_id = raw.get("globalId") or raw.get("global_id")
    if global_id:
        external_ids["global"] = str(global_id)
    erp_id = raw.get("erpId") or raw.get("erp_id")
    if erp_id:
        external_ids["erp"] = str(erp_id)

    # Category from item group
    category = (
        raw.get("category")
        or raw.get("itemClass")
        or raw.get("item_class")
        or raw.get("itemGroupName")
        or raw.get("item_group_name")
    )

    return MaterialItem(
        source_system=_SOURCE_SYSTEM,
        source_id=str(item_id),
        item_number=str(item_number),
        name=str(name),
        description=raw.get("description"),
        category=category,
        unit_of_measure=raw.get("unit") or raw.get("unitOfMeasure"),
        vendor_id=_str_or_none(raw.get("vendorId") or raw.get("vendor_id")),
        external_ids=external_ids,
        is_active=raw.get("isActive", True) if "isActive" in raw else raw.get("is_active", True),
        metadata={
            k: v
            for k, v in {
                "item_group_id": raw.get("itemGroupId") or raw.get("item_group_id"),
            }.items()
            if v is not None
        },
    )


def _str_or_none(val: Any) -> str | None:
    return str(val) if val else None
