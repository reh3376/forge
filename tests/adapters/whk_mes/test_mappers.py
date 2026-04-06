"""Tests for all MES entity mappers -- 10 mapper functions + edge cases."""

from __future__ import annotations

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

# ---------------------------------------------------------------------------
# Batch (ManufacturingUnit)
# ---------------------------------------------------------------------------

class TestMapBatch:
    """Test map_batch() -> ManufacturingUnit."""

    def test_valid_batch(self):
        raw = {
            "id": "batch-001",
            "status": "IN_PROGRESS",
            "lotId": "lot-001",
            "recipeId": "rcp-001",
            "customerId": "cust-001",
        }
        result = map_batch(raw)
        assert result is not None
        assert result.source_system == "whk-mes"
        assert result.source_id == "batch-001"
        assert result.unit_type == "batch"

    def test_batch_status_mapping(self):
        raw = {"id": "b-001", "status": "COMPLETED"}
        result = map_batch(raw)
        assert result is not None
        assert result.status.value == "COMPLETE"

    def test_batch_active_status(self):
        raw = {"id": "b-001", "status": "STARTED"}
        result = map_batch(raw)
        assert result is not None
        assert result.status.value == "ACTIVE"

    def test_batch_held_status(self):
        raw = {"id": "b-001", "status": "PAUSED"}
        result = map_batch(raw)
        assert result is not None
        assert result.status.value == "HELD"

    def test_batch_missing_id(self):
        raw = {"status": "IN_PROGRESS"}
        assert map_batch(raw) is None

    def test_batch_camel_case_fields(self):
        raw = {"id": "b-001", "batchId": "b-001", "lotId": "L-001", "recipeId": "R-001"}
        result = map_batch(raw)
        assert result is not None
        assert result.lot_id == "L-001"
        assert result.recipe_id == "R-001"

    def test_batch_metadata(self):
        raw = {"id": "b-001", "currentStepIndex": 3, "productionOrderId": "PRO-001"}
        result = map_batch(raw)
        assert result is not None
        assert result.metadata["current_step_index"] == 3
        assert result.metadata["production_order_id"] == "PRO-001"

    def test_batch_quantity(self):
        raw = {"id": "b-001", "expectedQuantity": 1500.0, "unit": "gallons"}
        result = map_batch(raw)
        assert result is not None
        assert result.quantity == 1500.0
        assert result.unit_of_measure == "gallons"


# ---------------------------------------------------------------------------
# Lot
# ---------------------------------------------------------------------------

class TestMapLot:
    """Test map_lot() -> Lot."""

    def test_valid_lot(self):
        raw = {"id": "lot-001", "globalId": "GLB-001", "whiskeyType": "Bourbon"}
        result = map_lot(raw)
        assert result is not None
        assert result.source_id == "lot-001"
        assert result.lot_number == "GLB-001"
        assert result.product_type == "Bourbon"

    def test_lot_with_external_id(self):
        raw = {"id": "lot-001", "externalId": "EXT-001"}
        result = map_lot(raw)
        assert result is not None
        assert result.lot_number == "EXT-001"

    def test_lot_missing_id(self):
        raw = {"globalId": "GLB-001"}
        assert map_lot(raw) is None

    def test_lot_missing_number(self):
        raw = {"id": "lot-001"}
        assert map_lot(raw) is None

    def test_lot_quantity(self):
        raw = {"id": "lot-001", "globalId": "G-001", "quantity": 500.0, "unit": "bbl"}
        result = map_lot(raw)
        assert result is not None
        assert result.quantity == 500.0
        assert result.unit_of_measure == "bbl"

    def test_lot_recipe_reference(self):
        raw = {"id": "lot-001", "globalId": "G-001", "recipeId": "RCP-001"}
        result = map_lot(raw)
        assert result is not None
        assert result.recipe_id == "RCP-001"


# ---------------------------------------------------------------------------
# Physical Asset
# ---------------------------------------------------------------------------

