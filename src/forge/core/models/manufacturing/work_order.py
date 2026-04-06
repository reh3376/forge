"""WorkOrder — task assignment with dependencies.

Maps from:
    WMS: WarehouseJobs (title, jobType, status, priority, eventTypeId,
         decompositionStrategy, hierarchyLevel, parentJobId, templateId) +
         JobTemplate + JobDependency (dependencyType: BLOCKS|RELATED)
    MES: ScheduleOrder (status, expectedStartDate, expectedEndDate, priority) +
         ScheduleOrderQueue (queueName, priorityOrder)

Work orders represent assignable units of work. WMS has rich job
decomposition (parent/child, templates, dependencies). MES uses
queue-based scheduling with timeline calculation. WorkOrder captures
the common shape: a task with status, priority, optional parent,
optional dependencies, and optional time bounds.
"""

from __future__ import annotations

from datetime import datetime  # noqa: TC003

from pydantic import Field

from forge.core.models.manufacturing.base import ManufacturingModelBase
from forge.core.models.manufacturing.enums import WorkOrderPriority, WorkOrderStatus


class WorkOrderDependency(ManufacturingModelBase):
    """A dependency between two work orders."""

    dependent_order_id: str = Field(
        ...,
        description="The work order that is blocked.",
    )
    prerequisite_order_id: str = Field(
        ...,
        description="The work order that must complete first.",
    )
    dependency_type: str = Field(
        default="BLOCKS",
        description="Relationship type (BLOCKS, RELATED, etc.).",
    )


class WorkOrder(ManufacturingModelBase):
    """An assignable unit of work.

    Supports hierarchy (parent_id), scheduling (planned_start/end),
    and decomposition (order_type for categorization).
    """

    title: str = Field(
        ...,
        description="Human-readable work order title.",
    )
    order_type: str = Field(
        ...,
        description="Type classification (e.g. 'INVENTORY_CHECK', 'TRANSFER', 'FILL').",
    )
    status: WorkOrderStatus = Field(
        default=WorkOrderStatus.PENDING,
        description="Current work order status.",
    )
    priority: WorkOrderPriority = Field(
        default=WorkOrderPriority.NORMAL,
        description="Priority level.",
    )
    parent_id: str | None = Field(
        default=None,
        description="Reference to parent WorkOrder for decomposed jobs.",
    )
    assigned_asset_id: str | None = Field(
        default=None,
        description="Reference to PhysicalAsset where work is performed.",
    )
    assigned_operator_id: str | None = Field(
        default=None,
        description="User or operator assigned to this work.",
    )
    planned_start: datetime | None = Field(
        default=None,
        description="Scheduled start time.",
    )
    planned_end: datetime | None = Field(
        default=None,
        description="Scheduled end time.",
    )
    actual_start: datetime | None = Field(
        default=None,
        description="Actual start time.",
    )
    actual_end: datetime | None = Field(
        default=None,
        description="Actual end time.",
    )
    production_order_id: str | None = Field(
        default=None,
        description="Reference to associated ProductionOrder if applicable.",
    )
    lot_id: str | None = Field(
        default=None,
        description="Reference to associated Lot if applicable.",
    )
