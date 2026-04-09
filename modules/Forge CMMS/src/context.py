"""CMMS context builder — extract operational context from CMMS messages.

CMMS messages carry maintenance-specific context that must be extracted
as first-class context fields for decision-quality manufacturing analysis:

- asset_path (ISA-95 equipment hierarchy) → equipment tracking
- work_order_type (preventive, corrective, predictive) → maintenance strategy
- priority_level (critical, high, normal, low) → scheduling constraints
- maintenance_status (pending, in_progress, completed) → operational state
- approval_states (maintenance_role, operations_supervisor) → governance
- cron_schedule (for periodic maintenance) → predictive scheduling

These fields enable Forge to answer maintenance-critical questions like
"which assets have pending critical maintenance?" and "what's the
predicted impact on production when this asset is serviced?"
"""

from __future__ import annotations

import logging
from typing import Any

from forge.core.models.contextual_record import RecordContext

logger = logging.getLogger(__name__)

# ── Entity → Domain Category ──────────────────────────────────────

_ENTITY_CATEGORY: dict[str, str] = {
    # Equipment
    "Asset": "equipment_maintenance",
    # Work Management
    "WorkOrder": "maintenance",
    "WorkRequest": "maintenance_planning",
    "WorkOrderType": "maintenance_configuration",
    "WorkRequestType": "maintenance_configuration",
    # Inventory & Kits
    "Kit": "inventory",
    "InventoryLocation": "inventory",
    "InventoryInvestigation": "inventory_audit",
    # Master Data
    "Item": "master_data",
    "Vendor": "master_data",
    "User": "system_config",
}


def build_record_context(
    raw_event: dict[str, Any],
    *,
    exchange_name: str | None = None,
) -> RecordContext:
    """Transform a raw CMMS event (GraphQL or RabbitMQ) into a RecordContext.

    Extracts CMMS maintenance-specific fields as first-class context,
    preserving the operational provenance that enables cross-module
    maintenance scheduling analysis.

    Args:
        raw_event: Full CMMS message envelope (either GraphQL response or RabbitMQ).
        exchange_name: Optional RabbitMQ exchange name for topic derivation.

    Returns:
        RecordContext with CMMS-specific maintenance fields in the extra dict.
    """
    # Handle both GraphQL responses and RabbitMQ envelopes
    envelope = raw_event.get("data", raw_event)
    if "data" in envelope:
        payload = envelope.get("data", {})
    else:
        payload = envelope

    # ── Core Identity Fields ───────────────────────────────────────
    entity_type = str(payload.get("entity_type") or payload.get("__typename") or "unknown")
    event_type = str(payload.get("event_type", "query"))
    message_id = payload.get("id") or payload.get("messageId")

    # ── CMMS-Specific Transaction Fields ───────────────────────────

    # Global ID / CMMS ID
    global_id = payload.get("globalId") or payload.get("global_id") or str(payload.get("id", ""))

    # Asset-related (work orders linked to assets)
    asset_id = _str_or_none(payload.get("assetId") or payload.get("asset_id"))
    asset_path = _str_or_none(
        payload.get("assetPath")
        or payload.get("asset_path")
        or (payload.get("asset", {}).get("assetPath") if isinstance(payload.get("asset"), dict) else None)
    )

    # Work order type / classification
    work_order_type = _str_or_none(payload.get("workOrderType") or payload.get("work_order_type"))
    work_request_type = _str_or_none(payload.get("workRequestType") or payload.get("work_request_type"))

    # Priority and maintenance status
    priority_level = _str_or_none(payload.get("priority") or payload.get("priorityLevel") or payload.get("priority_level"))
    maintenance_status = _str_or_none(payload.get("status") or "pending")

    # Approval states (maintenance-role + operations-supervisor approval)
    maintenance_role_approval = payload.get("maintenanceRoleApproval") or payload.get("maintenance_role_approval")
    operations_supervisor_approval = payload.get("operationsSupervisorApproval") or payload.get("operations_supervisor_approval")

    # Kit association (for work orders that use maintenance kits)
    kit_id = _str_or_none(payload.get("kitId") or payload.get("kit_id"))

    # Inventory location
    location_path = _str_or_none(
        payload.get("inventoryLocation", {}).get("path")
        or payload.get("location_path")
        or payload.get("path")
    )

    # Cron schedule (for periodic maintenance like PM checks)
    cron_schedule = _str_or_none(payload.get("cronSchedule") or payload.get("cron_schedule"))

    # ERP ID (for items pulled from ERPI)
    erp_id = _str_or_none(payload.get("erpId") or payload.get("erp_id"))

    # ── Derived Fields ─────────────────────────────────────────────
    category = _ENTITY_CATEGORY.get(entity_type, "unknown")

    # Maintenance window: extract scheduled times for production impact analysis
    scheduled_start = _str_or_none(payload.get("scheduledStart") or payload.get("scheduled_start"))
    estimated_duration_str = _str_or_none(payload.get("estimatedDuration") or payload.get("estimated_duration"))

    # ── Build Extra Context Dict ───────────────────────────────────
    extra: dict[str, Any] = {
        "cross_system_id": global_id,
        "source_system": "whk-cmms",
        "entity_type": entity_type,
        "event_type": event_type,
        "operation_context": "maintenance",
        "entity_category": category,
    }

    if message_id:
        extra["message_id"] = str(message_id)
    if asset_id:
        extra["asset_id"] = asset_id
    if asset_path:
        extra["asset_path"] = asset_path
    if work_order_type:
        extra["work_order_type"] = work_order_type
    if work_request_type:
        extra["work_request_type"] = work_request_type
    if priority_level:
        extra["priority_level"] = priority_level
    if maintenance_status:
        extra["maintenance_status"] = maintenance_status
    if maintenance_role_approval is not None:
        extra["maintenance_role_approval"] = maintenance_role_approval
    if operations_supervisor_approval is not None:
        extra["operations_supervisor_approval"] = operations_supervisor_approval
    if kit_id:
        extra["kit_id"] = kit_id
    if location_path:
        extra["location_path"] = location_path
    if cron_schedule:
        extra["cron_schedule"] = cron_schedule
    if erp_id:
        extra["erp_id"] = erp_id
    if scheduled_start:
        extra["scheduled_start"] = scheduled_start
    if estimated_duration_str:
        extra["estimated_duration"] = estimated_duration_str

    return RecordContext(
        equipment_id=asset_id,
        area=category,
        site="whk01.distillery01",
        batch_id=work_order_type,
        lot_id=kit_id,
        extra=extra,
    )


def _str_or_none(val: Any) -> str | None:
    """Convert to str if truthy, else None."""
    return str(val) if val else None
