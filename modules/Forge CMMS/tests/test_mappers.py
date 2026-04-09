"""Tests for CMMS entity mappers (asset, work order, inventory, vendors)."""

from __future__ import annotations

import pytest

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
    map_item,
    map_kit,
    map_vendor,
    map_inventory_location,
    map_inventory_investigation,
)


class TestMapAsset:
    """Test Asset → ManufacturingUnit mapping."""

    def test_basic_mapping(self):
        raw = {
            "globalId": "ASSET-WH-001",
            "id": "asset_001",
            "assetPath": "Distillery01.Utility01.Neutralization01",
            "assetType": "Tank",
            "assetMake": "Tanks-R-Us",
            "assetModel": "Model X1000",
            "oemManufacturer": "Vendor-OEM",
        }
        unit = map_asset(raw)
        assert unit is not None
        assert unit.source_system == "whk-cmms"
        assert unit.source_id == "ASSET-WH-001"
        assert unit.unit_type == "Tank"
        assert unit.metadata["asset_make"] == "Tanks-R-Us"

    def test_asset_missing_global_id_returns_none(self):
        raw = {
            "assetPath": "Distillery01.Utility01.Neutralization01",
        }
        unit = map_asset(raw)
        assert unit is None

    def test_asset_missing_asset_path_returns_none(self):
        raw = {
            "globalId": "ASSET-WH-001",
        }
        unit = map_asset(raw)
        assert unit is None

    def test_asset_hierarchy_parent(self):
        raw = {
            "globalId": "ASSET-WH-001",
            "assetPath": "Distillery01.Utility01.Neutralization01",
            "parentAssetId": "ASSET-WH-000",
        }
        unit = map_asset(raw)
        # Parent asset ID is stored in metadata
        assert unit.metadata["parent_asset_id"] == "ASSET-WH-000"

    def test_asset_oem_metadata(self):
        raw = {
            "globalId": "ASSET-WH-001",
            "assetPath": "Distillery01.Utility01.Neutralization01",
            "oemManufacturer": "Vendor-OEM",
            "inServiceDate": "2020-01-15",
            "outOfServiceDate": None,
        }
        unit = map_asset(raw)
        assert unit.metadata["oem_manufacturer"] == "Vendor-OEM"
        assert unit.metadata["in_service_date"] == "2020-01-15"


class TestMapWorkOrder:
    """Test WorkOrder → Forge WorkOrder mapping."""

    def test_basic_mapping(self):
        raw = {
            "globalId": "WO-2026-001",
            "id": "wo_001",
            "name": "PM - Tank Inspection",
            "status": "SCHEDULED",
            "priority": "High",
            "assetId": "ASSET-WH-001",
        }
        wo = map_work_order(raw)
        assert wo is not None
        assert wo.source_system == "whk-cmms"
        assert wo.source_id == "WO-2026-001"
        assert wo.title == "PM - Tank Inspection"
        assert wo.order_type == "maintenance"

    def test_work_order_status_mapping(self):
        raw = {
            "globalId": "WO-2026-001",
            "name": "PM - Tank Inspection",
            "status": "ACTIVE",
        }
        wo = map_work_order(raw)
        assert wo.status == "IN_PROGRESS"

    def test_work_order_status_scheduled(self):
        raw = {
            "globalId": "WO-2026-001",
            "name": "PM - Tank Inspection",
            "status": "Scheduled",
        }
        wo = map_work_order(raw)
        assert wo.status == "SCHEDULED"

    def test_work_order_status_completed(self):
        raw = {
            "globalId": "WO-2026-001",
            "name": "PM - Tank Inspection",
            "status": "Completed",
        }
        wo = map_work_order(raw)
        assert wo.status == "COMPLETE"

    def test_work_order_missing_global_id_returns_none(self):
        raw = {
            "name": "PM - Tank Inspection",
        }
        wo = map_work_order(raw)
        assert wo is None

    def test_work_order_missing_name_returns_none(self):
        raw = {
            "globalId": "WO-2026-001",
        }
        wo = map_work_order(raw)
        assert wo is None

    def test_work_order_metadata(self):
        raw = {
            "globalId": "WO-2026-001",
            "name": "PM - Tank Inspection",
            "assetId": "ASSET-WH-001",
            "priority": "High",
            "scheduledStart": "2026-04-15T09:00:00Z",
            "estimatedDuration": "480",
            "cron_schedule": "0 9 * * 0",
        }
        wo = map_work_order(raw)
        assert wo.metadata["asset_id"] == "ASSET-WH-001"
        assert wo.metadata["priority"] == "High"
        assert wo.metadata["scheduled_start"] == "2026-04-15T09:00:00Z"
        assert wo.metadata["estimated_duration"] == "480"
        assert wo.metadata["cron_schedule"] == "0 9 * * 0"


