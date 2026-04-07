"""Map ERPI production entities → Forge ProductionOrder / WorkOrder.

ERPI production entities follow the ISA-88 hierarchy:
    ProductionOrder → UnitProcedure → Operation → EquipmentPhase

These flow primarily from MES → ERPI → NetSuite (transactional data).
The ProductionOrderUnitProcedure has a special handler in ERPI that
posts directly to NetSuite via RESTlet.

Forge equivalents:
    ProductionOrder: id, order_number, recipe_id, status, quantities
    WorkOrder: id, order_number, status, assigned_to (used for ISA-88 procedures)
"""

from __future__ import annotations

import logging
from typing import Any

from forge.core.models.manufacturing.production_order import ProductionOrder
from forge.core.models.manufacturing.work_order import WorkOrder

logger = logging.getLogger(__name__)

_SOURCE_SYSTEM = "whk-erpi"


def map_production_order(raw: dict[str, Any]) -> ProductionOrder | None:
    """Map an ERPI ProductionOrder to a Forge ProductionOrder."""
    global_id = raw.get("globalId") or raw.get("global_id")
    if not global_id:
        logger.warning("ProductionOrder missing globalId — skipping: %s", raw)
        return None

    return ProductionOrder(
        source_system=_SOURCE_SYSTEM,
        source_id=str(raw.get("id", global_id)),
        order_number=str(global_id),
        recipe_id=_str_or_none(raw.get("recipeId") or raw.get("recipe_id")),
        status=str(raw.get("status", "CREATED")).upper(),
        metadata={
            **_build_metadata(raw),
            "entity_subtype": "production_order",
        },
    )


def map_production_order_unit_procedure(raw: dict[str, Any]) -> WorkOrder | None:
    """Map an ERPI ProductionOrderUnitProcedure to a Forge WorkOrder.

    This is the link between production orders and ISA-88 unit procedures.
    It has a special handler in ERPI that posts directly to NetSuite.
    """
    global_id = raw.get("globalId") or raw.get("global_id")
    if not global_id:
        logger.warning("ProductionOrderUnitProcedure missing globalId — skipping: %s", raw)
        return None

    production_order_id = raw.get("productionOrderId") or raw.get("production_order_id")
    unit_procedure_id = raw.get("unitProcedureId") or raw.get("unit_procedure_id")

    return WorkOrder(
        source_system=_SOURCE_SYSTEM,
        source_id=str(raw.get("id", global_id)),
        title=str(global_id),
        order_type="production_order_unit_procedure",
        order_number=str(global_id),
        status=_map_work_order_status(raw.get("status", "PENDING")),
        metadata={
            **_build_metadata(raw),
            "entity_subtype": "production_order_unit_procedure",
            "production_order_id": production_order_id,
            "unit_procedure_id": unit_procedure_id,
            "netsuite_direct_post": True,
        },
    )


def map_unit_procedure(raw: dict[str, Any]) -> WorkOrder | None:
    """Map an ERPI UnitProcedure to a Forge WorkOrder (ISA-88 level 2)."""
    global_id = raw.get("globalId") or raw.get("global_id")
    if not global_id:
        logger.warning("UnitProcedure missing globalId — skipping: %s", raw)
        return None

    return WorkOrder(
        source_system=_SOURCE_SYSTEM,
        source_id=str(raw.get("id", global_id)),
        title=str(global_id),
        order_type="unit_procedure",
        order_number=str(global_id),
        status=_map_work_order_status(raw.get("status", "PENDING")),
        metadata={
            **_build_metadata(raw),
            "entity_subtype": "unit_procedure",
            "isa88_level": "unit_procedure",
        },
    )


def map_operation(raw: dict[str, Any]) -> WorkOrder | None:
    """Map an ERPI Operation to a Forge WorkOrder (ISA-88 level 3)."""
    global_id = raw.get("globalId") or raw.get("global_id")
    if not global_id:
        logger.warning("Operation missing globalId — skipping: %s", raw)
        return None

    unit_procedure_id = raw.get("unitProcedureId") or raw.get("unit_procedure_id")

    return WorkOrder(
        source_system=_SOURCE_SYSTEM,
        source_id=str(raw.get("id", global_id)),
        title=str(global_id),
        order_type="operation",
        order_number=str(global_id),
        status=_map_work_order_status(raw.get("status", "PENDING")),
        metadata={
            **_build_metadata(raw),
            "entity_subtype": "operation",
            "isa88_level": "operation",
            "parent_unit_procedure_id": unit_procedure_id,
        },
    )


def map_equipment_phase(raw: dict[str, Any]) -> WorkOrder | None:
    """Map an ERPI EquipmentPhase to a Forge WorkOrder (ISA-88 level 4)."""
    global_id = raw.get("globalId") or raw.get("global_id")
    if not global_id:
        logger.warning("EquipmentPhase missing globalId — skipping: %s", raw)
        return None

    operation_id = raw.get("operationId") or raw.get("operation_id")

    return WorkOrder(
        source_system=_SOURCE_SYSTEM,
        source_id=str(raw.get("id", global_id)),
        title=str(global_id),
        order_type="equipment_phase",
        order_number=str(global_id),
        status=_map_work_order_status(raw.get("status", "PENDING")),
        metadata={
            **_build_metadata(raw),
            "entity_subtype": "equipment_phase",
            "isa88_level": "equipment_phase",
            "parent_operation_id": operation_id,
        },
    )


def _build_metadata(raw: dict[str, Any]) -> dict[str, Any]:
    meta: dict[str, Any] = {}
    for key in ("transactionInitiator", "transactionStatus", "transactionType", "schemaVersion"):
        val = raw.get(key)
        if val is not None:
            meta[key] = val
    return meta


def _str_or_none(val: Any) -> str | None:
    return str(val) if val else None


def _map_work_order_status(erpi_status: Any) -> str:
    """Map ERPI status to valid WorkOrderStatus.

    ERPI uses 'ACTIVE' for ISA-88 procedures, which maps to IN_PROGRESS
    in the WorkOrder model. CREATED/CREATED maps to PENDING.
    """
    status_str = str(erpi_status or "PENDING").upper()

    # Map common ERPI statuses to WorkOrder statuses
    mapping = {
        "ACTIVE": "IN_PROGRESS",
        "CREATED": "PENDING",
        "COMPLETE": "COMPLETE",
        "DRAFT": "DRAFT",
        "SCHEDULED": "SCHEDULED",
        "PAUSED": "PAUSED",
        "CANCELLED": "CANCELLED",
    }

    return mapping.get(status_str, "PENDING")
