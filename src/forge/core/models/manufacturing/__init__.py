"""Manufacturing domain models — the shared vocabulary for cross-system data.

These models define the canonical manufacturing entities that all Forge
adapters produce. When a WMS adapter emits a Barrel, it maps to a
ManufacturingUnit. When an MES adapter emits a Batch, it also maps to
a ManufacturingUnit. Data products join across systems using these
shared types.

Entity families:
    ManufacturingUnit — tracked production container (barrel, batch, tank)
    Lot — material grouping with traceability
    PhysicalAsset — location or equipment (ISA-95 hierarchy)
    OperationalEvent — immutable operational event log
    BusinessEntity — customer, vendor, or partner
    ProcessDefinition — recipe or protocol (how to make something)
    WorkOrder — task assignment with dependencies
    MaterialItem — SKU or inventory item master
    QualitySample — quality measurement with pass/fail
    ProductionOrder — manufacturing order lifecycle
"""

from forge.core.models.manufacturing.base import ManufacturingModelBase
from forge.core.models.manufacturing.business_entity import BusinessEntity
from forge.core.models.manufacturing.enums import (
    AssetType,
    EntityType,
    EventSeverity,
    LifecycleState,
    OrderStatus,
    SampleOutcome,
    UnitStatus,
    WorkOrderPriority,
    WorkOrderStatus,
)
from forge.core.models.manufacturing.lot import Lot
from forge.core.models.manufacturing.manufacturing_unit import ManufacturingUnit
from forge.core.models.manufacturing.material_item import MaterialItem
from forge.core.models.manufacturing.operational_event import OperationalEvent
from forge.core.models.manufacturing.physical_asset import PhysicalAsset
from forge.core.models.manufacturing.process_definition import (
    ProcessDefinition,
    ProcessStep,
)
from forge.core.models.manufacturing.production_order import ProductionOrder
from forge.core.models.manufacturing.quality_sample import QualitySample, SampleResult
from forge.core.models.manufacturing.work_order import WorkOrder, WorkOrderDependency

__all__ = [
    "AssetType",
    "BusinessEntity",
    "EntityType",
    "EventSeverity",
    "LifecycleState",
    "Lot",
    "ManufacturingModelBase",
    "ManufacturingUnit",
    "MaterialItem",
    "OperationalEvent",
    "OrderStatus",
    "PhysicalAsset",
    "ProcessDefinition",
    "ProcessStep",
    "ProductionOrder",
    "QualitySample",
    "SampleOutcome",
    "SampleResult",
    "UnitStatus",
    "WorkOrder",
    "WorkOrderDependency",
    "WorkOrderPriority",
    "WorkOrderStatus",
]
