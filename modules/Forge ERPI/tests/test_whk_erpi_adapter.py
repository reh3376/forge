"""Tests for the WHK ERPI adapter lifecycle, collection, and capabilities.

Follows the same testing pattern as test_whk_wms_adapter.py and
test_whk_mes_adapter.py: inject raw message dicts, verify ContextualRecords.
"""

from __future__ import annotations

import pytest

from forge.adapters.whk_erpi import WhkErpiAdapter
from forge.core.models.adapter import AdapterState

# ── Test Fixtures ──────────────────────────────────────────────

_VALID_CONFIG = {
    "rabbitmq_url": "amqp://guest:guest@localhost:5672",
    "erpi_rest_url": "http://localhost:3000/api",
    "erpi_graphql_url": "http://localhost:3000/graphql",
    "rabbitmq_consumer_group": "forge-erpi-test",
}

_SAMPLE_ITEM_MESSAGE = {
    "data": {
        "event_type": "create",
        "recordName": "Item",
        "data": {
            "id": "cuid_item_001",
            "globalId": "ITEM-NS-00412",
            "name": "Corn - #2 Yellow Dent",
            "type": "Inventory",
            "category": "Raw Material",
            "unitOfMeasure": "LB",
            "transactionInitiator": "ERP",
            "transactionStatus": "PENDING",
            "transactionType": "CREATE",
            "schemaVersion": "1.0.0",
            "createdAt": "2026-04-07T10:00:00Z",
            "updatedAt": "2026-04-07T10:00:00Z",
        },
        "messageId": "msg-001",
    },
}

_SAMPLE_BARREL_MESSAGE = {
    "data": {
        "event_type": "update",
        "recordName": "Barrel",
        "data": {
            "id": "cuid_barrel_001",
            "globalId": "BRL-2024-000142",
            "barrelNumber": "BRL-2024-000142",
            "type": "NEW_CHARRED_OAK",
            "status": "FILLED",
            "lotId": "LOT-2024-WB-0087",
            "transactionInitiator": "WH",
            "transactionStatus": "SENT",
            "transactionType": "UPDATE",
            "updatedAt": "2026-04-07T14:30:00Z",
        },
    },
}

_SAMPLE_RECIPE_MESSAGE = {
    "data": {
        "event_type": "create",
        "recordName": "Recipe",
        "data": {
            "id": "cuid_recipe_001",
            "globalId": "RCP-NS-00055",
            "name": "Wheated Bourbon Mash #3",
            "transactionInitiator": "ERP",
            "transactionStatus": "CONFIRMED",
            "transactionType": "CREATE",
            "createdAt": "2026-04-01T08:00:00Z",
        },
    },
}

_SAMPLE_PRODUCTION_ORDER_MESSAGE = {
    "data": {
        "event_type": "create",
        "recordName": "ProductionOrderUnitProcedure",
        "data": {
            "id": "cuid_poup_001",
            "globalId": "POUP-2026-00123",
            "productionOrderId": "PO-2026-00456",
            "unitProcedureId": "UP-2026-00789",
            "status": "IN_PROGRESS",
            "transactionInitiator": "WH",
            "transactionStatus": "PENDING",
            "transactionType": "CREATE",
            "updatedAt": "2026-04-07T12:00:00Z",
        },
    },
}


# ── Manifest Tests ─────────────────────────────────────────────


class TestManifest:
    def test_adapter_id(self):
        adapter = WhkErpiAdapter()
        assert adapter.manifest.adapter_id == "whk-erpi"

    def test_adapter_name(self):
        adapter = WhkErpiAdapter()
        assert "ERP Integration" in adapter.manifest.name

    def test_tier(self):
        adapter = WhkErpiAdapter()
        assert adapter.manifest.tier.value == "ERP_BUSINESS"

    def test_protocol(self):
        adapter = WhkErpiAdapter()
        assert adapter.manifest.protocol == "amqp+rest+graphql"

    def test_capabilities(self):
        adapter = WhkErpiAdapter()
        caps = adapter.manifest.capabilities
        assert caps.read is True
        assert caps.write is False
        assert caps.subscribe is True
        assert caps.backfill is True
        assert caps.discover is True

    def test_data_contract_schema_ref(self):
        adapter = WhkErpiAdapter()
        assert adapter.manifest.data_contract.schema_ref == "forge://schemas/whk-erpi/v0.1.0"

    def test_data_contract_context_fields(self):
        adapter = WhkErpiAdapter()
        fields = adapter.manifest.data_contract.context_fields
        assert "cross_system_id" in fields
        assert "source_system" in fields
        assert "entity_type" in fields
        assert "event_type" in fields
        assert "operation_type" in fields
        assert "sync_state" in fields
        assert "event_timestamp" in fields

    def test_connection_params_count(self):
        adapter = WhkErpiAdapter()
        assert len(adapter.manifest.connection_params) == 6

    def test_required_connection_params(self):
        adapter = WhkErpiAdapter()
        required = [p.name for p in adapter.manifest.connection_params if p.required]
        assert "rabbitmq_url" in required
        assert "erpi_rest_url" in required

    def test_metadata(self):
        adapter = WhkErpiAdapter()
        assert adapter.manifest.metadata["spoke"] == "erpi"
        assert "whk-erpi" in adapter.manifest.metadata["source_repo"]