class TestMapAsset:
    """Test map_asset() -> PhysicalAsset."""

    def test_valid_asset(self):
        raw = {"id": "asset-001", "name": "Mash Tun 01", "assetType": "EQUIPMENT"}
        result = map_asset(raw)
        assert result is not None
        assert result.source_id == "asset-001"
        assert result.name == "Mash Tun 01"
        assert result.asset_type.value == "EQUIPMENT"

    def test_asset_hierarchy(self):
        raw = {
            "id": "asset-002",
            "name": "Distillery Floor",
            "assetType": "AREA",
            "parentId": "asset-001",
            "assetPath": "Site/Distillery/Floor-1",
        }
        result = map_asset(raw)
        assert result is not None
        assert result.parent_id == "asset-001"
        assert result.location_path == "Site/Distillery/Floor-1"

    def test_asset_operational_state(self):
        raw = {"id": "a-001", "name": "Still", "operationalState": "RUNNING"}
        result = map_asset(raw)
        assert result is not None
        assert result.operational_state.value == "RUNNING"

    def test_asset_missing_id(self):
        raw = {"name": "Mash Tun"}
        assert map_asset(raw) is None

    def test_asset_missing_name(self):
        raw = {"id": "a-001"}
        assert map_asset(raw) is None

    def test_asset_default_type(self):
        raw = {"id": "a-001", "name": "Unknown Asset"}
        result = map_asset(raw)
        assert result is not None
        assert result.asset_type.value == "EQUIPMENT"

    def test_asset_faulted_state(self):
        raw = {"id": "a-001", "name": "Pump", "operationalState": "ERROR"}
        result = map_asset(raw)
        assert result is not None
        assert result.operational_state.value == "FAULTED"


# ---------------------------------------------------------------------------
# Operational Event: StepExecution
# ---------------------------------------------------------------------------

class TestMapStepEvent:
    """Test map_step_event() -> OperationalEvent."""

    def test_valid_step_event(self):
        raw = {
            "id": "step-001",
            "status": "STARTED",
            "startedAt": "2026-04-06T14:30:00Z",
            "batchId": "B-001",
        }
        result = map_step_event(raw)
        assert result is not None
        assert result.source_id == "step-001"
        assert result.event_type == "step_started"
        assert result.entity_type == "batch"
        assert result.entity_id == "B-001"

    def test_step_completed(self):
        raw = {
            "id": "step-001",
            "status": "COMPLETED",
            "completedAt": "2026-04-06T15:00:00Z",
        }
        result = map_step_event(raw)
        assert result is not None
        assert result.event_type == "step_completed"

    def test_step_with_operator(self):
        raw = {
            "id": "step-001",
            "status": "STARTED",
            "operatorId": "USR-023",
            "startedAt": "2026-04-06T14:30:00Z",
        }
        result = map_step_event(raw)
        assert result is not None
        assert result.operator_id == "USR-023"

    def test_step_missing_id(self):
        raw = {"status": "STARTED"}
        assert map_step_event(raw) is None

    def test_step_entity_type_without_batch(self):
        raw = {"id": "step-001", "status": "STARTED", "startedAt": "2026-04-06T14:30:00Z"}
        result = map_step_event(raw)
        assert result is not None
        assert result.entity_type == "step_execution"

    def test_step_metadata(self):
        raw = {
            "id": "step-001",
            "status": "PAUSED",
            "stepIndex": 3,
            "equipmentPhase": "Mashing",
            "startedAt": "2026-04-06T14:30:00Z",
        }
        result = map_step_event(raw)
        assert result is not None
        assert result.metadata["step_index"] == 3
        assert result.metadata["equipment_phase"] == "Mashing"


# ---------------------------------------------------------------------------
# Operational Event: ProductionEvent
# ---------------------------------------------------------------------------