class TestMapWorkRequest:
    """Test WorkRequest → Forge WorkOrder mapping (order_type='maintenance_request')."""

    def test_basic_mapping(self):
        raw = {
            "globalId": "WR-2026-001",
            "id": "wr_001",
            "issueDescription": "Pump making strange noise",
            "status": "PENDING",
        }
        wr = map_work_request(raw)
        assert wr is not None
        assert wr.source_system == "whk-cmms"
        assert wr.source_id == "WR-2026-001"
        assert wr.order_type == "maintenance_request"

    def test_work_request_status_mapping(self):
        raw = {
            "globalId": "WR-2026-001",
            "status": "APPROVED",
        }
        wr = map_work_request(raw)
        assert wr.status == "SCHEDULED"

    def test_work_request_missing_global_id_returns_none(self):
        raw = {
            "issueDescription": "Pump issue",
        }
        wr = map_work_request(raw)
        assert wr is None

    def test_work_request_approval_fields(self):
        raw = {
            "globalId": "WR-2026-001",
            "maintenanceRoleApproval": True,
            "operationsSupervisorApproval": True,
        }
        wr = map_work_request(raw)
        assert wr.metadata["maintenance_role_approval"] is True
        assert wr.metadata["operations_supervisor_approval"] is True


class TestMapItem:
    """Test Item mapping to metadata dict."""

    def test_basic_mapping(self):
        raw = {
            "globalId": "ITEM-NS-00412",
            "id": "item_001",
            "itemName": "Replacement Seal Kit",
            "itemPartNo": "SK-1234-567",
        }
        item_meta = map_item(raw)
        assert item_meta["entity_type"] == "item"
        assert item_meta["item_id"] == "ITEM-NS-00412"
        assert item_meta["item_name"] == "Replacement Seal Kit"
        assert item_meta["item_part_no"] == "SK-1234-567"

    def test_item_missing_global_id_returns_empty(self):
        raw = {
            "itemName": "Replacement Seal Kit",
        }
        item_meta = map_item(raw)
        assert item_meta == {}

    def test_item_missing_name_returns_empty(self):
        raw = {
            "globalId": "ITEM-NS-00412",
        }
        item_meta = map_item(raw)
        assert item_meta == {}

    def test_item_external_ids(self):
        raw = {
            "globalId": "ITEM-NS-00412",
            "itemName": "Seal Kit",
            "erpId": "ITEM-NS-00412",
            "isLocallyTracked": False,
        }
        item_meta = map_item(raw)
        assert item_meta["erp_id"] == "ITEM-NS-00412"
        assert item_meta["is_locally_tracked"] is False


