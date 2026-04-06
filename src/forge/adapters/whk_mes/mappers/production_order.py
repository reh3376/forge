"""Map MES ProductionOrder + ScheduleOrder -> Forge models.

MES ProductionOrder fields (from Prisma schema):
    id, status, containerType, expectedQuantity, customerId,
    recipeId, lotId, whiskeyTypeId, startedAt, completedAt

MES ScheduleOrder fields (from Prisma schema):
    id, status, expectedStartDate, expectedEndDate, priority,
    productionOrderId, recipeId, customerId

ProductionOrder -> Forge ProductionOrder
ScheduleOrder -> Forge WorkOrder (queue-based scheduling)

Forge ProductionOrder fields:
    order_number, recipe_id, customer_id, status, product_type,
    planned_quantity, actual_quantity, unit_of_measure,
    planned_start, planned_end, actual_start, actual_end,
    lot_ids, priority + provenance envelope

Forge WorkOrder fields:
    title, order_type, status, priority, parent_id,
    assigned_asset_id, planned_start, planned_end,
    production_order_id + provenance envelope
"""

from __future__ import annotations

import logging
from typing import Any

from forge.core.models.manufacturing.enums import (
    OrderStatus,
    WorkOrderPriority,
    WorkOrderStatus,
)
from forge.core.models.manufacturing.production_order import ProductionOrder
from forge.core.models.manufacturing.work_order import WorkOrder

logger = logging.getLogger(__name__)

_SOURCE_SYSTEM = "whk-mes"

# MES production order status -> Forge OrderStatus
_PRO_STATUS_MAP: dict[str, OrderStatus] = {
    "DRAFT": OrderStatus.DRAFT,
    "CREATED": OrderStatus.PLANNED,
    "PLANNED": OrderStatus.PLANNED,
    "RELEASED": OrderStatus.RELEASED,
    "STARTED": OrderStatus.IN_PROGRESS,
    "IN_PROGRESS": OrderStatus.IN_PROGRESS,
    "RUNNING": OrderStatus.IN_PROGRESS,
    "PAUSED": OrderStatus.PAUSED,
    "COMPLETED": OrderStatus.COMPLETE,
    "COMPLETE": OrderStatus.COMPLETE,
    "CLOSED": OrderStatus.CLOSED,
    "CANCELLED": OrderStatus.CANCELLED,
}

# MES schedule order status -> Forge WorkOrderStatus
_SO_STATUS_MAP: dict[str, WorkOrderStatus] = {
    "CREATED": WorkOrderStatus.PENDING,
    "DRAFT": WorkOrderStatus.DRAFT,
    "QUEUED": WorkOrderStatus.SCHEDULED,
    "SCHEDULED": WorkOrderStatus.SCHEDULED,
    "STARTED": WorkOrderStatus.IN_PROGRESS,
    "IN_PROGRESS": WorkOrderStatus.IN_PROGRESS,
    "PAUSED": WorkOrderStatus.PAUSED,
    "COMPLETED": WorkOrderStatus.COMPLETE,
    "COMPLETE": WorkOrderStatus.COMPLETE,
    "CANCELLED": WorkOrderStatus.CANCELLED,
}

# MES priority -> Forge WorkOrderPriority
_PRIORITY_MAP: dict[str, WorkOrderPriority] = {
    "LOW": WorkOrderPriority.LOW,
    "NORMAL": WorkOrderPriority.NORMAL,
    "HIGH": WorkOrderPriority.HIGH,
    "URGENT": WorkOrderPriority.URGENT,
    "CRITICAL": WorkOrderPriority.URGENT,
}