# ── Lifecycle Tests ────────────────────────────────────────────


class TestLifecycle:
    @pytest.mark.asyncio
    async def test_initial_state(self):
        adapter = WhkErpiAdapter()
        assert adapter.state == AdapterState.REGISTERED

    @pytest.mark.asyncio
    async def test_configure(self):
        adapter = WhkErpiAdapter()
        await adapter.configure(_VALID_CONFIG)
        assert adapter.state == AdapterState.REGISTERED

    @pytest.mark.asyncio
    async def test_configure_validates_required(self):
        adapter = WhkErpiAdapter()
        with pytest.raises(Exception):  # pydantic ValidationError
            await adapter.configure({"rabbitmq_url": "amqp://localhost"})
            # missing erpi_rest_url

    @pytest.mark.asyncio
    async def test_start(self):
        adapter = WhkErpiAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        assert adapter.state == AdapterState.HEALTHY

    @pytest.mark.asyncio
    async def test_start_without_configure_raises(self):
        adapter = WhkErpiAdapter()
        with pytest.raises(RuntimeError, match="not configured"):
            await adapter.start()

    @pytest.mark.asyncio
    async def test_stop(self):
        adapter = WhkErpiAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        await adapter.stop()
        assert adapter.state == AdapterState.STOPPED

    @pytest.mark.asyncio
    async def test_health_after_start(self):
        adapter = WhkErpiAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        health = await adapter.health()
        assert health.adapter_id == "whk-erpi"
        assert health.state == AdapterState.HEALTHY
        assert health.records_collected == 0
        assert health.records_failed == 0
        assert health.uptime_seconds >= 0

    @pytest.mark.asyncio
    async def test_health_records_collected(self):
        adapter = WhkErpiAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_ITEM_MESSAGE])
        async for _ in adapter.collect():
            pass
        health = await adapter.health()
        assert health.records_collected == 1


# ── Collection Tests ───────────────────────────────────────────