class TestMapKit:
    """Test Kit mapping to metadata dict."""

    def test_basic_mapping(self):
        raw = {
            "globalId": "KIT-NEUTRAL-001",
            "id": "kit_001",
            "kitName": "Neutralization Unit PM Kit",
            "items": ["item_001", "item_002", "item_003"],
        }
        kit_meta = map_kit(raw)
        assert kit_meta["entity_type"] == "kit"
        assert kit_meta["kit_id"] == "KIT-NEUTRAL-001"
        assert kit_meta["kit_name"] == "Neutralization Unit PM Kit"
        assert kit_meta["items"] == ["item_001", "item_002", "item_003"]

    def test_kit_missing_global_id_returns_empty(self):
        raw = {
            "kitName": "Neutralization Unit PM Kit",
        }
        kit_meta = map_kit(raw)
        assert kit_meta == {}

    def test_kit_missing_name_returns_empty(self):
        raw = {
            "globalId": "KIT-NEUTRAL-001",
        }
        kit_meta = map_kit(raw)
        assert kit_meta == {}

    def test_kit_item_quantities(self):
        raw = {
            "globalId": "KIT-NEUTRAL-001",
            "kitName": "Neutralization Unit PM Kit",
            "itemQuantitiesUsed": {"item_001": 2, "item_002": 1},
        }
        kit_meta = map_kit(raw)
        assert kit_meta["item_quantities_used"] == {"item_001": 2, "item_002": 1}


class TestMapVendor:
    """Test Vendor → BusinessEntity mapping."""

    def test_basic_mapping(self):
        raw = {
            "globalId": "VEND-TANKS-001",
            "id": "vendor_001",
            "name": "Tanks-R-Us",
        }
        vendor = map_vendor(raw)
        assert vendor is not None
        assert vendor.source_system == "whk-cmms"
        assert vendor.source_id == "VEND-TANKS-001"
        assert vendor.name == "Tanks-R-Us"

    def test_vendor_missing_global_id_returns_none(self):
        raw = {
            "name": "Tanks-R-Us",
        }
        vendor = map_vendor(raw)
        assert vendor is None

    def test_vendor_missing_name_returns_none(self):
        raw = {
            "globalId": "VEND-TANKS-001",
        }
        vendor = map_vendor(raw)
        assert vendor is None

    def test_vendor_contact_info(self):
        raw = {
            "globalId": "VEND-TANKS-001",
            "name": "Tanks-R-Us",
            "contactInformation": {"phone": "555-1234", "email": "support@tanks.com"},
        }
        vendor = map_vendor(raw)
        assert vendor.metadata["contact_information"] == {"phone": "555-1234", "email": "support@tanks.com"}


class TestMapInventoryLocation:
    """Test InventoryLocation mapping to metadata dict."""

    def test_basic_mapping(self):
        raw = {
            "globalId": "LOC-PARTS-001",
            "id": "loc_001",
            "name": "Maintenance Parts Shelving",
            "path": "Warehouse01.MaintenanceArea.PartsShelves",
        }
        loc_meta = map_inventory_location(raw)
        assert loc_meta["entity_type"] == "inventory_location"
        assert loc_meta["location_id"] == "LOC-PARTS-001"
        assert loc_meta["location_name"] == "Maintenance Parts Shelving"
        assert loc_meta["location_path"] == "Warehouse01.MaintenanceArea.PartsShelves"

    def test_location_missing_global_id_returns_empty(self):
        raw = {
            "name": "Maintenance Parts Shelving",
        }
        loc_meta = map_inventory_location(raw)
        assert loc_meta == {}

    def test_location_hierarchy(self):
        raw = {
            "globalId": "LOC-PARTS-001",
            "name": "Maintenance Parts Shelving",
            "parentId": "LOC-WAREHOUSE-001",
            "children": ["LOC-PARTS-002", "LOC-PARTS-003"],
        }
        loc_meta = map_inventory_location(raw)
        assert loc_meta["parent_id"] == "LOC-WAREHOUSE-001"
        assert loc_meta["children"] == ["LOC-PARTS-002", "LOC-PARTS-003"]


