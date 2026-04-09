"""Map CMMS inventory entities → Forge MaterialItem, BusinessEntity, and OperationalEvent.

CMMS inventory management entities:
    Item: Material items (shared with ERPI, so mostly ref'd by foreign key)
    Kit: Maintenance kits (collections of items for specific maintenance tasks)
    Vendor: Equipment/parts vendors
    InventoryLocation: Physical storage locations
    InventoryInvestigation: Physical count reconciliation audit records

Forge equivalents:
    Item → MaterialItem (item_number, name, category, unit_of_measure, external_ids)
    Kit → MaterialItem (composite, kitName → name, items list in metadata)
    Vendor → BusinessEntity (entity_type=VENDOR, name, contact_info)
    InventoryLocation → dict (path-based location hierarchy, for context enrichment)
    InventoryInvestigation → OperationalEvent (event_type=inventory_audit, reconciliation data)
"""

from __future__ import annotations

import logging
from typing import Any

from forge.core.models.manufacturing.business_entity import BusinessEntity
from forge.core.models.manufacturing.enums import EntityType
from forge.core.models.manufacturing.operational_event import OperationalEvent

logger = logging.getLogger(__name__)

_SOURCE_SYSTEM = "whk-cmms"


def map_item(raw: dict[str, Any]) -> dict[str, Any]:
    """Map a CMMS Item to metadata dict.

    Items in CMMS are primarily references to ERPI items. This mapper
    returns metadata for embedding in maintenance records, not a full
    MaterialItem (which comes from ERPI directly).
    """
    global_id = raw.get("globalId") or raw.get("global_id") or raw.get("id")
    item_name = raw.get("itemName") or raw.get("item_name")

    if not global_id or not item_name:
        logger.warning("Item missing globalId or itemName — skipping: %s", raw)
        return {}

    return {
        "entity_type": "item",
        "item_id": str(global_id),
        "item_name": str(item_name),
        "item_part_no": raw.get("itemPartNo") or raw.get("item_part_no"),
        "item_class": raw.get("itemClass") or raw.get("item_class"),
        "inventory_quantity": raw.get("inventoryQuantity") or raw.get("inventory_quantity"),
        "min_level": raw.get("minInventoryLevel") or raw.get("min_inventory_level"),
        "max_level": raw.get("maxInventoryLevel") or raw.get("max_inventory_level"),
        "cost_at_last_purchase": raw.get("costAtLastPurchase") or raw.get("cost_at_last_purchase"),
        "erp_id": raw.get("erpId") or raw.get("erp_id"),
        "global_id": raw.get("globalId") or raw.get("global_id"),
        "is_locally_tracked": raw.get("isLocallyTracked") or raw.get("is_locally_tracked", False),
        "obsolete_item": raw.get("obsoleteItem") or raw.get("obsolete_item", False),
    }


def map_kit(raw: dict[str, Any]) -> dict[str, Any]:
    """Map a CMMS Kit to metadata dict (or could return MaterialItem for composite items).

    Kits are pre-assembled maintenance packages containing multiple items.
    For Forge, we return metadata since kits are primarily used in the context
    of work orders (which reference kits for material allocation).
    """
    global_id = raw.get("globalId") or raw.get("global_id") or raw.get("id")
    kit_name = raw.get("kitName") or raw.get("kit_name")

    if not global_id or not kit_name:
        logger.warning("Kit missing globalId or kitName — skipping: %s", raw)
        return {}

    return {
        "entity_type": "kit",
        "kit_id": str(global_id),
        "kit_name": str(kit_name),
        "external_ids": _build_external_ids(raw),
        "items": raw.get("items", []),  # Array of item references
        "item_quantities_used": raw.get("itemQuantitiesUsed") or raw.get("item_quantities_used"),
        "work_orders": raw.get("workOrders") or raw.get("work_orders", []),  # Associated WOs
        **_build_metadata(raw),
    }


