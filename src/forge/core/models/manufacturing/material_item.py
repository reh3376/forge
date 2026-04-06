"""MaterialItem — SKU or inventory item master.

Maps from:
    WMS: Item (erpId, itemName, itemNumber, itemClass, active) +
         BarrelOemCode (threeLetterCode, lotBarrelCode, vendorId)
    MES: Item (globalId, erpId, name, description, vendorId) +
         BomItem (quantity, unit) + Unit (conversionFactor)

MaterialItem is the master data for anything that can be counted,
stored, consumed, or produced. Both WMS and MES have Item models
with ERP integration. Forge unifies them with a canonical structure
that supports cross-system reconciliation via external_ids.
"""

from __future__ import annotations

from pydantic import Field

from forge.core.models.manufacturing.base import ManufacturingModelBase


class MaterialItem(ManufacturingModelBase):
    """A material, component, or finished good.

    Items are master data — they describe WHAT something is, not
    WHERE it is (that's inventory) or HOW MUCH exists (that's lot
    quantity).
    """

    item_number: str = Field(
        ...,
        description="Primary item identifier (SKU, part number).",
    )
    name: str = Field(
        ...,
        description="Human-readable item name.",
    )
    description: str | None = Field(
        default=None,
        description="Detailed item description.",
    )
    category: str | None = Field(
        default=None,
        description=(
            "Item classification or class"
            " (e.g. 'raw_material', 'barrel', 'finished_good')."
        ),
    )
    unit_of_measure: str | None = Field(
        default=None,
        description="Default unit of measure for this item.",
    )
    vendor_id: str | None = Field(
        default=None,
        description="Reference to primary vendor BusinessEntity (by source_id).",
    )
    external_ids: dict[str, str] = Field(
        default_factory=dict,
        description="Map of external system IDs (e.g. {'erp': 'ITEM-1234', 'global': 'abc'}).",
    )
    is_active: bool = Field(
        default=True,
        description="Whether this item is currently active in the system.",
    )
