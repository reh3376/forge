"""Map CMMS maintenance entities → Forge WorkOrder.

CMMS has two work management entities:
    WorkOrder: Actual maintenance work (scheduled, in-progress, completed)
    WorkRequest: Maintenance requests that may be approved/rejected

Both map to Forge WorkOrder with order_type distinguishing them.

WorkOrder fields (Prisma schema):
    - name: Work order identifier
    - status: Scheduled/Active/Completed
    - priority: High/Normal/Low
    - scheduledStart/scheduledEnd: Planned window
    - estimatedDuration: Planned time
    - actualDuration: JSON {start, end, hours}
    - costCalculation: JSON cost tracking
    - asset: Foreign key to Asset
    - maintenanceTechAssigned: Array of users
    - cronSchedule: For periodic work (e.g., "0 9 * * 0" = weekly Monday 9am)
    - kit: Foreign key to Kit (maintenance kit used)
    - backflushed: Whether costs were posted to ERP

WorkRequest fields (Prisma schema):
    - issueDescription: What's wrong
    - asset: Foreign key to Asset
    - priorityLevel: How urgent
    - cronSchedule: For recurring issues
    - period: Frequency unit (Hour/Day/Week/Month/Quarter/Year)
    - periodicFrequency: Number of periods between occurrences
    - maintenanceRoleApproval: Approval by maintenance supervisor
    - operationsSupervisorApproval: Approval by ops for scheduling

Forge WorkOrder fields (required):
    - source_system, source_id, title, order_type, status, metadata
"""

from __future__ import annotations

import logging
from typing import Any

from forge.core.models.manufacturing.work_order import WorkOrder

logger = logging.getLogger(__name__)

_SOURCE_SYSTEM = "whk-cmms"


def map_work_order(raw: dict[str, Any]) -> WorkOrder | None:
    """Map a CMMS WorkOrder to a Forge WorkOrder."""
    global_id = raw.get("globalId") or raw.get("global_id") or raw.get("id")
    name = raw.get("name")

    if not global_id or not name:
        logger.warning("WorkOrder missing globalId or name — skipping: %s", raw)
        return None

    asset_id = raw.get("assetId") or raw.get("asset_id")
    kit_id = raw.get("kitId") or raw.get("kit_id")
    priority = _str_or_none(raw.get("priority"))
    status = _map_work_order_status(raw.get("status", "scheduled"))

    return WorkOrder(
        source_system=_SOURCE_SYSTEM,
        source_id=str(global_id),
        title=str(name),
        order_type="maintenance",
        order_number=str(global_id),
        status=status,
        metadata={
            **_build_metadata(raw),
            "entity_subtype": "work_order",
            "priority": priority,
            "asset_id": asset_id,
            "kit_id": kit_id,
            "scheduled_start": raw.get("scheduledStart") or raw.get("scheduled_start"),
            "scheduled_end": raw.get("scheduledEnd") or raw.get("scheduled_end"),
            "estimated_duration": raw.get("estimatedDuration") or raw.get("estimated_duration"),
            "actual_duration": raw.get("actualDuration") or raw.get("actual_duration"),
            "cost_calculation": raw.get("costCalculation") or raw.get("cost_calculation"),
            "maintenance_tech_assigned": raw.get("maintenanceTechAssigned") or raw.get("maintenance_tech_assigned"),
            "cron_schedule": raw.get("cronSchedule") or raw.get("cron_schedule"),
            "backflushed": raw.get("backflushed", False),
        },
    )


def map_work_request(raw: dict[str, Any]) -> WorkOrder | None:
    """Map a CMMS WorkRequest to a Forge WorkOrder (with order_type='maintenance_request').

    Work requests are maintenance needs submitted by operators that must be
    approved before becoming actual work orders. They capture the issue and
    proposed maintenance strategy (if recurring, with cron schedule).
    """
    global_id = raw.get("globalId") or raw.get("global_id") or raw.get("id")
    issue_description = raw.get("issueDescription") or raw.get("issue_description")

    if not global_id:
        logger.warning("WorkRequest missing globalId — skipping: %s", raw)
        return None

    asset_id = raw.get("assetId") or raw.get("asset_id")
    priority = _str_or_none(raw.get("priorityLevel") or raw.get("priority_level"))
    status = _map_work_request_status(raw.get("status", "pending"))

    return WorkOrder(
        source_system=_SOURCE_SYSTEM,
        source_id=str(global_id),
        title=str(issue_description or f"Maintenance Request {global_id}"),
        order_type="maintenance_request",
        order_number=str(global_id),
        status=status,
        metadata={
            **_build_metadata(raw),
            "entity_subtype": "work_request",
            "priority": priority,
            "asset_id": asset_id,
            "issue_description": issue_description,
            "cron_schedule": raw.get("cronSchedule") or raw.get("cron_schedule"),
            "period": raw.get("period"),
            "periodic_frequency": raw.get("periodicFrequency") or raw.get("periodic_frequency"),
            "maintenance_role_approval": raw.get("maintenanceRoleApproval") or raw.get("maintenance_role_approval"),
            "operations_supervisor_approval": raw.get("operationsSupervisorApproval") or raw.get("operations_supervisor_approval"),
        },
    )


def _map_work_order_status(cmms_status: Any) -> str:
    """Map CMMS WorkOrder status to valid WorkOrderStatus.

    CMMS uses: Scheduled, Active, Completed, Cancelled, OnHold
    Forge uses: DRAFT, SCHEDULED, IN_PROGRESS, PAUSED, COMPLETE, CANCELLED
    """
    status_str = str(cmms_status or "SCHEDULED").upper()

    mapping = {
        "SCHEDULED": "SCHEDULED",
        "ACTIVE": "IN_PROGRESS",
        "COMPLETED": "COMPLETE",
        "COMPLETE": "COMPLETE",
        "CANCELLED": "CANCELLED",
        "ONHOLD": "PAUSED",
        "ON_HOLD": "PAUSED",
        "DRAFT": "DRAFT",
    }

    return mapping.get(status_str, "SCHEDULED")


def _map_work_request_status(cmms_status: Any) -> str:
    """Map CMMS WorkRequest status to valid WorkOrderStatus.

    Work requests start as Pending (awaiting approval), then may be
    Approved (ready for scheduling), Rejected, or Closed.
    """
    status_str = str(cmms_status or "PENDING").upper()

    mapping = {
        "PENDING": "DRAFT",
        "APPROVED": "SCHEDULED",
        "REJECTED": "CANCELLED",
        "CLOSED": "COMPLETE",
        "DRAFT": "DRAFT",
    }

    return mapping.get(status_str, "DRAFT")


def _build_metadata(raw: dict[str, Any]) -> dict[str, Any]:
    meta: dict[str, Any] = {}
    for key in ("createdAt", "updatedAt", "created_at", "updated_at"):
        val = raw.get(key)
        if val is not None:
            meta[key] = val
    return meta


def _str_or_none(val: Any) -> str | None:
    return str(val) if val else None