def map_vendor(raw: dict[str, Any]) -> BusinessEntity | None:
    """Map a CMMS Vendor to a Forge BusinessEntity."""
    global_id = raw.get("globalId") or raw.get("global_id") or raw.get("id")
    name = raw.get("name")

    if not global_id or not name:
        logger.warning("Vendor missing globalId or name — skipping: %s", raw)
        return None

    return BusinessEntity(
        source_system=_SOURCE_SYSTEM,
        source_id=str(global_id),
        entity_type=EntityType.VENDOR,
        name=str(name),
        external_ids=_build_external_ids(raw),
        is_active=raw.get("active", True),
        metadata={
            **_build_metadata(raw),
            "contact_information": raw.get("contactInformation") or raw.get("contact_information"),
            "additional_details": raw.get("additionalDetails") or raw.get("additional_details"),
        },
    )


def map_inventory_location(raw: dict[str, Any]) -> dict[str, Any]:
    """Map a CMMS InventoryLocation to metadata dict.

    Locations form a hierarchy (parent/children). Returned as metadata
    for enriching inventory records with location context.
    """
    global_id = raw.get("globalId") or raw.get("global_id") or raw.get("id")
    name = raw.get("name")
    path = raw.get("path")

    if not global_id or not name:
        logger.warning("InventoryLocation missing globalId or name — skipping: %s", raw)
        return {}

    return {
        "entity_type": "inventory_location",
        "location_id": str(global_id),
        "location_name": str(name),
        "location_path": str(path) if path else None,
        "parent_id": raw.get("parentId") or raw.get("parent_id"),
        "children": raw.get("children", []),  # Child locations
        "external_ids": _build_external_ids(raw),
        **_build_metadata(raw),
    }


def map_inventory_investigation(raw: dict[str, Any]) -> OperationalEvent | None:
    """Map a CMMS InventoryInvestigation to a Forge OperationalEvent.

    Investigations represent physical count audits (cycle counts, full inventory counts).
    They reconcile physical counts against digital records, enabling audit trails
    and discrepancy investigation.
    """
    global_id = raw.get("globalId") or raw.get("global_id") or raw.get("id")

    if not global_id:
        logger.warning("InventoryInvestigation missing globalId — skipping: %s", raw)
        return None

    return OperationalEvent(
        source_system=_SOURCE_SYSTEM,
        source_id=str(global_id),
        event_type="inventory_audit",
        description=f"Inventory Investigation {global_id}",
        occurred_at=_parse_timestamp(
            raw.get("createdAt") or raw.get("created_at")
        ),
        location=_str_or_none(raw.get("location")),
        metadata={
            **_build_metadata(raw),
            "physical_count": raw.get("physicalCount") or raw.get("physical_count"),
            "digital_count": raw.get("digitalCount") or raw.get("digital_count"),
            "location_id": raw.get("locationId") or raw.get("location_id"),
            "work_order_associated": raw.get("workOrderAssociated") or raw.get("work_order_associated"),
            "discrepancy": _compute_discrepancy(
                raw.get("physicalCount"),
                raw.get("digitalCount"),
            ),
        },
    )


# ── Helper Functions ──────────────────────────────────────────────────

def _build_external_ids(raw: dict[str, Any]) -> dict[str, str]:
    ids: dict[str, str] = {}
    if raw.get("globalId"):
        ids["global"] = str(raw["globalId"])
    if raw.get("id"):
        ids["cmms"] = str(raw["id"])
    return ids


def _build_metadata(raw: dict[str, Any]) -> dict[str, Any]:
    meta: dict[str, Any] = {}
    for key in ("createdAt", "updatedAt", "created_at", "updated_at"):
        val = raw.get(key)
        if val is not None:
            meta[key] = val
    return meta


def _str_or_none(val: Any) -> str | None:
    return str(val) if val else None


def _parse_timestamp(value: Any) -> str:
    """Parse timestamp to ISO string, fallback to 'unknown'."""
    if value is None:
        return "unknown"
    return str(value)


def _compute_discrepancy(physical: Any, digital: Any) -> int | None:
    """Compute count discrepancy (physical - digital)."""
    try:
        if physical is not None and digital is not None:
            return int(physical) - int(digital)
    except (ValueError, TypeError):
        pass
    return None
