"""PhysicalAsset — location or equipment in the manufacturing hierarchy.

Maps from:
    WMS: StorageLocation (warehouse, floor, rick, position, tier) +
         Warehouse (name, type, floors, tiers) +
         HoldingLocation (name, description)
    MES: Asset (assetType, status, operationalState, parentId — hierarchical)

WMS focuses on warehouse coordinate systems (building/floor/rick/position).
MES follows ISA-95 equipment hierarchy (site/area/work-center/equipment).
PhysicalAsset unifies both views: every asset has a type, a name, an
optional parent (for hierarchy), and an optional location path.
"""

from __future__ import annotations

from pydantic import Field

from forge.core.models.manufacturing.base import ManufacturingModelBase
from forge.core.models.manufacturing.enums import (  # noqa: TC001
    AssetOperationalState,
    AssetType,
)


class PhysicalAsset(ManufacturingModelBase):
    """A physical location or piece of equipment.

    Assets form a hierarchy via parent_id. The location_path provides
    a human-readable breadcrumb (e.g. 'Warehouse-A/Floor-1/Rick-3/Pos-12').
    """

    asset_type: AssetType = Field(
        ...,
        description="ISA-95 hierarchy level or Forge asset classification.",
    )
    name: str = Field(
        ...,
        description="Human-readable asset name or identifier.",
    )
    parent_id: str | None = Field(
        default=None,
        description="Reference to parent PhysicalAsset (by source_id).",
    )
    location_path: str | None = Field(
        default=None,
        description="Slash-delimited hierarchy path (e.g. 'Site/Area/WorkCenter').",
    )
    operational_state: AssetOperationalState | None = Field(
        default=None,
        description="Current operational state of this asset.",
    )
    capacity: float | None = Field(
        default=None,
        description="Maximum capacity (units depend on asset type).",
    )
    capacity_unit: str | None = Field(
        default=None,
        description="Unit of measure for capacity.",
    )
