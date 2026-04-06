"""MES entity mappers -- pure functions from raw MES dicts to Forge core models.

Each mapper follows the established pattern:
    map_*(raw_dict) -> CoreModel | None

Returns None when required fields are missing. Supports both
camelCase (GraphQL) and snake_case field name conventions.
"""

from forge.adapters.whk_mes.mappers.batch import map_batch
from forge.adapters.whk_mes.mappers.business_entity import map_customer, map_vendor
from forge.adapters.whk_mes.mappers.lot import map_lot
from forge.adapters.whk_mes.mappers.material_item import map_item
from forge.adapters.whk_mes.mappers.operational_event import (
    map_production_event,
    map_step_event,
)
from forge.adapters.whk_mes.mappers.physical_asset import map_asset
from forge.adapters.whk_mes.mappers.process_definition import map_recipe
from forge.adapters.whk_mes.mappers.production_order import (
    map_production_order,
    map_schedule_order,
)

__all__ = [
    "map_asset",
    "map_batch",
    "map_customer",
    "map_item",
    "map_lot",
    "map_production_event",
    "map_production_order",
    "map_recipe",
    "map_schedule_order",
    "map_step_event",
    "map_vendor",
]