class TestMapProductionEvent:
    """Test map_production_event() -> OperationalEvent."""

    def test_valid_production_event(self):
        raw = {
            "id": "evt-001",
            "eventType": "PhaseCompleted",
            "severity": "INFO",
            "batchId": "B-001",
            "timestamp": "2026-04-06T14:30:00Z",
        }
        result = map_production_event(raw)
        assert result is not None
        assert result.source_id == "evt-001"
        assert result.entity_id == "B-001"

    def test_event_severity_warning(self):
        raw = {
            "id": "evt-001",
            "eventType": "DeviationDetected",
            "severity": "WARNING",
            "timestamp": "2026-04-06T14:30:00Z",
        }
        result = map_production_event(raw)
        assert result is not None
        assert result.severity.value == "WARNING"

    def test_event_category_quality(self):
        raw = {
            "id": "evt-001",
            "eventType": "SampleTaken",
            "category": "QUALITY",
            "timestamp": "2026-04-06T14:30:00Z",
        }
        result = map_production_event(raw)
        assert result is not None
        assert result.category.value == "QUALITY"

    def test_event_missing_id(self):
        raw = {"eventType": "PhaseCompleted"}
        assert map_production_event(raw) is None

    def test_event_entity_type_production_order(self):
        raw = {
            "id": "evt-001",
            "eventType": "OrderStarted",
            "productionOrderId": "PRO-001",
            "timestamp": "2026-04-06T14:30:00Z",
        }
        result = map_production_event(raw)
        assert result is not None
        assert result.entity_type == "production_order"
        assert result.entity_id == "PRO-001"

    def test_event_mqtt_metadata(self):
        raw = {
            "id": "evt-001",
            "eventType": "EquipmentEvent",
            "timestamp": "2026-04-06T14:30:00Z",
            "mqttTopic": "mes/equipment/STILL-01/events",
        }
        result = map_production_event(raw)
        assert result is not None
        assert result.metadata.get("mqtt_topic") == "mes/equipment/STILL-01/events"


# ---------------------------------------------------------------------------
# Business Entity: Customer + Vendor
# ---------------------------------------------------------------------------

class TestMapCustomer:
    """Test map_customer() -> BusinessEntity."""

    def test_valid_customer(self):
        raw = {"id": "cust-001", "name": "Acme Spirits", "globalId": "GLB-C-001"}
        result = map_customer(raw)
        assert result is not None
        assert result.entity_type.value == "CUSTOMER"
        assert result.name == "Acme Spirits"
        assert result.external_ids.get("global") == "GLB-C-001"

    def test_customer_with_contact_info_dict(self):
        raw = {
            "id": "cust-001",
            "name": "Acme",
            "contactInfo": {"email": "info@acme.com", "phone": "555-0100"},
        }
        result = map_customer(raw)
        assert result is not None
        assert result.contact_info["email"] == "info@acme.com"

    def test_customer_with_contact_info_json(self):
        raw = {
            "id": "cust-001",
            "name": "Acme",
            "contactInfo": '{"email": "info@acme.com"}',
        }
        result = map_customer(raw)
        assert result is not None
        assert result.contact_info["email"] == "info@acme.com"

    def test_customer_missing_id(self):
        raw = {"name": "Acme"}
        assert map_customer(raw) is None

    def test_customer_missing_name(self):
        raw = {"id": "cust-001"}
        assert map_customer(raw) is None

    def test_customer_erp_id(self):
        raw = {"id": "cust-001", "name": "Acme", "erpId": "ERP-C-001"}
        result = map_customer(raw)
        assert result is not None
        assert result.external_ids.get("erp") == "ERP-C-001"


class TestMapVendor:
    """Test map_vendor() -> BusinessEntity."""

    def test_valid_vendor(self):
        raw = {"id": "vnd-001", "name": "Oak Supply Co", "globalId": "GLB-V-001"}
        result = map_vendor(raw)
        assert result is not None
        assert result.entity_type.value == "VENDOR"
        assert result.name == "Oak Supply Co"

    def test_vendor_missing_id(self):
        raw = {"name": "Oak Supply"}
        assert map_vendor(raw) is None

    def test_vendor_with_location(self):
        raw = {"id": "vnd-001", "name": "Grain Co", "location": "Louisville, KY"}
        result = map_vendor(raw)
        assert result is not None
        assert result.location == "Louisville, KY"


# ---------------------------------------------------------------------------
# Process Definition (Recipe)
# ---------------------------------------------------------------------------