def map_production_order(raw: dict[str, Any]) -> ProductionOrder | None:
    """Map an MES ProductionOrder dict to a Forge ProductionOrder.

    Returns None if the order id is missing.
    """
    order_id = raw.get("id") or raw.get("production_order_id") or raw.get("productionOrderId")
    if not order_id:
        logger.warning("ProductionOrder dict missing id -- skipping: %s", raw)
        return None

    status_raw = str(raw.get("status", "")).upper()

    # Order number: use itemNumber or globalId if available, else id
    order_number = (
        raw.get("itemNumber")
        or raw.get("item_number")
        or raw.get("globalId")
        or raw.get("global_id")
        or str(order_id)
    )

    # Lot IDs: may be a single lotId or list
    lot_ids: list[str] = []
    lot_id = raw.get("lotId") or raw.get("lot_id")
    if lot_id:
        lot_ids.append(str(lot_id))

    return ProductionOrder(
        source_system=_SOURCE_SYSTEM,
        source_id=str(order_id),
        order_number=str(order_number),
        recipe_id=_str_or_none(raw.get("recipeId") or raw.get("recipe_id")),
        customer_id=_str_or_none(raw.get("customerId") or raw.get("customer_id")),
        status=_PRO_STATUS_MAP.get(status_raw, OrderStatus.DRAFT),
        product_type=raw.get("whiskeyType") or raw.get("whiskey_type"),
        planned_quantity=_float_or_none(
            raw.get("expectedQuantity") or raw.get("expected_quantity")
        ),
        actual_quantity=_float_or_none(
            raw.get("actualQuantity") or raw.get("actual_quantity")
        ),
        unit_of_measure=raw.get("containerType") or raw.get("container_type"),
        planned_start=_parse_time_str(
            raw.get("expectedStartDate") or raw.get("expected_start_date")
        ),
        planned_end=_parse_time_str(
            raw.get("expectedEndDate") or raw.get("expected_end_date")
        ),
        actual_start=_parse_time_str(
            raw.get("startedAt") or raw.get("started_at")
        ),
        actual_end=_parse_time_str(
            raw.get("completedAt") or raw.get("completed_at")
        ),
        lot_ids=lot_ids,
        priority=_int_or_none(raw.get("priority")),
        metadata={
            k: v
            for k, v in {
                "container_type": raw.get("containerType") or raw.get("container_type"),
                "whiskey_type_id": raw.get("whiskeyTypeId") or raw.get("whiskey_type_id"),
            }.items()
            if v is not None
        },
    )


def map_schedule_order(raw: dict[str, Any]) -> WorkOrder | None:
    """Map an MES ScheduleOrder dict to a Forge WorkOrder.

    ScheduleOrders are queue-based scheduling entries that place
    production orders into the production queue with timeline
    calculations. They map to WorkOrder because they represent
    assignable units of scheduled work.

    Returns None if the schedule order id is missing.
    """
    so_id = raw.get("id") or raw.get("schedule_order_id") or raw.get("scheduleOrderId")
    if not so_id:
        logger.warning("ScheduleOrder dict missing id -- skipping: %s", raw)
        return None

    status_raw = str(raw.get("status", "")).upper()
    priority_raw = str(raw.get("priority") or "NORMAL").upper()

    # Title: use descriptive name if available
    title = (
        raw.get("title")
        or raw.get("name")
        or f"Schedule Order {so_id}"
    )

    return WorkOrder(
        source_system=_SOURCE_SYSTEM,
        source_id=str(so_id),
        title=str(title),
        order_type="SCHEDULE",
        status=_SO_STATUS_MAP.get(status_raw, WorkOrderStatus.PENDING),
        priority=_PRIORITY_MAP.get(priority_raw, WorkOrderPriority.NORMAL),
        planned_start=_parse_time_str(
            raw.get("expectedStartDate") or raw.get("expected_start_date")
        ),
        planned_end=_parse_time_str(
            raw.get("expectedEndDate") or raw.get("expected_end_date")
        ),
        production_order_id=_str_or_none(
            raw.get("productionOrderId") or raw.get("production_order_id")
        ),
        lot_id=_str_or_none(raw.get("lotId") or raw.get("lot_id")),
        metadata={
            k: v
            for k, v in {
                "queue_name": raw.get("queueName") or raw.get("queue_name"),
                "queue_index": raw.get("queueIndex") or raw.get("queue_index"),
                "recipe_id": raw.get("recipeId") or raw.get("recipe_id"),
                "customer_id": raw.get("customerId") or raw.get("customer_id"),
            }.items()
            if v is not None
        },
    )


def _parse_time_str(val: Any) -> Any:
    """Parse a datetime string, returning None if invalid."""
    if val is None:
        return None
    if isinstance(val, str):
        from datetime import datetime

        try:
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return None
    return val


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
