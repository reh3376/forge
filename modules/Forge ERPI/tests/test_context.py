"""Tests for ERPI context builder — the core intelligence of the adapter.

Verifies that ERPI transaction fields (transactionInitiator,
transactionStatus, transactionType) are correctly extracted as
first-class context fields, and that data flow direction is
correctly derived.
"""

from __future__ import annotations

import pytest

from forge.adapters.whk_erpi.context import build_record_context


class TestTransactionFields:
    """Verify ERPI transaction metadata extraction."""

    def test_erp_initiator(self):
        ctx = build_record_context({
            "data": {
                "event_type": "create",
                "recordName": "Item",
                "data": {
                    "globalId": "ITEM-001",
                    "transactionInitiator": "ERP",
                    "transactionStatus": "CONFIRMED",
                    "transactionType": "CREATE",
                },
            },
        })
        assert ctx.extra["transaction_initiator"] == "ERP"
        assert ctx.extra["sync_state"] == "CONFIRMED"
        assert ctx.extra["operation_type"] == "CREATE"

    def test_wh_initiator(self):
        ctx = build_record_context({
            "data": {
                "event_type": "update",
                "recordName": "Barrel",
                "data": {
                    "globalId": "BRL-001",
                    "transactionInitiator": "WH",
                    "transactionStatus": "SENT",
                    "transactionType": "UPDATE",
                },
            },
        })
        assert ctx.extra["transaction_initiator"] == "WH"
        assert ctx.extra["sync_state"] == "SENT"
        assert ctx.extra["operation_type"] == "UPDATE"

    def test_case_normalization_erp(self):
        ctx = build_record_context({
            "data": {
                "event_type": "create",
                "recordName": "Item",
                "data": {
                    "globalId": "I-1",
                    "transactionInitiator": "Erp",
                },
            },
        })
        assert ctx.extra["transaction_initiator"] == "ERP"

    def test_case_normalization_wh(self):
        ctx = build_record_context({
            "data": {
                "event_type": "create",
                "recordName": "Item",
                "data": {
                    "globalId": "I-1",
                    "transactionInitiator": "Wh",
                },
            },
        })
        assert ctx.extra["transaction_initiator"] == "WH"

    def test_unknown_initiator(self):
        ctx = build_record_context({
            "data": {
                "event_type": "create",
                "recordName": "Item",
                "data": {"globalId": "I-1"},
            },
        })
        assert ctx.extra["transaction_initiator"] == "UNKNOWN"

    def test_missing_fields_default_to_unknown(self):
        ctx = build_record_context({
            "data": {
                "event_type": "create",
                "recordName": "Item",
                "data": {"globalId": "I-1"},
            },
        })
        assert ctx.extra["sync_state"] == "UNKNOWN"
        assert ctx.extra["operation_type"] == "UNKNOWN"


class TestDataFlowDirection:
    """Verify derived data flow direction."""

    def test_erp_inbound(self):
        ctx = build_record_context({
            "data": {
                "event_type": "create",
                "recordName": "Recipe",
                "data": {
                    "globalId": "R-1",
                    "transactionInitiator": "ERP",
                },
            },
        })
        assert ctx.extra["data_flow_direction"] == "inbound_from_erp"

    def test_wh_outbound(self):
        ctx = build_record_context({
            "data": {
                "event_type": "update",
                "recordName": "Barrel",
                "data": {
                    "globalId": "B-1",
                    "transactionInitiator": "WH",
                },
            },
        })
        assert ctx.extra["data_flow_direction"] == "outbound_to_erp"

    def test_missing_initiator_unknown_direction(self):
        ctx = build_record_context({
            "data": {
                "event_type": "create",
                "recordName": "Item",
                "data": {"globalId": "I-1"},
            },
        })
        assert ctx.extra["data_flow_direction"] == "unknown"


class TestEntityCategory:
    """Verify entity-to-category mapping."""

    def test_master_data_category(self):
        for entity in ("Item", "ItemGroup", "Vendor", "Customer", "Account", "Asset", "Location"):
            ctx = build_record_context({
                "data": {
                    "event_type": "create",
                    "recordName": entity,
                    "data": {"globalId": f"{entity}-1"},
                },
            })
            assert ctx.extra["entity_category"] == "master_data", f"Failed for {entity}"

    def test_recipe_category(self):
        for entity in ("Recipe", "RecipeParameter", "RecipeGroup", "Bom", "BomItem"):
            ctx = build_record_context({
                "data": {
                    "event_type": "create",
                    "recordName": entity,
                    "data": {"globalId": f"{entity}-1"},
                },
            })
            assert ctx.extra["entity_category"] == "recipe_management", f"Failed for {entity}"

    def test_production_category(self):
        for entity in ("ProductionOrder", "ProductionOrderUnitProcedure", "UnitProcedure", "Operation", "EquipmentPhase"):
            ctx = build_record_context({
                "data": {
                    "event_type": "create",
                    "recordName": entity,
                    "data": {"globalId": f"{entity}-1"},
                },
            })
            assert ctx.extra["entity_category"] in ("production", "scheduling"), f"Failed for {entity}"

    def test_barrel_tracking_category(self):
        for entity in ("Barrel", "BarrelEvent", "BarrelReceipt"):
            ctx = build_record_context({
                "data": {
                    "event_type": "create",
                    "recordName": entity,
                    "data": {"globalId": f"{entity}-1"},
                },
            })
            assert ctx.extra["entity_category"] == "barrel_tracking", f"Failed for {entity}"


class TestRelationalContext:
    """Verify relational fields are extracted correctly."""

    def test_lot_id_from_payload(self):
        ctx = build_record_context({
            "data": {
                "event_type": "update",
                "recordName": "Barrel",
                "data": {"globalId": "B-1", "lotId": "LOT-001"},
            },
        })
        assert ctx.lot_id == "LOT-001"

    def test_recipe_id_from_payload(self):
        ctx = build_record_context({
            "data": {
                "event_type": "create",
                "recordName": "RecipeParameter",
                "data": {"globalId": "RP-1", "recipeId": "RCP-001"},
            },
        })
        assert ctx.recipe_id == "RCP-001"

    def test_production_order_id(self):
        ctx = build_record_context({
            "data": {
                "event_type": "create",
                "recordName": "ProductionOrderUnitProcedure",
                "data": {"globalId": "POUP-1", "productionOrderId": "PO-001"},
            },
        })
        assert ctx.extra.get("production_order_id") == "PO-001"

    def test_site_field(self):
        ctx = build_record_context({
            "data": {
                "event_type": "create",
                "recordName": "Item",
                "data": {"globalId": "I-1"},
            },
        })
        assert ctx.site == "whk01.distillery01"

    def test_cross_system_id(self):
        ctx = build_record_context({
            "data": {
                "event_type": "create",
                "recordName": "Item",
                "data": {"globalId": "ITEM-NS-00412"},
            },
        })
        assert ctx.extra["cross_system_id"] == "ITEM-NS-00412"

    def test_message_id_captured(self):
        ctx = build_record_context({
            "data": {
                "event_type": "create",
                "recordName": "Item",
                "data": {"globalId": "I-1"},
                "messageId": "msg-123",
            },
        })
        assert ctx.extra["message_id"] == "msg-123"
