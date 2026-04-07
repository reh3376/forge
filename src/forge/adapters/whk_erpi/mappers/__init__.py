"""ERPI entity mappers — transform ERPI-native dicts to Forge core models.

Each mapper takes a raw dict (from a RabbitMQ message payload) and returns
a Forge manufacturing domain model. Mappers are pure functions with no
side effects or network calls.

ERPI entities span multiple domains because ERPI is the cross-system
integration backbone. Mappers are organized by the canonical Forge
domain they map INTO, not by the ERPI module they come from.
"""

from forge.adapters.whk_erpi.mappers.business_entity import (
    map_customer,
    map_vendor,
)
from forge.adapters.whk_erpi.mappers.material_item import (
    map_bom_item,
    map_item,
    map_item_group,
)
from forge.adapters.whk_erpi.mappers.process_definition import (
    map_bom,
    map_recipe,
    map_recipe_group,
    map_recipe_parameter,
)
from forge.adapters.whk_erpi.mappers.production import (
    map_equipment_phase,
    map_operation,
    map_production_order,
    map_production_order_unit_procedure,
    map_unit_procedure,
)
from forge.adapters.whk_erpi.mappers.inventory import (
    map_barrel,
    map_barrel_event,
    map_barrel_receipt,
    map_inventory,
    map_inventory_transfer,
    map_item_receipt,
    map_lot,
)

__all__ = [
    # Business entities
    "map_customer",
    "map_vendor",
    # Material items
    "map_item",
    "map_item_group",
    "map_bom_item",
    # Process definitions
    "map_recipe",
    "map_recipe_parameter",
    "map_recipe_group",
    "map_bom",
    # Production
    "map_production_order",
    "map_production_order_unit_procedure",
    "map_unit_procedure",
    "map_operation",
    "map_equipment_phase",
    # Inventory
    "map_barrel",
    "map_barrel_event",
    "map_barrel_receipt",
    "map_lot",
    "map_item_receipt",
    "map_inventory",
    "map_inventory_transfer",
]
