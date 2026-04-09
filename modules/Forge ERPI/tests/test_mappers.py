"""Tests for ERPI entity mappers — verify raw ERPI dicts map to Forge models.

Each mapper is a pure function: raw dict in, Forge domain model out.
Tests verify field mapping, missing field handling, and external ID construction.
"""

from __future__ import annotations

import pytest

from forge.adapters.whk_erpi.mappers.business_entity import map_vendor, map_customer
from forge.adapters.whk_erpi.mappers.material_item import map_item, map_item_group, map_bom_item
from forge.adapters.whk_erpi.mappers.process_definition import (
    map_recipe, map_recipe_parameter, map_recipe_group, map_bom,
)
from forge.adapters.whk_erpi.mappers.production import (
    map_production_order, map_production_order_unit_procedure,
    map_unit_procedure, map_operation, map_equipment_phase,
)
from forge.adapters.whk_erpi.mappers.inventory import (
    map_barrel, map_barrel_event, map_barrel_receipt,
    map_lot, map_item_receipt, map_inventory, map_inventory_transfer,
)
from forge.core.models.manufacturing.enums import EntityType


# ── Business Entity Mappers ────────────────────────────────────


class TestMapVendor:
    def test_basic_mapping(self):
        result = map_vendor({
            "id": "v1", "globalId": "VND-001", "name": "Corn Supply Co",
            "transactionInitiator": "ERP", "transactionStatus": "CONFIRMED",
            "transactionType": "CREATE",
        })
        assert result is not None
        assert result.entity_type == EntityType.VENDOR
        assert result.name == "Corn Supply Co"
        assert result.external_ids["global"] == "VND-001"
        assert result.external_ids["erpi"] == "v1"
        assert result.metadata["transactionInitiator"] == "ERP"

    def test_missing_name_returns_none(self):
        assert map_vendor({"id": "v1", "globalId": "VND-001"}) is None

    def test_missing_global_id_returns_none(self):
        assert map_vendor({"id": "v1", "name": "Test"}) is None


class TestMapCustomer:
    def test_basic_mapping(self):
        result = map_customer({
            "id": "c1", "globalId": "CUST-001", "name": "Bourbon Brands LLC",
            "parentCustomerId": "CUST-000",
        })
        assert result is not None
        assert result.entity_type == EntityType.CUSTOMER
        assert result.name == "Bourbon Brands LLC"
        assert result.parent_id == "CUST-000"

    def test_missing_fields_returns_none(self):
        assert map_customer({"id": "c1"}) is None


# ── Material Item Mappers ──────────────────────────────────────


class TestMapItem:
    def test_basic_mapping(self):
        result = map_item({
            "id": "i1", "globalId": "ITEM-001", "name": "Corn #2",
            "type": "Inventory", "category": "Raw Material",
            "unitOfMeasure": "LB", "vendorId": "VND-001",
            "transactionInitiator": "ERP",
        })
        assert result is not None
        assert result.item_number == "ITEM-001"
        assert result.name == "Corn #2"
        assert result.category == "Raw Material"
        assert result.unit_of_measure == "LB"
        assert result.vendor_id == "VND-001"

    def test_external_ids(self):
        result = map_item({
            "id": "i1", "globalId": "ITEM-001", "name": "Test",
        })
        assert result is not None
        assert result.external_ids == {"global": "ITEM-001", "erpi": "i1"}

    def test_missing_returns_none(self):
        assert map_item({"id": "i1"}) is None


class TestMapItemGroup:
    def test_basic_mapping(self):
        result = map_item_group({
            "id": "ig1", "globalId": "IG-001", "name": "Raw Materials",
            "description": "All raw material items",
        })
        assert result is not None
        assert result.category == "item_group"
        assert result.name == "Raw Materials"


class TestMapBomItem:
    def test_basic_mapping(self):
        result = map_bom_item({
            "id": "bi1", "globalId": "BI-001",
            "bomId": "BOM-001", "itemId": "ITEM-001",
            "quantity": 150.5, "unit": "LB",
        })
        assert result is not None
        assert result.category == "bom_item"
        assert result.metadata["bom_id"] == "BOM-001"
        assert result.metadata["quantity"] == 150.5


# ── Process Definition Mappers ─────────────────────────────────


class TestMapRecipe:
    def test_basic_mapping(self):
        result = map_recipe({
            "id": "r1", "globalId": "RCP-001", "name": "Wheated Bourbon #3",
            "transactionInitiator": "ERP",
        })
        assert result is not None
        assert result.name == "Wheated Bourbon #3"
        assert result.source_system == "whk-erpi"


class TestMapRecipeParameter:
    def test_basic_mapping(self):
        result = map_recipe_parameter({
            "id": "rp1", "globalId": "RP-001",
            "name": "mash_temp", "value": "165",
            "recipeId": "RCP-001",
        })
        assert result is not None
        assert result.parameters == {"mash_temp": "165"}
        assert result.metadata["parent_recipe_id"] == "RCP-001"


class TestMapRecipeGroup:
    def test_basic_mapping(self):
        result = map_recipe_group({
            "id": "rg1", "globalId": "RG-001", "name": "Bourbon Recipes",
        })
        assert result is not None
        assert result.metadata["entity_subtype"] == "recipe_group"


class TestMapBom:
    def test_basic_mapping(self):
        result = map_bom({
            "id": "bom1", "globalId": "BOM-001", "name": "WB#3 Materials",
            "recipeId": "RCP-001",
        })
        assert result is not None
        assert result.metadata["entity_subtype"] == "bill_of_materials"
        assert result.metadata["parent_recipe_id"] == "RCP-001"


