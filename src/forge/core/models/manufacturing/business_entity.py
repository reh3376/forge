"""BusinessEntity — customer, vendor, or partner.

Maps from:
    WMS: Customer (globalId, data JSON, parentCustomerId — hierarchical) +
         Vendor (globalId, data JSON)
    MES: Customer (globalId, name, location, contactInfo) +
         Vendor (globalId, erpId, name, contactInfo)

Business entities are the external parties that interact with the
manufacturing operation. A customer owns barrels in WMS, furnishes lots,
and places production orders. A vendor supplies raw materials or barrels.
"""

from __future__ import annotations

from pydantic import Field

from forge.core.models.manufacturing.base import ManufacturingModelBase
from forge.core.models.manufacturing.enums import EntityType  # noqa: TC001


class BusinessEntity(ManufacturingModelBase):
    """An external party: customer, vendor, or partner.

    Supports hierarchical relationships (parent/child customers) via
    parent_id. External system IDs stored in external_ids dict for
    cross-system reconciliation.
    """

    entity_type: EntityType = Field(
        ...,
        description="Type of business entity.",
    )
    name: str = Field(
        ...,
        description="Entity name.",
    )
    parent_id: str | None = Field(
        default=None,
        description="Reference to parent entity for hierarchies (by source_id).",
    )
    external_ids: dict[str, str] = Field(
        default_factory=dict,
        description="Map of external system IDs (e.g. {'erp': 'C-12345', 'global': 'abc'}).",
    )
    contact_info: dict[str, str] = Field(
        default_factory=dict,
        description="Contact details (e.g. {'email': '...', 'phone': '...'}).",
    )
    location: str | None = Field(
        default=None,
        description="Primary location or address.",
    )
    is_active: bool = Field(
        default=True,
        description="Whether this entity is currently active.",
    )
