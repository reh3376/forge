"""OperationalEvent — immutable operational event log.

Maps from:
    WMS: BarrelEvent (barrelId, eventTypeId, eventTime, createdBy, result) +
         EventType (name enum) + EventReason (hierarchical sub-categories)
    MES: ProductionEvent (eventType, severity, phase, category, batchId, assetId) +
         EquipmentStateTransition (fromState, toState, triggerType)

Every significant thing that happens in manufacturing is an event.
Events are immutable — once recorded, they cannot be changed. They
form the audit trail that regulators, operators, and AI models consume.
"""

from __future__ import annotations

from datetime import datetime  # noqa: TC003

from pydantic import Field

from forge.core.models.manufacturing.base import ManufacturingModelBase
from forge.core.models.manufacturing.enums import EventCategory, EventSeverity


class OperationalEvent(ManufacturingModelBase):
    """An immutable record of something that happened.

    Events reference the entity they happened to (entity_type + entity_id),
    the asset where it happened, and the operator who caused or observed it.
    """

    event_type: str = Field(
        ...,
        description="Source-system event type (e.g. 'Entry', 'Transfer', 'StateChange').",
    )
    event_subtype: str | None = Field(
        default=None,
        description="Optional sub-classification (e.g. EventReason in WMS).",
    )
    category: EventCategory | None = Field(
        default=None,
        description="High-level event category.",
    )
    severity: EventSeverity = Field(
        default=EventSeverity.INFO,
        description="Event severity level.",
    )
    entity_type: str = Field(
        ...,
        description="Type of entity this event relates to (e.g. 'manufacturing_unit', 'lot').",
    )
    entity_id: str = Field(
        ...,
        description="Source ID of the entity this event relates to.",
    )
    asset_id: str | None = Field(
        default=None,
        description="Reference to PhysicalAsset where event occurred (by source_id).",
    )
    operator_id: str | None = Field(
        default=None,
        description="User or operator who caused/observed the event.",
    )
    event_time: datetime = Field(
        ...,
        description="When the event occurred in the source system.",
    )
    result: str | None = Field(
        default=None,
        description="Outcome or result of the event (free text or code).",
    )
    work_order_id: str | None = Field(
        default=None,
        description="Reference to associated WorkOrder if applicable.",
    )