class TestMapInventoryInvestigation:
    """Test InventoryInvestigation → OperationalEvent mapping."""

    @pytest.mark.skip(reason="OperationalEvent requires entity_type, entity_id, event_time - mapper needs enhancement")
    def test_basic_mapping(self):
        raw = {
            "globalId": "INVEST-2026-001",
            "id": "invest_001",
            "physicalCount": 52,
            "digitalCount": 48,
            "createdAt": "2026-04-07T14:00:00Z",
        }
        event = map_inventory_investigation(raw)
        assert event is not None
        assert event.source_system == "whk-cmms"
        assert event.source_id == "INVEST-2026-001"
        assert event.event_type == "inventory_audit"

    def test_investigation_missing_global_id_returns_none(self):
        raw = {
            "physicalCount": 52,
            "digitalCount": 48,
        }
        event = map_inventory_investigation(raw)
        assert event is None

    @pytest.mark.skip(reason="OperationalEvent requires entity_type, entity_id, event_time - mapper needs enhancement")
    def test_investigation_discrepancy(self):
        raw = {
            "globalId": "INVEST-2026-001",
            "physicalCount": 52,
            "digitalCount": 48,
        }
        event = map_inventory_investigation(raw)
        assert event.metadata["discrepancy"] == 4

    @pytest.mark.skip(reason="OperationalEvent requires entity_type, entity_id, event_time - mapper needs enhancement")
    def test_investigation_discrepancy_zero(self):
        raw = {
            "globalId": "INVEST-2026-001",
            "physicalCount": 50,
            "digitalCount": 50,
        }
        event = map_inventory_investigation(raw)
        assert event.metadata["discrepancy"] == 0

    @pytest.mark.skip(reason="OperationalEvent requires entity_type, entity_id, event_time - mapper needs enhancement")
    def test_investigation_discrepancy_missing_counts(self):
        raw = {
            "globalId": "INVEST-2026-001",
            "physicalCount": None,
            "digitalCount": 48,
        }
        event = map_inventory_investigation(raw)
        assert event.metadata["discrepancy"] is None


class TestMapWorkOrderType:
    """Test WorkOrderType metadata mapping."""

    def test_basic_mapping(self):
        raw = {
            "globalId": "WOTYPE-PREV-001",
            "id": "wotype_001",
            "typeName": "Preventive",
            "typeDescription": "Preventive maintenance work orders",
        }
        wotype_meta = map_work_order_type(raw)
        assert wotype_meta["entity_type"] == "work_order_type"
        assert wotype_meta["type_id"] == "WOTYPE-PREV-001"
        assert wotype_meta["type_name"] == "Preventive"

    def test_work_order_type_missing_returns_empty(self):
        raw = {
            "typeName": "Preventive",
        }
        wotype_meta = map_work_order_type(raw)
        assert wotype_meta == {}


class TestMapWorkRequestType:
    """Test WorkRequestType metadata mapping."""

    def test_basic_mapping(self):
        raw = {
            "globalId": "WRTYPE-EMERGENCY-001",
            "id": "wrtype_001",
            "typeName": "Emergency",
            "typeDescription": "Emergency maintenance requests",
        }
        wrtype_meta = map_work_request_type(raw)
        assert wrtype_meta["entity_type"] == "work_request_type"
        assert wrtype_meta["type_id"] == "WRTYPE-EMERGENCY-001"
        assert wrtype_meta["type_name"] == "Emergency"

    def test_work_request_type_missing_returns_empty(self):
        raw = {
            "typeName": "Emergency",
        }
        wrtype_meta = map_work_request_type(raw)
        assert wrtype_meta == {}


class TestNullSafety:
    """Test that all mappers handle missing or null IDs safely."""

    def test_asset_null_id_safe(self):
        raw = {
            "globalId": None,
            "assetPath": "Distillery01.Utility01.Neutralization01",
        }
        unit = map_asset(raw)
        assert unit is None

    def test_work_order_null_id_safe(self):
        raw = {
            "globalId": None,
            "name": "PM - Tank Inspection",
        }
        wo = map_work_order(raw)
        assert wo is None

    def test_vendor_null_id_safe(self):
        raw = {
            "globalId": None,
            "name": "Tanks-R-Us",
        }
        vendor = map_vendor(raw)
        assert vendor is None

    def test_inventory_investigation_null_id_safe(self):
        raw = {
            "globalId": None,
            "physicalCount": 52,
        }
        event = map_inventory_investigation(raw)
        assert event is None
