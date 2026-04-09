"""Tests for the WHK CMMS adapter lifecycle, collection, discovery, and capabilities.

Follows the same testing pattern as test_whk_erpi_adapter.py: inject raw message dicts,
verify ContextualRecords with CMMS-specific maintenance context fields.
"""

from __future__ import annotations

import pytest

from forge.adapters.whk_cmms import WhkCmmsAdapter
from forge.core.models.adapter import AdapterState

# ── Test Fixtures ──────────────────────────────────────────────

_VALID_CONFIG = {
    "cmms_graphql_url": "http://localhost:3000/graphql",
    "cmms_rest_url": "http://localhost:3000/api",
    "rabbitmq_url": "amqp://guest:guest@localhost:5672",
    "jwt_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test",
    "poll_interval_seconds": 60,
}

# Asset (equipment) message
_SAMPLE_ASSET_MESSAGE = {
    "entity_type": "Asset",
    "event_type": "query",
    "globalId": "ASSET-WH-001",
    "id": "asset_001",
    "assetPath": "Distillery01.Utility01.Neutralization01",
    "assetType": "Tank",
    "assetMake": "Tanks-R-Us",
    "assetModel": "Model X1000",
    "parentAssetId": "ASSET-WH-000",
    "active": True,
    "oemManufacturer": "Vendor-OEM",
    "inServiceDate": "2020-01-15",
    "createdAt": "2026-04-07T10:00:00Z",
    "updatedAt": "2026-04-07T10:00:00Z",
}

# Work Order (actual maintenance work) message
_SAMPLE_WORK_ORDER_MESSAGE = {
    "entity_type": "WorkOrder",
    "event_type": "create",
    "globalId": "WO-2026-001",
    "id": "wo_001",
    "name": "PM - Tank Inspection",
    "status": "SCHEDULED",
    "priority": "High",
    "assetId": "ASSET-WH-001",
    "asset_path": "Distillery01.Utility01.Neutralization01",
    "workOrderType": "Preventive",
    "scheduledStart": "2026-04-15T09:00:00Z",
    "scheduledEnd": "2026-04-15T17:00:00Z",
    "estimatedDuration": "480",
    "kitId": "KIT-NEUTRAL-001",
    "maintenanceTechAssigned": ["tech_001", "tech_002"],
    "cron_schedule": "0 9 * * 0",
    "backflushed": False,
    "createdAt": "2026-04-07T10:00:00Z",
    "updatedAt": "2026-04-07T10:00:00Z",
}

# Work Request (maintenance request needing approval) message
_SAMPLE_WORK_REQUEST_MESSAGE = {
    "entity_type": "WorkRequest",
    "event_type": "create",
    "globalId": "WR-2026-001",
    "id": "wr_001",
    "issueDescription": "Pump making strange noise",
    "status": "PENDING",
    "priorityLevel": "Critical",
    "assetId": "ASSET-WH-002",
    "asset_path": "Distillery01.Utility01.ChillingUnit01",
    "cron_schedule": None,
    "period": "Week",
    "periodicFrequency": 1,
    "maintenanceRoleApproval": False,
    "operationsSupervisorApproval": None,
    "createdAt": "2026-04-07T11:30:00Z",
    "updatedAt": "2026-04-07T11:30:00Z",
}

# Item (inventory item, often from ERPI) message
_SAMPLE_ITEM_MESSAGE = {
    "entity_type": "Item",
    "event_type": "query",
    "globalId": "ITEM-NS-00412",
    "id": "item_001",
    "itemName": "Replacement Seal Kit",
    "itemPartNo": "SK-1234-567",
    "itemClass": "Maintenance Parts",
    "inventoryQuantity": 45,
    "minInventoryLevel": 10,
    "maxInventoryLevel": 100,
    "costAtLastPurchase": 125.50,
    "erpId": "ITEM-NS-00412",
    "isLocallyTracked": False,
    "obsoleteItem": False,
    "createdAt": "2026-03-01T08:00:00Z",
    "updatedAt": "2026-04-07T10:00:00Z",
}

# Kit (maintenance kit) message
_SAMPLE_KIT_MESSAGE = {
    "entity_type": "Kit",
    "event_type": "query",
    "globalId": "KIT-NEUTRAL-001",
    "id": "kit_001",
    "kitName": "Neutralization Unit PM Kit",
    "items": ["item_001", "item_002", "item_003"],
    "itemQuantitiesUsed": {"item_001": 2, "item_002": 1, "item_003": 3},
    "workOrders": ["wo_001", "wo_002"],
    "createdAt": "2026-02-01T08:00:00Z",
    "updatedAt": "2026-04-07T10:00:00Z",
}

