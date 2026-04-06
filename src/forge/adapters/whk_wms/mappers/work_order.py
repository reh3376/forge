"""Map WMS WarehouseJobs → Forge WorkOrder.

WMS WarehouseJobs fields (from Prisma schema):
    id, title, jobType, status, priority, eventTypeId,
    decompositionStrategy, hierarchyLevel, parentJobId,
    templateId, assignedToId, createdAt, updatedAt,
    startDate, endDate

Forge WorkOrder fields:
    title, order_type, status, priority, parent_id,
    assigned_asset_id, assigned_operator_id, planned_start,
    planned_end, actual_start, actual_end, production_order_id,
    lot_id + provenance envelope
"""

from __future__ import annotations

import logging
from typing import Any

from forge.core.models.manufacturing.enums import WorkOrderPriority, WorkOrderStatus
from forge.core.models.manufacturing.work_order import WorkOrder

logger = logging.getLogger(__name__)

_SOURCE_SYSTEM = "whk-wms"

# WMS job status → Forge WorkOrderStatus
_STATUS_MAP: dict[str, WorkOrderStatus] = {
    "DRAFT": WorkOrderStatus.DRAFT,
    "PENDING": WorkOrderStatus.PENDING,
    "SCHEDULED": WorkOrderStatus.SCHEDULED,
    "IN_PROGRESS": WorkOrderStatus.IN_PROGRESS,
    "ACTIVE": WorkOrderStatus.IN_PROGRESS,
    "PAUSED": WorkOrderStatus.PAUSED,
    "COMPLETE": WorkOrderStatus.COMPLETE,
    "COMPLETED": WorkOrderStatus.COMPLETE,
    "CANCELLED": WorkOrderStatus.CANCELLED,
    "CANCELED": WorkOrderStatus.CANCELLED,
}

# WMS priority → Forge WorkOrderPriority
_PRIORITY_MAP: dict[str, WorkOrderPriority] = {
    "LOW": WorkOrderPriority.LOW,
    "NORMAL": WorkOrderPriority.NORMAL,
    "HIGH": WorkOrderPriority.HIGH,
    "URGENT": WorkOrderPriority.URGENT,
    "CRITICAL": WorkOrderPriority.URGENT,
}


def map_warehouse_job(raw: dict[str, Any]) -> WorkOrder | None:
    """Map a WMS WarehouseJobs dict to a Forge WorkOrder.

    Returns None if required fields (id, title, jobType) are missing.
    """
    job_id = raw.get("id") or raw.get("job_id")
    title = raw.get("title")
    job_type = raw.get("jobType") or raw.get("job_type")

    if not job_id or not title or not job_type:
        logger.warning("WarehouseJob missing id/title/jobType — skipping: %s", raw)
        return None

    status_raw = str(raw.get("status", "PENDING")).upper()
    priority_raw = str(raw.get("priority", "NORMAL")).upper()

    return WorkOrder(
        source_system=_SOURCE_SYSTEM,
        source_id=str(job_id),
        title=str(title),
        order_type=str(job_type),
        status=_STATUS_MAP.get(status_raw, WorkOrderStatus.PENDING),
        priority=_PRIORITY_MAP.get(priority_raw, WorkOrderPriority.NORMAL),
        parent_id=_str_or_none(raw.get("parentJobId") or raw.get("parent_job_id")),
        assigned_asset_id=_str_or_none(
            raw.get("warehouseId") or raw.get("warehouse_id")
        ),
        assigned_operator_id=_str_or_none(
            raw.get("assignedToId") or raw.get("assigned_to_id")
        ),
        planned_start=_parse_datetime(raw.get("startDate") or raw.get("start_date")),
        planned_end=_parse_datetime(raw.get("endDate") or raw.get("end_date")),
        actual_start=_parse_datetime(raw.get("actualStart") or raw.get("actual_start")),
        actual_end=_parse_datetime(raw.get("actualEnd") or raw.get("actual_end")),
        production_order_id=_str_or_none(
            raw.get("productionOrderId") or raw.get("production_order_id")
        ),
        lot_id=_str_or_none(raw.get("lotId") or raw.get("lot_id")),
        metadata={
            k: v
            for k, v in {
                "template_id": raw.get("templateId") or raw.get("template_id"),
                "decomposition_strategy": (
                    raw.get("decompositionStrategy")
                    or raw.get("decomposition_strategy")
                ),
                "hierarchy_level": raw.get("hierarchyLevel") or raw.get("hierarchy_level"),
            }.items()
            if v is not None
        },
    )


def _str_or_none(val: Any) -> str | None:
    return str(val) if val else None


def _parse_datetime(val: Any) -> Any:
    """Parse datetime from string or pass through datetime objects."""
    if val is None:
        return None
    if isinstance(val, str):
        from datetime import datetime

        try:
            return datetime.fromisoformat(val)
        except (ValueError, TypeError):
            return None
    return val
