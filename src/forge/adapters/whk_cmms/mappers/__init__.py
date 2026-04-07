"""CMMS entity mappers — transform CMMS-native dicts to Forge core models.

Each mapper takes a raw dict (from a GraphQL response or RabbitMQ message payload)
and returns a Forge manufacturing domain model. Mappers are pure functions with no
side effects or network calls.

CMMS focuses on maintenance and inventory management, with cross-links to
ERPI (for master item data) and MES (for production scheduling conflicts).
Mappers are organized by the canonical Forge domain they map INTO.
"""

from forge.adapters.whk_cmms.mappers.equipment import (
    map_asset,
    map_work_order_type,
    map_work_request_type,
)
from forge.adapters.whk_cmms.mappers.maintenance import (
    map_work_order,
    map_work_request,
)
from forge.adapters.whk_cmms.mappers.inventory import (
    map_inventory_location,
    map_inventory_investigation,
    map_item,
    map_kit,
    map_vendor,
)

__all__ = [
    # Equipment
    "map_asset",
    "map_work_order_type",
    "map_work_request_type",
    # Maintenance
    "map_work_order",
    "map_work_request",
    # Inventory
    "map_item",
    "map_kit",
    "map_vendor",
    "map_inventory_location",
    "map_inventory_investigation",
]