# Vendor (maintenance vendor) message
_SAMPLE_VENDOR_MESSAGE = {
    "entity_type": "Vendor",
    "event_type": "query",
    "globalId": "VEND-TANKS-001",
    "id": "vendor_001",
    "name": "Tanks-R-Us",
    "contactInformation": {"phone": "555-1234", "email": "support@tanks.com"},
    "additionalDetails": {"region": "Midwest", "rating": 4.5},
    "active": True,
    "createdAt": "2025-01-01T08:00:00Z",
    "updatedAt": "2026-04-07T10:00:00Z",
}

# Inventory Location message
_SAMPLE_INVENTORY_LOCATION_MESSAGE = {
    "entity_type": "InventoryLocation",
    "event_type": "query",
    "globalId": "LOC-PARTS-001",
    "id": "loc_001",
    "name": "Maintenance Parts Shelving",
    "path": "Warehouse01.MaintenanceArea.PartsShelves",
    "parentId": "LOC-WAREHOUSE-001",
    "children": ["LOC-PARTS-002", "LOC-PARTS-003"],
    "createdAt": "2026-01-01T08:00:00Z",
    "updatedAt": "2026-04-07T10:00:00Z",
}

# Inventory Investigation (audit reconciliation) message
_SAMPLE_INVENTORY_INVESTIGATION_MESSAGE = {
    "entity_type": "InventoryInvestigation",
    "event_type": "create",
    "globalId": "INVEST-2026-001",
    "id": "invest_001",
    "physicalCount": 52,
    "digitalCount": 48,
    "locationId": "LOC-PARTS-001",
    "location": "Warehouse01.MaintenanceArea.PartsShelves",
    "workOrderAssociated": "WO-2026-001",
    "createdAt": "2026-04-07T14:00:00Z",
    "updatedAt": "2026-04-07T14:00:00Z",
}

# Work Order Type (metadata) message
_SAMPLE_WORK_ORDER_TYPE_MESSAGE = {
    "entity_type": "WorkOrderType",
    "event_type": "query",
    "globalId": "WOTYPE-PREV-001",
    "id": "wotype_001",
    "typeName": "Preventive",
    "typeDescription": "Preventive maintenance work orders",
    "createdAt": "2025-01-01T08:00:00Z",
    "updatedAt": "2025-01-01T08:00:00Z",
}

# Work Request Type (metadata) message
_SAMPLE_WORK_REQUEST_TYPE_MESSAGE = {
    "entity_type": "WorkRequestType",
    "event_type": "query",
    "globalId": "WRTYPE-EMERGENCY-001",
    "id": "wrtype_001",
    "typeName": "Emergency",
    "typeDescription": "Emergency maintenance requests",
    "createdAt": "2025-01-01T08:00:00Z",
    "updatedAt": "2025-01-01T08:00:00Z",
}


# ── Manifest Tests ─────────────────────────────────────────────


class TestManifest:
    def test_adapter_id(self):
        adapter = WhkCmmsAdapter()
        assert adapter.manifest.adapter_id == "whk-cmms"

    def test_adapter_name(self):
        adapter = WhkCmmsAdapter()
        assert "CMMS" in adapter.manifest.name or "Maintenance" in adapter.manifest.name

    def test_tier(self):
        adapter = WhkCmmsAdapter()
        assert adapter.manifest.tier.value == "MES_MOM"

    def test_protocol(self):
        adapter = WhkCmmsAdapter()
        assert adapter.manifest.protocol == "graphql+rest+amqp"

    def test_capabilities(self):
        adapter = WhkCmmsAdapter()
        caps = adapter.manifest.capabilities
        assert caps.read is True
        assert caps.write is False
        assert caps.subscribe is True
        assert caps.backfill is True
        assert caps.discover is True

    def test_data_contract_schema_ref(self):
        adapter = WhkCmmsAdapter()
        assert adapter.manifest.data_contract.schema_ref == "forge://schemas/whk-cmms/v0.1.0"

    def test_data_contract_context_fields(self):
        adapter = WhkCmmsAdapter()
        fields = adapter.manifest.data_contract.context_fields
        assert "cross_system_id" in fields
        assert "source_system" in fields
        assert "entity_type" in fields
        assert "event_type" in fields
        assert "operation_context" in fields
        assert "asset_id" in fields

    def test_connection_params_count(self):
        adapter = WhkCmmsAdapter()
        assert len(adapter.manifest.connection_params) >= 2

    def test_required_connection_params(self):
        adapter = WhkCmmsAdapter()
        required = [p.name for p in adapter.manifest.connection_params if p.required]
        assert "cmms_graphql_url" in required
        assert "cmms_rest_url" in required

    def test_metadata(self):
        adapter = WhkCmmsAdapter()
        assert "cmms" in adapter.manifest.metadata.get("spoke", "").lower()