class TestMapRecipe:
    """Test map_recipe() -> ProcessDefinition."""

    def test_valid_recipe(self):
        raw = {
            "id": "rcp-001",
            "name": "Wheated Bourbon #3",
            "version": "1.2",
            "whiskeyType": "Wheated Bourbon",
            "isPublished": True,
        }
        result = map_recipe(raw)
        assert result is not None
        assert result.source_id == "rcp-001"
        assert result.name == "Wheated Bourbon #3"
        assert result.version == "1.2"
        assert result.product_type == "Wheated Bourbon"
        assert result.is_published is True

    def test_recipe_class_definition(self):
        raw = {"id": "rcp-001", "name": "Master Recipe", "isClassDefinition": True}
        result = map_recipe(raw)
        assert result is not None
        assert result.metadata.get("is_class_definition") is True

    def test_recipe_instance(self):
        raw = {"id": "rcp-inst-001", "name": "Runtime Recipe", "isClassDefinition": False}
        result = map_recipe(raw)
        assert result is not None
        assert result.metadata.get("is_class_definition") is False

    def test_recipe_with_steps(self):
        raw = {
            "id": "rcp-001",
            "name": "Bourbon",
            "operations": [
                {"id": "op-1", "name": "Mashing", "stepIndex": 1, "duration": 120},
                {"id": "op-2", "name": "Fermentation", "stepIndex": 2, "duration": 4320},
            ],
        }
        result = map_recipe(raw)
        assert result is not None
        assert len(result.steps) == 2
        assert result.steps[0].name == "Mashing"
        assert result.steps[0].duration_minutes == 120.0
        assert result.steps[1].step_number == 2

    def test_recipe_with_parameters(self):
        raw = {
            "id": "rcp-001",
            "name": "Bourbon",
            "parameters": [
                {"name": "mash_temp", "value": 152.0},
                {"name": "ferment_days", "value": 3},
            ],
        }
        result = map_recipe(raw)
        assert result is not None
        assert result.parameters["mash_temp"] == 152.0

    def test_recipe_with_bom(self):
        raw = {
            "id": "rcp-001",
            "name": "Bourbon",
            "recipeBom": [
                {"itemId": "ITEM-CORN", "quantity": 70.0, "unit": "percent"},
                {"itemId": "ITEM-RYE", "quantity": 16.0, "unit": "percent"},
            ],
        }
        result = map_recipe(raw)
        assert result is not None
        assert len(result.bill_of_materials) == 2
        assert result.bill_of_materials[0]["item_id"] == "ITEM-CORN"

    def test_recipe_missing_id(self):
        raw = {"name": "Bourbon"}
        assert map_recipe(raw) is None

    def test_recipe_missing_name(self):
        raw = {"id": "rcp-001"}
        assert map_recipe(raw) is None

    def test_mashing_protocol_master(self):
        raw = {
            "id": "mp-001",
            "name": "Standard Mash",
            "master": True,
            "templateCategory": "mashing",
        }
        result = map_recipe(raw)
        assert result is not None
        assert result.metadata.get("is_master") is True
        assert result.metadata.get("template_category") == "mashing"

    def test_recipe_step_with_temperature(self):
        raw = {
            "id": "rcp-001",
            "name": "Bourbon",
            "operations": [
                {
                    "id": "op-1",
                    "name": "Saccharification",
                    "temperature": 152.0,
                    "holdType": "hold",
                },
            ],
        }
        result = map_recipe(raw)
        assert result is not None
        assert result.steps[0].parameters.get("temperature") == 152.0
        assert result.steps[0].step_type == "hold"


# ---------------------------------------------------------------------------
# Production Order
# ---------------------------------------------------------------------------

class TestMapProductionOrder:
    """Test map_production_order() -> ProductionOrder."""

    def test_valid_production_order(self):
        raw = {
            "id": "pro-001",
            "status": "IN_PROGRESS",
            "recipeId": "rcp-001",
            "customerId": "cust-001",
            "expectedQuantity": 5000.0,
        }
        result = map_production_order(raw)
        assert result is not None
        assert result.source_id == "pro-001"
        assert result.status.value == "IN_PROGRESS"
        assert result.recipe_id == "rcp-001"
        assert result.planned_quantity == 5000.0

    def test_order_number_from_item_number(self):
        raw = {"id": "pro-001", "itemNumber": "WB-2026-0042"}
        result = map_production_order(raw)
        assert result is not None
        assert result.order_number == "WB-2026-0042"

    def test_order_number_fallback_to_id(self):
        raw = {"id": "pro-001"}
        result = map_production_order(raw)
        assert result is not None
        assert result.order_number == "pro-001"

    def test_order_dates(self):
        raw = {
            "id": "pro-001",
            "expectedStartDate": "2026-04-06T06:00:00Z",
            "expectedEndDate": "2026-04-07T18:00:00Z",
            "startedAt": "2026-04-06T06:15:00Z",
        }
        result = map_production_order(raw)
        assert result is not None
        assert result.planned_start is not None
        assert result.planned_end is not None
        assert result.actual_start is not None

    def test_order_lot_ids(self):
        raw = {"id": "pro-001", "lotId": "LOT-001"}
        result = map_production_order(raw)
        assert result is not None
        assert "LOT-001" in result.lot_ids

    def test_order_missing_id(self):
        raw = {"status": "DRAFT"}
        assert map_production_order(raw) is None

    def test_order_status_completed(self):
        raw = {"id": "pro-001", "status": "COMPLETED"}
        result = map_production_order(raw)
        assert result is not None
        assert result.status.value == "COMPLETE"

    def test_order_status_cancelled(self):
        raw = {"id": "pro-001", "status": "CANCELLED"}
        result = map_production_order(raw)
        assert result is not None
        assert result.status.value == "CANCELLED"


