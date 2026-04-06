"""ManufacturingUnit — tracked production container.

Maps from:
    WMS: Barrel (serialNumber, lotId, locationId, disposition, systemStatus)
    MES: Batch (status, currentStepIndex, assetId, customerId, lotId)

A ManufacturingUnit is any discrete, trackable container of product
that moves through a manufacturing lifecycle. In whiskey, this is a
barrel or a batch. In pharma, it might be a bioreactor charge. In
semiconductors, a wafer lot.
"""

from __future__ import annotations

from pydantic import Field

from forge.core.models.manufacturing.base import ManufacturingModelBase
from forge.core.models.manufacturing.enums import LifecycleState, UnitStatus


class ManufacturingUnit(ManufacturingModelBase):
    """A discrete, trackable container of product.

    The unit_type distinguishes barrels from batches from tanks.
    Adapters set this to their source concept name.
    """

    unit_type: str = Field(
        ...,
        description="Source concept type (e.g. 'barrel', 'batch', 'tank').",
    )
    serial_number: str | None = Field(
        default=None,
        description="Unique serial identifier if applicable (e.g. barrel serial).",
    )
    lot_id: str | None = Field(
        default=None,
        description="Reference to the associated Lot (by source_id).",
    )
    location_id: str | None = Field(
        default=None,
        description="Reference to current PhysicalAsset location (by source_id).",
    )
    owner_id: str | None = Field(
        default=None,
        description="Reference to owning BusinessEntity (by source_id).",
    )
    recipe_id: str | None = Field(
        default=None,
        description="Reference to ProcessDefinition used (by source_id).",
    )
    status: UnitStatus = Field(
        default=UnitStatus.PENDING,
        description="High-level lifecycle status.",
    )
    lifecycle_state: LifecycleState | None = Field(
        default=None,
        description="Granular lifecycle phase within the unit's journey.",
    )
    quantity: float | None = Field(
        default=None,
        description="Current quantity (volume, weight, count).",
    )
    unit_of_measure: str | None = Field(
        default=None,
        description="Unit of measure for quantity (e.g. 'gallons', 'kg').",
    )
    product_type: str | None = Field(
        default=None,
        description="Product classification (e.g. whiskey type, grade).",
    )