# ── Lifecycle Tests ────────────────────────────────────────────


class TestLifecycle:
    @pytest.mark.asyncio
    async def test_initial_state(self):
        adapter = WhkCmmsAdapter()
        assert adapter.state == AdapterState.REGISTERED

    @pytest.mark.asyncio
    async def test_configure(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        assert adapter.state == AdapterState.REGISTERED

    @pytest.mark.asyncio
    async def test_configure_validates_required(self):
        adapter = WhkCmmsAdapter()
        with pytest.raises(Exception):  # pydantic ValidationError
            await adapter.configure({"cmms_graphql_url": "http://localhost:3000/graphql"})
            # missing cmms_rest_url

    @pytest.mark.asyncio
    async def test_start(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        assert adapter.state == AdapterState.HEALTHY

    @pytest.mark.asyncio
    async def test_start_without_configure_raises(self):
        adapter = WhkCmmsAdapter()
        with pytest.raises(RuntimeError, match="not configured"):
            await adapter.start()

    @pytest.mark.asyncio
    async def test_stop(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        await adapter.stop()
        assert adapter.state == AdapterState.STOPPED

    @pytest.mark.asyncio
    async def test_health_after_start(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        health = await adapter.health()
        assert health.adapter_id == "whk-cmms"
        assert health.state == AdapterState.HEALTHY
        assert health.records_collected == 0
        assert health.records_failed == 0
        assert health.uptime_seconds >= 0

    @pytest.mark.asyncio
    async def test_health_records_collected(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_ASSET_MESSAGE])
        async for _ in adapter.collect():
            pass
        health = await adapter.health()
        assert health.records_collected == 1


# ── Collection Tests ───────────────────────────────────────────


class TestCollect:
    @pytest.mark.asyncio
    async def test_collect_empty(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        records = [r async for r in adapter.collect()]
        assert records == []

    @pytest.mark.asyncio
    async def test_collect_single_item(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_ASSET_MESSAGE])
        records = [r async for r in adapter.collect()]
        assert len(records) == 1

    @pytest.mark.asyncio
    async def test_record_source(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_ASSET_MESSAGE])
        records = [r async for r in adapter.collect()]
        record = records[0]
        assert record.source.adapter_id == "whk-cmms"
        assert record.source.system == "whk-cmms"
        assert "cmms.asset" in record.source.tag_path

    @pytest.mark.asyncio
    async def test_record_context_entity_type(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_WORK_ORDER_MESSAGE])
        records = [r async for r in adapter.collect()]
        ctx = records[0].context
        assert ctx.extra["entity_type"] == "WorkOrder"

    @pytest.mark.asyncio
    async def test_record_context_event_type(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_WORK_ORDER_MESSAGE])
        records = [r async for r in adapter.collect()]
        ctx = records[0].context
        assert ctx.extra["event_type"] == "create"

    @pytest.mark.asyncio
    async def test_record_context_operation_context(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_WORK_ORDER_MESSAGE])
        records = [r async for r in adapter.collect()]
        ctx = records[0].context
        assert ctx.extra["operation_context"] == "maintenance"

    @pytest.mark.asyncio
    async def test_record_context_cross_system_id(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_WORK_ORDER_MESSAGE])
        records = [r async for r in adapter.collect()]
        ctx = records[0].context
        assert ctx.extra["cross_system_id"] == "WO-2026-001"

    @pytest.mark.asyncio
    async def test_record_context_asset_id(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_WORK_ORDER_MESSAGE])
        records = [r async for r in adapter.collect()]
        ctx = records[0].context
        assert ctx.extra["asset_id"] == "ASSET-WH-001"
        assert ctx.equipment_id == "ASSET-WH-001"

    @pytest.mark.asyncio
    async def test_record_context_asset_path(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_WORK_ORDER_MESSAGE])
        records = [r async for r in adapter.collect()]
        ctx = records[0].context
        assert ctx.extra["asset_path"] == "Distillery01.Utility01.Neutralization01"

    @pytest.mark.asyncio
    async def test_record_context_work_order_type(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_WORK_ORDER_MESSAGE])
        records = [r async for r in adapter.collect()]
        ctx = records[0].context
        assert ctx.extra["work_order_type"] == "Preventive"

    @pytest.mark.asyncio
    async def test_record_context_priority_level(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_WORK_ORDER_MESSAGE])
        records = [r async for r in adapter.collect()]
        ctx = records[0].context
        assert ctx.extra["priority_level"] == "High"

    @pytest.mark.asyncio
    async def test_record_context_maintenance_status(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_WORK_ORDER_MESSAGE])
        records = [r async for r in adapter.collect()]
        ctx = records[0].context
        assert ctx.extra["maintenance_status"] == "SCHEDULED"

    @pytest.mark.asyncio
    async def test_record_context_entity_category(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_WORK_ORDER_MESSAGE])
        records = [r async for r in adapter.collect()]
        ctx = records[0].context
        assert ctx.extra["entity_category"] == "maintenance"

    @pytest.mark.asyncio
    async def test_record_context_kit_id(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_WORK_ORDER_MESSAGE])
        records = [r async for r in adapter.collect()]
        ctx = records[0].context
        assert ctx.extra["kit_id"] == "KIT-NEUTRAL-001"

    @pytest.mark.asyncio
    async def test_record_context_cron_schedule(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_WORK_ORDER_MESSAGE])
        records = [r async for r in adapter.collect()]
        ctx = records[0].context
        assert ctx.extra["cron_schedule"] == "0 9 * * 0"

    @pytest.mark.asyncio
    async def test_record_context_work_request_approval(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        # Test with a message that has explicit True approval
        msg = dict(_SAMPLE_WORK_REQUEST_MESSAGE)
        msg["maintenanceRoleApproval"] = True
        adapter.inject_records([msg])
        records = [r async for r in adapter.collect()]
        ctx = records[0].context
        assert "maintenance_role_approval" in ctx.extra
        assert ctx.extra["maintenance_role_approval"] is True

    @pytest.mark.asyncio
    async def test_record_context_scheduled_start(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_WORK_ORDER_MESSAGE])
        records = [r async for r in adapter.collect()]
        ctx = records[0].context
        assert ctx.extra["scheduled_start"] == "2026-04-15T09:00:00Z"

    @pytest.mark.asyncio
    async def test_record_context_estimated_duration(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_WORK_ORDER_MESSAGE])
        records = [r async for r in adapter.collect()]
        ctx = records[0].context
        assert ctx.extra["estimated_duration"] == "480"

    @pytest.mark.asyncio
    async def test_record_lineage(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_ASSET_MESSAGE])
        records = [r async for r in adapter.collect()]
        lineage = records[0].lineage
        assert lineage.adapter_id == "whk-cmms"
        assert lineage.schema_ref == "forge://schemas/whk-cmms/v0.1.0"
        assert len(lineage.transformation_chain) >= 2

    @pytest.mark.asyncio
    async def test_record_value_is_json(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_ASSET_MESSAGE])
        records = [r async for r in adapter.collect()]
        assert records[0].value.data_type == "json"
        assert "Distillery01" in records[0].value.raw

    @pytest.mark.asyncio
    async def test_collect_multiple_entities(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([
            _SAMPLE_ASSET_MESSAGE,
            _SAMPLE_WORK_ORDER_MESSAGE,
            _SAMPLE_WORK_REQUEST_MESSAGE,
            _SAMPLE_ITEM_MESSAGE,
        ])
        records = [r async for r in adapter.collect()]
        assert len(records) == 4
        entity_types = {r.context.extra["entity_type"] for r in records}
        assert entity_types == {"Asset", "WorkOrder", "WorkRequest", "Item"}

    @pytest.mark.asyncio
    async def test_collect_clears_pending(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_ASSET_MESSAGE])
        _ = [r async for r in adapter.collect()]
        records2 = [r async for r in adapter.collect()]
        assert records2 == []

    @pytest.mark.asyncio
    async def test_records_collected_counter(self):
        adapter = WhkCmmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([
            _SAMPLE_ASSET_MESSAGE,
            _SAMPLE_WORK_ORDER_MESSAGE,
        ])
        _ = [r async for r in adapter.collect()]
        assert adapter._records_collected == 2