# ---------------------------------------------------------------------------
# Schedule Order (WorkOrder)
# ---------------------------------------------------------------------------

class TestMapScheduleOrder:
    """Test map_schedule_order() -> WorkOrder."""

    def test_valid_schedule_order(self):
        raw = {
            "id": "so-001",
            "status": "SCHEDULED",
            "priority": "HIGH",
            "productionOrderId": "pro-001",
        }
        result = map_schedule_order(raw)
        assert result is not None
        assert result.source_id == "so-001"
        assert result.order_type == "SCHEDULE"
        assert result.status.value == "SCHEDULED"
        assert result.priority.value == "HIGH"
        assert result.production_order_id == "pro-001"

    def test_schedule_order_dates(self):
        raw = {
            "id": "so-001",
            "expectedStartDate": "2026-04-06T06:00:00Z",
            "expectedEndDate": "2026-04-07T18:00:00Z",
        }
        result = map_schedule_order(raw)
        assert result is not None
        assert result.planned_start is not None
        assert result.planned_end is not None

    def test_schedule_order_missing_id(self):
        raw = {"status": "QUEUED"}
        assert map_schedule_order(raw) is None

    def test_schedule_order_default_title(self):
        raw = {"id": "so-001"}
        result = map_schedule_order(raw)
        assert result is not None
        assert "so-001" in result.title

    def test_schedule_order_metadata(self):
        raw = {
            "id": "so-001",
            "queueName": "MainQueue",
            "queueIndex": 5,
            "recipeId": "rcp-001",
        }
        result = map_schedule_order(raw)
        assert result is not None
        assert result.metadata["queue_name"] == "MainQueue"
        assert result.metadata["queue_index"] == 5


# ---------------------------------------------------------------------------
# Material Item
# ---------------------------------------------------------------------------

class TestMapItem:
    """Test map_item() -> MaterialItem."""

    def test_valid_item(self):
        raw = {"id": "item-001", "name": "Corn (Yellow #2)", "erpId": "ERP-CORN-001"}
        result = map_item(raw)
        assert result is not None
        assert result.source_id == "item-001"
        assert result.name == "Corn (Yellow #2)"
        assert result.item_number == "ERP-CORN-001"
        assert result.external_ids.get("erp") == "ERP-CORN-001"

    def test_item_with_global_id(self):
        raw = {"id": "item-001", "name": "Malt", "globalId": "GLB-MALT"}
        result = map_item(raw)
        assert result is not None
        assert result.external_ids.get("global") == "GLB-MALT"

    def test_item_number_fallback(self):
        raw = {"id": "item-001", "name": "Yeast"}
        result = map_item(raw)
        assert result is not None
        assert result.item_number == "item-001"

    def test_item_vendor_reference(self):
        raw = {"id": "item-001", "name": "Barley", "vendorId": "vnd-001"}
        result = map_item(raw)
        assert result is not None
        assert result.vendor_id == "vnd-001"

    def test_item_category(self):
        raw = {"id": "item-001", "name": "Corn", "category": "raw_material"}
        result = map_item(raw)
        assert result is not None
        assert result.category == "raw_material"

    def test_item_missing_id(self):
        raw = {"name": "Corn"}
        assert map_item(raw) is None

    def test_item_missing_name(self):
        raw = {"id": "item-001"}
        assert map_item(raw) is None

    def test_item_inactive(self):
        raw = {"id": "item-001", "name": "Deprecated Grain", "isActive": False}
        result = map_item(raw)
        assert result is not None
        assert result.is_active is False