class TestCollect:
    @pytest.mark.asyncio
    async def test_collect_empty(self):
        adapter = WhkErpiAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        records = [r async for r in adapter.collect()]
        assert records == []

    @pytest.mark.asyncio
    async def test_collect_single_item(self):
        adapter = WhkErpiAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_ITEM_MESSAGE])
        records = [r async for r in adapter.collect()]
        assert len(records) == 1

    @pytest.mark.asyncio
    async def test_record_source(self):
        adapter = WhkErpiAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_ITEM_MESSAGE])
        records = [r async for r in adapter.collect()]
        record = records[0]
        assert record.source.adapter_id == "whk-erpi"
        assert record.source.system == "whk-erpi"
        assert "erpi.item.create" in record.source.tag_path

    @pytest.mark.asyncio
    async def test_record_context_cross_system_id(self):
        adapter = WhkErpiAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_ITEM_MESSAGE])
        records = [r async for r in adapter.collect()]
        ctx = records[0].context
        assert ctx.extra["cross_system_id"] == "ITEM-NS-00412"

    @pytest.mark.asyncio
    async def test_record_context_transaction_initiator(self):
        adapter = WhkErpiAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_ITEM_MESSAGE])
        records = [r async for r in adapter.collect()]
        ctx = records[0].context
        assert ctx.extra["transaction_initiator"] == "ERP"

    @pytest.mark.asyncio
    async def test_record_context_data_flow_direction(self):
        adapter = WhkErpiAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_ITEM_MESSAGE])
        records = [r async for r in adapter.collect()]
        assert records[0].context.extra["data_flow_direction"] == "inbound_from_erp"

    @pytest.mark.asyncio
    async def test_record_context_wh_direction(self):
        adapter = WhkErpiAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_BARREL_MESSAGE])
        records = [r async for r in adapter.collect()]
        ctx = records[0].context
        assert ctx.extra["transaction_initiator"] == "WH"
        assert ctx.extra["data_flow_direction"] == "outbound_to_erp"

    @pytest.mark.asyncio
    async def test_record_context_entity_type(self):
        adapter = WhkErpiAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_RECIPE_MESSAGE])
        records = [r async for r in adapter.collect()]
        ctx = records[0].context
        assert ctx.extra["entity_type"] == "Recipe"
        assert ctx.extra["entity_category"] == "recipe_management"

    @pytest.mark.asyncio
    async def test_record_context_sync_state(self):
        adapter = WhkErpiAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_ITEM_MESSAGE])
        records = [r async for r in adapter.collect()]
        assert records[0].context.extra["sync_state"] == "PENDING"

    @pytest.mark.asyncio
    async def test_record_context_lot_id(self):
        adapter = WhkErpiAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_BARREL_MESSAGE])
        records = [r async for r in adapter.collect()]
        assert records[0].context.lot_id == "LOT-2024-WB-0087"

    @pytest.mark.asyncio
    async def test_record_lineage(self):
        adapter = WhkErpiAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_ITEM_MESSAGE])
        records = [r async for r in adapter.collect()]
        lineage = records[0].lineage
        assert lineage.adapter_id == "whk-erpi"
        assert lineage.schema_ref == "forge://schemas/whk-erpi/v0.1.0"
        assert len(lineage.transformation_chain) == 3
        assert "erpi.v1.Item" in lineage.transformation_chain[0]

    @pytest.mark.asyncio
    async def test_record_value_is_json(self):
        adapter = WhkErpiAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_ITEM_MESSAGE])
        records = [r async for r in adapter.collect()]
        assert records[0].value.data_type == "json"
        assert "Corn" in records[0].value.raw

    @pytest.mark.asyncio
    async def test_collect_multiple_entities(self):
        adapter = WhkErpiAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([
            _SAMPLE_ITEM_MESSAGE,
            _SAMPLE_BARREL_MESSAGE,
            _SAMPLE_RECIPE_MESSAGE,
            _SAMPLE_PRODUCTION_ORDER_MESSAGE,
        ])
        records = [r async for r in adapter.collect()]
        assert len(records) == 4
        entity_types = {r.context.extra["entity_type"] for r in records}
        assert entity_types == {"Item", "Barrel", "Recipe", "ProductionOrderUnitProcedure"}

    @pytest.mark.asyncio
    async def test_collect_clears_pending(self):
        adapter = WhkErpiAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_ITEM_MESSAGE])
        _ = [r async for r in adapter.collect()]
        records2 = [r async for r in adapter.collect()]
        assert records2 == []

    @pytest.mark.asyncio
    async def test_records_collected_counter(self):
        adapter = WhkErpiAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_ITEM_MESSAGE, _SAMPLE_BARREL_MESSAGE])
        _ = [r async for r in adapter.collect()]
        assert adapter._records_collected == 2


# ── Discovery Tests ────────────────────────────────────────────


class TestDiscover:
    @pytest.mark.asyncio
    async def test_discover_returns_topics(self):
        adapter = WhkErpiAdapter()
        items = await adapter.discover()
        assert len(items) > 30  # 33 entity + 3 ack

    @pytest.mark.asyncio
    async def test_discover_entity_format(self):
        adapter = WhkErpiAdapter()
        items = await adapter.discover()
        entity_items = [i for i in items if i["data_type"] == "entity_event"]
        assert len(entity_items) == 31  # 31 entity topics defined in topics.py
        for item in entity_items:
            assert item["tag_path"].startswith("wh.whk01.distillery01.")
            assert item["exchange_type"] == "fanout"
            assert item["collection_mode"] == "subscribe"

    @pytest.mark.asyncio
    async def test_discover_ack_topics(self):
        adapter = WhkErpiAdapter()
        items = await adapter.discover()
        ack_items = [i for i in items if i["data_type"] == "acknowledgment"]
        assert len(ack_items) == 3
        ack_paths = {i["tag_path"] for i in ack_items}
        assert "message_acknowledgment" in ack_paths
        assert "erpi.netsuite.operation.ack" in ack_paths
        assert "erpi.netsuite.operation.error" in ack_paths


# ── Subscription Tests ─────────────────────────────────────────


class TestSubscription:
    @pytest.mark.asyncio
    async def test_subscribe_returns_id(self):
        adapter = WhkErpiAdapter()
        sub_id = await adapter.subscribe(
            ["wh.whk01.distillery01.item"], callback=lambda x: x
        )
        assert sub_id is not None
        assert len(sub_id) > 0

    @pytest.mark.asyncio
    async def test_unsubscribe(self):
        adapter = WhkErpiAdapter()
        sub_id = await adapter.subscribe(
            ["wh.whk01.distillery01.item"], callback=lambda x: x
        )
        await adapter.unsubscribe(sub_id)
        assert sub_id not in adapter._subscriptions

    @pytest.mark.asyncio
    async def test_unsubscribe_nonexistent(self):
        adapter = WhkErpiAdapter()
        # Should not raise
        await adapter.unsubscribe("nonexistent-id")