# ── Production Mappers ─────────────────────────────────────────


class TestMapProductionOrder:
    def test_basic_mapping(self):
        result = map_production_order({
            "id": "po1", "globalId": "PO-001", "recipeId": "RCP-001",
            "status": "IN_PROGRESS",
        })
        assert result is not None
        assert result.order_number == "PO-001"
        assert result.recipe_id == "RCP-001"
        assert result.status == "IN_PROGRESS"


class TestMapProductionOrderUnitProcedure:
    def test_basic_mapping(self):
        result = map_production_order_unit_procedure({
            "id": "poup1", "globalId": "POUP-001",
            "productionOrderId": "PO-001",
            "unitProcedureId": "UP-001",
            "status": "ACTIVE",
        })
        assert result is not None
        assert result.metadata["netsuite_direct_post"] is True
        assert result.metadata["production_order_id"] == "PO-001"


class TestMapUnitProcedure:
    def test_basic_mapping(self):
        result = map_unit_procedure({
            "id": "up1", "globalId": "UP-001", "status": "ACTIVE",
        })
        assert result is not None
        assert result.metadata["isa88_level"] == "unit_procedure"


class TestMapOperation:
    def test_basic_mapping(self):
        result = map_operation({
            "id": "op1", "globalId": "OP-001",
            "unitProcedureId": "UP-001",
        })
        assert result is not None
        assert result.metadata["isa88_level"] == "operation"
        assert result.metadata["parent_unit_procedure_id"] == "UP-001"


class TestMapEquipmentPhase:
    def test_basic_mapping(self):
        result = map_equipment_phase({
            "id": "ep1", "globalId": "EP-001",
            "operationId": "OP-001",
        })
        assert result is not None
        assert result.metadata["isa88_level"] == "equipment_phase"


# ── Inventory Mappers ──────────────────────────────────────────


class TestMapBarrel:
    def test_basic_mapping(self):
        result = map_barrel({
            "id": "b1", "globalId": "BRL-001",
            "barrelNumber": "BRL-2024-000142",
            "type": "NEW_CHARRED_OAK", "status": "FILLED",
            "lotId": "LOT-001",
        })
        assert result is not None
        assert result.serial_number == "BRL-2024-000142"
        assert result.unit_type == "NEW_CHARRED_OAK"
        assert result.lot_id == "LOT-001"


class TestMapBarrelEvent:
    def test_basic_mapping(self):
        result = map_barrel_event({
            "id": "be1", "globalId": "BE-001",
            "eventType": "fill_completed", "barrelId": "BRL-001",
        })
        assert result is not None
        assert result.event_type == "fill_completed"
        assert result.asset_id == "BRL-001"


class TestMapLot:
    def test_basic_mapping(self):
        result = map_lot({
            "id": "l1", "globalId": "LOT-001",
            "lotNumber": "LOT-2024-WB-0087",
            "status": "ACTIVE",
        })
        assert result is not None
        assert result.lot_number == "LOT-2024-WB-0087"


class TestMapItemReceipt:
    def test_basic_mapping(self):
        result = map_item_receipt({
            "id": "ir1", "globalId": "IR-001",
            "quantity": 500, "itemId": "ITEM-001",
        })
        assert result is not None
        assert result.event_type == "item_receipt"
        assert result.metadata["delayed_posting"] is True
        assert result.metadata["quantity"] == 500


class TestMapInventory:
    def test_basic_mapping(self):
        result = map_inventory({
            "id": "inv1", "globalId": "INV-001",
            "quantity": 1000, "locationId": "LOC-01",
            "itemId": "ITEM-001",
        })
        assert result is not None
        assert result.event_type == "inventory_snapshot"
        assert result.metadata["quantity"] == 1000


class TestMapInventoryTransfer:
    def test_basic_mapping(self):
        result = map_inventory_transfer({
            "id": "it1", "globalId": "IT-001",
            "quantity": 50, "fromLocationId": "LOC-01",
            "toLocationId": "LOC-02",
        })
        assert result is not None
        assert result.event_type == "inventory_transfer"
        assert result.metadata["from_location"] == "LOC-01"
        assert result.metadata["to_location"] == "LOC-02"


# ── Null Safety Tests ──────────────────────────────────────────


class TestNullSafety:
    """All mappers must return None for records missing globalId."""

    def test_all_mappers_handle_missing_global_id(self):
        raw_missing = {"id": "test-1", "name": "Test"}
        assert map_vendor(raw_missing) is None
        assert map_customer(raw_missing) is None
        assert map_item(raw_missing) is None
        assert map_item_group(raw_missing) is None
        assert map_bom_item({"id": "test-1"}) is None
        assert map_recipe(raw_missing) is None
        assert map_recipe_parameter({"id": "test-1"}) is None
        assert map_recipe_group(raw_missing) is None
        assert map_bom(raw_missing) is None
        assert map_production_order({"id": "test-1"}) is None
        assert map_production_order_unit_procedure({"id": "test-1"}) is None
        assert map_unit_procedure({"id": "test-1"}) is None
        assert map_operation({"id": "test-1"}) is None
        assert map_equipment_phase({"id": "test-1"}) is None
        assert map_barrel({"id": "test-1"}) is None
        assert map_barrel_event({"id": "test-1"}) is None
        assert map_barrel_receipt({"id": "test-1"}) is None
        assert map_lot({"id": "test-1"}) is None
        assert map_item_receipt({"id": "test-1"}) is None
        assert map_inventory({"id": "test-1"}) is None
        assert map_inventory_transfer({"id": "test-1"}) is None
