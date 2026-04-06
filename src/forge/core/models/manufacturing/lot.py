"""Lot — material grouping with traceability.

Maps from:
    WMS: Lot (lotNumber, recipeId, productionOrderId, whiskeyTypeId, status,
         bblTotal, totalPGs, totalWGs)
    MES: Lot (globalId, externalId, whiskeyType, status, quantity, unit,
         recipeId, whiskeyTypeId)

A Lot groups manufacturing units (barrels, batches) that share a common
production origin. Lots are the primary unit of traceability in
manufacturing — they connect raw materials to finished goods.
"""

from __future__ import annotations

from pydantic import Field

from forge.core.models.manufacturing.base import ManufacturingModelBase


class Lot(ManufacturingModelBase):
    """A material grouping with traceability.

    Lots may be hierarchical (parent/child) for sub-lot tracking.
    """

    lot_number: str = Field(
        ...,
        description="Human-readable lot identifier.",
    )
    product_type: str | None = Field(
        default=None,
        description="Product classification (e.g. whiskey type code).",
    )
    recipe_id: str | None = Field(
        default=None,
        description="Reference to ProcessDefinition (by source_id).",
    )
    production_order_id: str | None = Field(
        default=None,
        description="Reference to originating ProductionOrder (by source_id).",
    )
    customer_id: str | None = Field(
        default=None,
        description="Reference to furnishing/owning BusinessEntity (by source_id).",
    )
    status: str = Field(
        default="CREATED",
        description="Lot lifecycle status (CREATED, STARTED, VERIFIED, COMPLETE, etc.).",
    )
    quantity: float | None = Field(
        default=None,
        description="Total quantity in this lot.",
    )
    unit_of_measure: str | None = Field(
        default=None,
        description="Unit for quantity (e.g. 'bbl', 'gallons', 'kg').",
    )
    parent_lot_id: str | None = Field(
        default=None,
        description="Reference to parent lot for sub-lot hierarchies.",
    )
    unit_count: int | None = Field(
        default=None,
        description="Number of manufacturing units (barrels, containers) in this lot.",
    )
