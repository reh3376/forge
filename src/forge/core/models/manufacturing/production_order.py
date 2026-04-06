"""ProductionOrder — manufacturing order lifecycle.

Maps from:
    WMS: ProductionOrder (globalId, data JSON, minQuantity, maxQuantity,
         barrelingStatus) + BarrelingQueue (index, priority, queuedAt)
    MES: ProductionOrder (status, containerType, expectedQuantity,
         customerId, recipeId) + ScheduleOrder (expectedStartDate,
         expectedEndDate, priority, timeline metadata)

A production order authorizes the manufacturing of a specific product.
It references a recipe, specifies quantities, and tracks progress from
planning through completion. Both systems have this concept — WMS for
barrel filling operations, MES for distillery/fermentation operations.
"""

from __future__ import annotations

from datetime import datetime  # noqa: TC003

from pydantic import Field

from forge.core.models.manufacturing.base import ManufacturingModelBase
from forge.core.models.manufacturing.enums import OrderStatus


class ProductionOrder(ManufacturingModelBase):
    """A manufacturing order that authorizes production.

    Tracks the lifecycle from draft through completion, with
    quantity targets and schedule bounds.
    """

    order_number: str = Field(
        ...,
        description="Human-readable order identifier.",
    )
    recipe_id: str | None = Field(
        default=None,
        description="Reference to ProcessDefinition to execute (by source_id).",
    )
    customer_id: str | None = Field(
        default=None,
        description="Reference to ordering BusinessEntity (by source_id).",
    )
    status: OrderStatus = Field(
        default=OrderStatus.DRAFT,
        description="Order lifecycle status.",
    )
    product_type: str | None = Field(
        default=None,
        description="Product classification being produced.",
    )
    planned_quantity: float | None = Field(
        default=None,
        description="Target production quantity.",
    )
    actual_quantity: float | None = Field(
        default=None,
        description="Actual quantity produced so far.",
    )
    unit_of_measure: str | None = Field(
        default=None,
        description="Unit for quantities.",
    )
    planned_start: datetime | None = Field(
        default=None,
        description="Scheduled start date.",
    )
    planned_end: datetime | None = Field(
        default=None,
        description="Scheduled end date.",
    )
    actual_start: datetime | None = Field(
        default=None,
        description="Actual start date.",
    )
    actual_end: datetime | None = Field(
        default=None,
        description="Actual completion date.",
    )
    lot_ids: list[str] = Field(
        default_factory=list,
        description="References to Lots produced by this order.",
    )
    priority: int | None = Field(
        default=None,
        description="Queue priority (lower = higher priority).",
    )
