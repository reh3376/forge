"""ERPI context builder — extract operational context from ERPI messages.

ERPI messages carry rich transaction metadata that most manufacturing
systems lack. The context builder extracts these as first-class context
fields rather than leaving them buried in the payload:

- transactionInitiator (WH vs ERP) → data provenance direction
- transactionStatus (PENDING/SENT/CONFIRMED) → sync reliability state
- transactionType (CREATE/UPDATE/DELETE) → operation semantic
- globalId → cross-system entity correlation key

These fields enable Forge to answer decision-quality questions like
"which recipe changes came from ERP vs. the manufacturing floor?"
"""

from __future__ import annotations

import logging
from typing import Any

from forge.core.models.contextual_record import RecordContext

logger = logging.getLogger(__name__)

# ── Data Flow Direction Mapping ────────────────────────────────

_INITIATOR_TO_DIRECTION: dict[str, str] = {
    "ERP": "inbound_from_erp",
    "Erp": "inbound_from_erp",
    "WH": "outbound_to_erp",
    "Wh": "outbound_to_erp",
}

# ── Entity → Domain Category ──────────────────────────────────
# Used to set the area field for grouping in Forge dashboards.

_ENTITY_CATEGORY: dict[str, str] = {
    # ERP Master Data
    "Item": "master_data",
    "ItemGroup": "master_data",
    "Vendor": "master_data",
    "Customer": "master_data",
    "Account": "master_data",
    "Asset": "master_data",
    "Location": "master_data",
    # Recipe & BOM
    "Recipe": "recipe_management",
    "RecipeParameter": "recipe_management",
    "RecipeGroup": "recipe_management",
    "Bom": "recipe_management",
    "BomItem": "recipe_management",
    # Manufacturing Execution
    "ProductionOrder": "production",
    "ProductionOrderUnitProcedure": "production",
    "UnitProcedure": "production",
    "Operation": "production",
    "EquipmentPhase": "production",
    "ProductionSchedule": "scheduling",
    "ScheduleOrder": "scheduling",
    "ScheduleQueue": "scheduling",
    # Purchase & Sales
    "PurchaseOrder": "procurement",
    "SalesOrder": "sales",
    # Inventory & Warehouse
    "Inventory": "inventory",
    "InventoryTransfer": "inventory",
    "Barrel": "barrel_tracking",
    "BarrelEvent": "barrel_tracking",
    "BarrelReceipt": "barrel_tracking",
    "Lot": "lot_management",
    "Kit": "inventory",
    "Batch": "lot_management",
    "ItemReceipt": "receiving",
}


def build_record_context(
    raw_event: dict[str, Any],
    *,
    exchange_name: str | None = None,
) -> RecordContext:
    """Transform a raw ERPI RabbitMQ message into a RecordContext.

    Extracts ERPI's native transaction tracking fields as first-class
    context, preserving the data provenance that enables cross-module
    decision analysis.

    Args:
        raw_event: Full ERPI message envelope (outer dict with 'data' key).
        exchange_name: Optional RabbitMQ exchange name for topic derivation.

    Returns:
        RecordContext with ERPI-specific fields in the extra dict.
    """
    envelope = raw_event.get("data", raw_event)
    payload = envelope.get("data", {})

    # ── Core Identity Fields ───────────────────────────────────
    record_name = str(envelope.get("recordName", "unknown"))
    event_type = str(envelope.get("event_type", "unknown"))
    message_id = envelope.get("messageId") or envelope.get("id")

    # ── ERPI Transaction Fields ────────────────────────────────
    global_id = payload.get("globalId") or payload.get("global_id") or ""
    transaction_initiator = str(
        payload.get("transactionInitiator")
        or payload.get("transaction_initiator")
        or "unknown"
    ).upper()
    # Normalize case variants (Wh → WH, Erp → ERP)
    if transaction_initiator in ("WH", "ERP"):
        pass  # already normalized
    elif transaction_initiator.upper() in ("WH", "ERP"):
        transaction_initiator = transaction_initiator.upper()
    else:
        transaction_initiator = "UNKNOWN"

    transaction_status = str(
        payload.get("transactionStatus")
        or payload.get("transaction_status")
        or "UNKNOWN"
    ).upper()

    transaction_type = str(
        payload.get("transactionType")
        or payload.get("transaction_type")
        or "UNKNOWN"
    ).upper()

    schema_version = payload.get("schemaVersion") or payload.get("schema_version")

    # ── Derived Fields ─────────────────────────────────────────
    data_flow = _INITIATOR_TO_DIRECTION.get(
        payload.get("transactionInitiator", ""), "unknown"
    )
    category = _ENTITY_CATEGORY.get(record_name, "unknown")

    # ── Relational Context (entity-dependent) ──────────────────
    lot_id = _str_or_none(
        payload.get("lotId") or payload.get("lot_id") or payload.get("lot", {}).get("id")
    )
    recipe_id = _str_or_none(
        payload.get("recipeId") or payload.get("recipe_id") or payload.get("recipe", {}).get("id")
    )
    production_order_id = _str_or_none(
        payload.get("productionOrderId")
        or payload.get("production_order_id")
        or payload.get("productionOrder", {}).get("id")
    )
    equipment_id = _str_or_none(
        payload.get("equipmentPhaseId")
        or payload.get("equipment_phase_id")
        or payload.get("barrelId")
        or payload.get("barrel_id")
    )
    vendor_id = _str_or_none(
        payload.get("vendorId") or payload.get("vendor_id")
    )
    customer_id = _str_or_none(
        payload.get("customerId") or payload.get("customer_id")
    )

    # ── Build Extra Context Dict ───────────────────────────────
    extra: dict[str, Any] = {
        "cross_system_id": global_id,
        "source_system": "erpi",
        "entity_type": record_name,
        "event_type": event_type,
        "operation_type": transaction_type,
        "sync_state": transaction_status,
        "transaction_initiator": transaction_initiator,
        "data_flow_direction": data_flow,
        "entity_category": category,
    }
    if message_id:
        extra["message_id"] = str(message_id)
    if schema_version:
        extra["schema_version"] = str(schema_version)
    if vendor_id:
        extra["vendor_id"] = vendor_id
    if customer_id:
        extra["customer_id"] = customer_id
    if production_order_id:
        extra["production_order_id"] = production_order_id

    return RecordContext(
        equipment_id=equipment_id,
        area=category,
        site="whk01.distillery01",
        batch_id=production_order_id,
        lot_id=lot_id,
        recipe_id=recipe_id,
        extra=extra,
    )


def _str_or_none(val: Any) -> str | None:
    """Convert to str if truthy, else None."""
    return str(val) if val else None
