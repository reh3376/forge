"""CMMS GraphQL entity and RabbitMQ topic definitions.

CMMS has 11 Prisma entities that are queried via GraphQL polling (primary data source):
    1. Asset (equipment hierarchy)
    2. WorkOrder (maintenance work orders)
    3. WorkRequest (maintenance requests)
    4. Item (inventory items)
    5. Kit (maintenance kits)
    6. Vendor (maintenance vendors)
    7. InventoryLocation (locations in inventory)
    8. InventoryInvestigation (audit reconciliations)
    9. WorkOrderType (work order classifications)
    10. WorkRequestType (work request classifications)
    11. User (system users)

Additionally, CMMS listens to 8 RabbitMQ topics for shared master data (item, vendor)
flowing from ERPI on the wh.whk01.distillery01.* UNS bus. The adapter subscribes
via its own durable queues (forge-cmms-<topic>) without affecting existing consumers.

GraphQL polling is the primary collection mode because CMMS entities are created
through its own UI and stored directly in PostgreSQL (no RabbitMQ ingestion).
RabbitMQ subscription is secondary, enriching item/vendor master data from ERPI.
"""

from __future__ import annotations

from dataclasses import dataclass

_UNS_PREFIX = "wh.whk01.distillery01"


@dataclass(frozen=True)
class CmmsGraphqlEntity:
    """A CMMS entity available via GraphQL polling."""

    entity_name: str
    graphql_query_name: str  # lowercase query name (e.g., 'workOrders')
    is_cmms_native: bool = True  # True if created in CMMS UI, False if from ERPI

    @property
    def description(self) -> str:
        """Human-readable description."""
        return f"CMMS entity '{self.entity_name}' queried via GraphQL"


@dataclass(frozen=True)
class CmmsRabbitmqTopic:
    """A RabbitMQ topic CMMS subscribes to (secondary data source, from ERPI)."""

    topic_name: str
    entity_key: str  # lowercase key used in topic name

    @property
    def full_topic(self) -> str:
        return f"{_UNS_PREFIX}.{self.entity_key}"


# ── 11 GraphQL Entities (Primary: CMMS-Native) ────────────────────

CMMS_GRAPHQL_ENTITIES: list[CmmsGraphqlEntity] = [
    # Equipment & Maintenance (CMMS-native)
    CmmsGraphqlEntity("Asset", "assets", is_cmms_native=True),
    CmmsGraphqlEntity("WorkOrder", "workOrders", is_cmms_native=True),
    CmmsGraphqlEntity("WorkRequest", "workRequests", is_cmms_native=True),
    CmmsGraphqlEntity("WorkOrderType", "workOrderTypes", is_cmms_native=True),
    CmmsGraphqlEntity("WorkRequestType", "workRequestTypes", is_cmms_native=True),
    # Inventory & Kits (CMMS-native)
    CmmsGraphqlEntity("Kit", "kits", is_cmms_native=True),
    CmmsGraphqlEntity("InventoryLocation", "inventoryLocations", is_cmms_native=True),
    CmmsGraphqlEntity("InventoryInvestigation", "inventoryInvestigations", is_cmms_native=True),
    # Master Data (from ERPI, but CMMS queried for local references)
    CmmsGraphqlEntity("Item", "items", is_cmms_native=False),
    CmmsGraphqlEntity("Vendor", "vendors", is_cmms_native=False),
    CmmsGraphqlEntity("User", "users", is_cmms_native=True),
]

# ── 8 RabbitMQ Topics (Secondary: ERPI → CMMS) ────────────────────
# These are shared master data topics from ERPI. CMMS subscribes to enrich
# its own inventory records without creating copies in its database.

CMMS_RABBITMQ_TOPICS: list[CmmsRabbitmqTopic] = [
    # Shared master data (also consumed by WMS, MES, etc.)
    CmmsRabbitmqTopic("Item", "item"),
    CmmsRabbitmqTopic("Vendor", "vendor"),
    CmmsRabbitmqTopic("Inventory", "inventory"),
    CmmsRabbitmqTopic("InventoryTransfer", "inventorytransfer"),
    # Purchase & Sales (for maintenance cost tracking)
    CmmsRabbitmqTopic("PurchaseOrder", "purchaseorder"),
    # MES cross-ref (for maintenance windows in production scheduling)
    CmmsRabbitmqTopic("ProductionOrder", "productionorder"),
    CmmsRabbitmqTopic("ScheduleOrder", "scheduleorder"),
]

# ── Lookup Helpers ─────────────────────────────────────────────────

_GRAPHQL_BY_NAME: dict[str, CmmsGraphqlEntity] = {
    e.entity_name: e for e in CMMS_GRAPHQL_ENTITIES
}

_GRAPHQL_BY_QUERY: dict[str, CmmsGraphqlEntity] = {
    e.graphql_query_name: e for e in CMMS_GRAPHQL_ENTITIES
}

_RABBITMQ_BY_TOPIC: dict[str, CmmsRabbitmqTopic] = {
    t.entity_key: t for t in CMMS_RABBITMQ_TOPICS
}


def graphql_entity_for_name(entity_name: str) -> CmmsGraphqlEntity | None:
    """Look up a CmmsGraphqlEntity by its name (e.g., 'WorkOrder')."""
    return _GRAPHQL_BY_NAME.get(entity_name)


def graphql_entity_for_query(query_name: str) -> CmmsGraphqlEntity | None:
    """Look up a CmmsGraphqlEntity by its GraphQL query name (e.g., 'workOrders')."""
    return _GRAPHQL_BY_QUERY.get(query_name.lower())


def rabbitmq_topic_for_key(entity_key: str) -> CmmsRabbitmqTopic | None:
    """Look up a CmmsRabbitmqTopic by its key (e.g., 'item')."""
    return _RABBITMQ_BY_TOPIC.get(entity_key.lower())