# ── Discovery Tests ────────────────────────────────────────────


class TestDiscover:
    @pytest.mark.asyncio
    async def test_discover_returns_entities_and_topics(self):
        adapter = WhkCmmsAdapter()
        items = await adapter.discover()
        assert len(items) > 15  # 11 GraphQL entities + 8 RabbitMQ topics

    @pytest.mark.asyncio
    async def test_discover_graphql_entities(self):
        adapter = WhkCmmsAdapter()
        items = await adapter.discover()
        graphql_items = [i for i in items if i["data_type"] == "graphql_entity"]
        assert len(graphql_items) == 11

    @pytest.mark.asyncio
    async def test_discover_graphql_entity_format(self):
        adapter = WhkCmmsAdapter()
        items = await adapter.discover()
        graphql_items = [i for i in items if i["data_type"] == "graphql_entity"]
        for item in graphql_items:
            assert item["tag_path"].startswith("cmms.")
            assert item["collection_mode"] == "poll"
            assert "graphql_query" in item
            assert "entity_type" in item

    @pytest.mark.asyncio
    async def test_discover_rabbitmq_topics(self):
        adapter = WhkCmmsAdapter()
        items = await adapter.discover()
        rmq_items = [i for i in items if i["data_type"] == "entity_event"]
        assert len(rmq_items) >= 7

    @pytest.mark.asyncio
    async def test_discover_rabbitmq_topic_format(self):
        adapter = WhkCmmsAdapter()
        items = await adapter.discover()
        rmq_items = [i for i in items if i["data_type"] == "entity_event"]
        for item in rmq_items:
            assert item["tag_path"].startswith("wh.whk01.distillery01.")
            assert item["collection_mode"] == "subscribe"
            assert item["exchange_type"] == "fanout"

    @pytest.mark.asyncio
    async def test_discover_includes_asset_entity(self):
        adapter = WhkCmmsAdapter()
        items = await adapter.discover()
        asset_item = [i for i in items if i.get("entity_type") == "Asset"]
        assert len(asset_item) == 1
        assert asset_item[0]["tag_path"] == "cmms.asset"

    @pytest.mark.asyncio
    async def test_discover_includes_work_order_entity(self):
        adapter = WhkCmmsAdapter()
        items = await adapter.discover()
        wo_item = [i for i in items if i.get("entity_type") == "WorkOrder"]
        assert len(wo_item) == 1
        assert wo_item[0]["tag_path"] == "cmms.workorder"

    @pytest.mark.asyncio
    async def test_discover_includes_item_topic(self):
        adapter = WhkCmmsAdapter()
        items = await adapter.discover()
        item_topics = [i for i in items if "item" in i["tag_path"].lower() and i["data_type"] == "entity_event"]
        assert len(item_topics) >= 1

    @pytest.mark.asyncio
    async def test_discover_includes_vendor_topic(self):
        adapter = WhkCmmsAdapter()
        items = await adapter.discover()
        vendor_topics = [i for i in items if "vendor" in i["tag_path"].lower() and i["data_type"] == "entity_event"]
        assert len(vendor_topics) >= 1


# ── Subscription Tests ─────────────────────────────────────────


class TestSubscription:
    @pytest.mark.asyncio
    async def test_subscribe_returns_id(self):
        adapter = WhkCmmsAdapter()
        sub_id = await adapter.subscribe(
            ["wh.whk01.distillery01.item"],
            callback=lambda x: x
        )
        assert sub_id is not None
        assert len(sub_id) > 0

    @pytest.mark.asyncio
    async def test_unsubscribe(self):
        adapter = WhkCmmsAdapter()
        sub_id = await adapter.subscribe(
            ["wh.whk01.distillery01.item"],
            callback=lambda x: x
        )
        await adapter.unsubscribe(sub_id)
        assert sub_id not in adapter._subscriptions

    @pytest.mark.asyncio
    async def test_unsubscribe_nonexistent(self):
        adapter = WhkCmmsAdapter()
        # Should not raise
        await adapter.unsubscribe("nonexistent-id")
