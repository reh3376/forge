"""WMS entity mappers — transform WMS-native dicts to Forge core models.

Each mapper takes a raw dict (as returned by a WMS GraphQL query or
RabbitMQ message) and returns a Forge manufacturing domain model.
Mappers are pure functions with no side effects or network calls.
"""

from forge_wms.mappers.business_entity import (
    map_customer,
    map_vendor,
)
from forge_wms.mappers.lot import map_lot
from forge_wms.mappers.manufacturing_unit import map_barrel
from forge_wms.mappers.operational_event import map_barrel_event
from forge_wms.mappers.physical_asset import (
    map_storage_location,
    map_warehouse,
)
from forge_wms.mappers.production_order import map_production_order
from forge_wms.mappers.work_order import map_warehouse_job

__all__ = [
    "map_barrel",
    "map_barrel_event",
    "map_customer",
    "map_lot",
    "map_production_order",
    "map_storage_location",
    "map_vendor",
    "map_warehouse",
    "map_warehouse_job",
]
