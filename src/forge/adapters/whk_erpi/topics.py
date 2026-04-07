"""ERPI RabbitMQ topic definitions.

All 36 topics (33 entity + 3 acknowledgment) as documented in the
ERPI discovery and whk-erpi.facts.json. Entity topics follow the
UNS pattern: wh.whk01.distillery01.<entityname>.

The fanout exchange architecture means each topic is its own exchange.
The Forge adapter creates a separate durable queue per exchange
(forge-erpi-<entity>) without affecting existing ERPI consumers.
"""

from __future__ import annotations

from dataclasses import dataclass

_UNS_PREFIX = "wh.whk01.distillery01"


@dataclass(frozen=True)
class ErpiEntityTopic:
    """An ERPI entity topic on the RabbitMQ UNS bus."""

    entity_name: str
    entity_key: str  # lowercase key used in topic name
    actively_consumed_by_erpi: bool = True

    @property
    def full_topic(self) -> str:
        return f"{_UNS_PREFIX}.{self.entity_key}"


# ── 33 Entity Topics ──────────────────────────────────────────
# Ordered by data flow: ERP master data → manufacturing → inventory → financial

ERPI_ENTITY_TOPICS: list[ErpiEntityTopic] = [
    # ERP Master Data (NetSuite → ERPI → downstream)
    ErpiEntityTopic("Item", "item"),
    ErpiEntityTopic("ItemGroup", "itemgroup"),
    ErpiEntityTopic("Vendor", "vendor"),
    ErpiEntityTopic("Customer", "customer", actively_consumed_by_erpi=False),
    ErpiEntityTopic("Account", "account", actively_consumed_by_erpi=False),
    ErpiEntityTopic("Asset", "asset", actively_consumed_by_erpi=False),
    ErpiEntityTopic("Location", "location"),
    # Recipe & BOM (NetSuite → ERPI → MES)
    ErpiEntityTopic("Recipe", "recipe", actively_consumed_by_erpi=False),
    ErpiEntityTopic("RecipeParameter", "recipeparameter", actively_consumed_by_erpi=False),
    ErpiEntityTopic("RecipeGroup", "recipegroup", actively_consumed_by_erpi=False),
    ErpiEntityTopic("Bom", "bom", actively_consumed_by_erpi=False),
    ErpiEntityTopic("BomItem", "bomitem", actively_consumed_by_erpi=False),
    # Manufacturing Execution (MES → ERPI → NetSuite)
    ErpiEntityTopic("ProductionOrder", "productionorder", actively_consumed_by_erpi=False),
    ErpiEntityTopic("ProductionOrderUnitProcedure", "productionorderunitprocedure"),
    ErpiEntityTopic("UnitProcedure", "unitprocedure"),
    ErpiEntityTopic("Operation", "operation"),
    ErpiEntityTopic("EquipmentPhase", "equipmentphase"),
    ErpiEntityTopic("ProductionSchedule", "productionschedule"),
    ErpiEntityTopic("ScheduleOrder", "scheduleorder"),
    ErpiEntityTopic("ScheduleQueue", "schedulequeue"),
    # Purchase & Sales (bidirectional)
    ErpiEntityTopic("PurchaseOrder", "purchaseorder", actively_consumed_by_erpi=False),
    ErpiEntityTopic("SalesOrder", "salesorder", actively_consumed_by_erpi=False),
    # Inventory & Warehouse (WMS → ERPI → NetSuite)
    ErpiEntityTopic("Inventory", "inventory"),
    ErpiEntityTopic("InventoryTransfer", "inventorytransfer"),
    ErpiEntityTopic("Barrel", "barrel"),
    ErpiEntityTopic("BarrelEvent", "barrelevent"),
    ErpiEntityTopic("BarrelReceipt", "barrelreceipt"),
    ErpiEntityTopic("Lot", "lot"),
    ErpiEntityTopic("Kit", "kit"),
    ErpiEntityTopic("Batch", "batch", actively_consumed_by_erpi=False),
    # Item Receipt (special: 1-week delayed posting to NetSuite)
    ErpiEntityTopic("ItemReceipt", "itemreceipt"),
]

# ── 3 Acknowledgment Topics ───────────────────────────────────

ERPI_ACK_TOPICS: list[str] = [
    "message_acknowledgment",
    "erpi.netsuite.operation.ack",
    "erpi.netsuite.operation.error",
]

# ── Lookup Helpers ─────────────────────────────────────────────

_TOPIC_BY_KEY: dict[str, ErpiEntityTopic] = {
    t.entity_key: t for t in ERPI_ENTITY_TOPICS
}

_TOPIC_BY_FULL: dict[str, ErpiEntityTopic] = {
    t.full_topic: t for t in ERPI_ENTITY_TOPICS
}


def topic_for_entity_key(entity_key: str) -> ErpiEntityTopic | None:
    """Look up an ErpiEntityTopic by its lowercase key (e.g. 'item')."""
    return _TOPIC_BY_KEY.get(entity_key.lower())


def topic_for_full_name(full_topic: str) -> ErpiEntityTopic | None:
    """Look up an ErpiEntityTopic by its full UNS name."""
    return _TOPIC_BY_FULL.get(full_topic)
