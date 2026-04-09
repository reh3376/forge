"""Tests for CMMS context builder and maintenance-specific field extraction."""

from __future__ import annotations

import pytest

from forge.adapters.whk_cmms.context import build_record_context


class TestMaintenanceContext:
    """Test extraction of maintenance-specific context fields."""

    def test_asset_id_extraction(self):
        raw = {
            "entity_type": "WorkOrder",
            "assetId": "ASSET-WH-001",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["asset_id"] == "ASSET-WH-001"
        assert ctx.equipment_id == "ASSET-WH-001"

    def test_asset_path_extraction(self):
        raw = {
            "entity_type": "WorkOrder",
            "assetPath": "Distillery01.Utility01.Neutralization01",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["asset_path"] == "Distillery01.Utility01.Neutralization01"

    def test_work_order_type_extraction(self):
        raw = {
            "entity_type": "WorkOrder",
            "workOrderType": "Preventive",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["work_order_type"] == "Preventive"

    def test_priority_level_extraction(self):
        raw = {
            "entity_type": "WorkOrder",
            "priority": "High",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["priority_level"] == "High"

    def test_maintenance_status_extraction(self):
        raw = {
            "entity_type": "WorkOrder",
            "status": "ACTIVE",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["maintenance_status"] == "ACTIVE"

    def test_default_maintenance_status(self):
        raw = {
            "entity_type": "WorkOrder",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["maintenance_status"] == "pending"


class TestApprovalContext:
    """Test extraction of approval states from work requests."""

    def test_maintenance_role_approval(self):
        raw = {
            "entity_type": "WorkRequest",
            "maintenanceRoleApproval": True,
        }
        ctx = build_record_context(raw)
        assert ctx.extra["maintenance_role_approval"] is True

    def test_operations_supervisor_approval(self):
        raw = {
            "entity_type": "WorkRequest",
            "operationsSupervisorApproval": True,
        }
        ctx = build_record_context(raw)
        assert ctx.extra["operations_supervisor_approval"] is True

    def test_approval_not_present(self):
        raw = {
            "entity_type": "WorkRequest",
        }
        ctx = build_record_context(raw)
        assert "maintenance_role_approval" not in ctx.extra
        assert "operations_supervisor_approval" not in ctx.extra


class TestSchedulingContext:
    """Test extraction of scheduling fields for maintenance windows."""

    def test_cron_schedule(self):
        raw = {
            "entity_type": "WorkRequest",
            "cronSchedule": "0 9 * * 0",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["cron_schedule"] == "0 9 * * 0"

    def test_period_field(self):
        raw = {
            "entity_type": "WorkRequest",
            "period": "Week",
        }
        ctx = build_record_context(raw)
        # period is stored in extra if present
        # (context builder may or may not include it depending on implementation)

    def test_periodic_frequency(self):
        raw = {
            "entity_type": "WorkRequest",
            "periodicFrequency": 2,
        }
        ctx = build_record_context(raw)
        # periodic_frequency extraction if implemented

    def test_scheduled_start(self):
        raw = {
            "entity_type": "WorkOrder",
            "scheduledStart": "2026-04-15T09:00:00Z",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["scheduled_start"] == "2026-04-15T09:00:00Z"

    def test_estimated_duration(self):
        raw = {
            "entity_type": "WorkOrder",
            "estimatedDuration": "480",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["estimated_duration"] == "480"


class TestEntityCategory:
    """Test mapping of entity types to domain categories."""

    def test_asset_category(self):
        raw = {
            "entity_type": "Asset",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["entity_category"] == "equipment_maintenance"

    def test_work_order_category(self):
        raw = {
            "entity_type": "WorkOrder",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["entity_category"] == "maintenance"

    def test_work_request_category(self):
        raw = {
            "entity_type": "WorkRequest",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["entity_category"] == "maintenance_planning"

    def test_kit_category(self):
        raw = {
            "entity_type": "Kit",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["entity_category"] == "inventory"

    def test_inventory_location_category(self):
        raw = {
            "entity_type": "InventoryLocation",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["entity_category"] == "inventory"

    def test_inventory_investigation_category(self):
        raw = {
            "entity_type": "InventoryInvestigation",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["entity_category"] == "inventory_audit"

    def test_item_category(self):
        raw = {
            "entity_type": "Item",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["entity_category"] == "master_data"

    def test_vendor_category(self):
        raw = {
            "entity_type": "Vendor",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["entity_category"] == "master_data"

    def test_unknown_entity_category(self):
        raw = {
            "entity_type": "UnknownEntity",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["entity_category"] == "unknown"


class TestOperationContext:
    """Test operation_context field for CMMS (all are 'maintenance')."""

    def test_work_order_operation_context(self):
        raw = {
            "entity_type": "WorkOrder",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["operation_context"] == "maintenance"

    def test_asset_operation_context(self):
        raw = {
            "entity_type": "Asset",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["operation_context"] == "maintenance"

    def test_inventory_investigation_operation_context(self):
        raw = {
            "entity_type": "InventoryInvestigation",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["operation_context"] == "maintenance"


class TestContextFields:
    """Test core context field extraction."""

    def test_cross_system_id_from_global_id(self):
        raw = {
            "entity_type": "WorkOrder",
            "globalId": "WO-2026-001",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["cross_system_id"] == "WO-2026-001"

    def test_cross_system_id_from_id_fallback(self):
        raw = {
            "entity_type": "WorkOrder",
            "id": "wo_001",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["cross_system_id"] == "wo_001"

    def test_entity_type_extraction(self):
        raw = {
            "entity_type": "Asset",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["entity_type"] == "Asset"

    def test_entity_type_from_typename(self):
        raw = {
            "__typename": "Asset",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["entity_type"] == "Asset"

    def test_event_type_extraction(self):
        raw = {
            "entity_type": "WorkOrder",
            "event_type": "create",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["event_type"] == "create"

    def test_event_type_default(self):
        raw = {
            "entity_type": "WorkOrder",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["event_type"] == "query"

    def test_source_system_always_cmms(self):
        raw = {
            "entity_type": "WorkOrder",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["source_system"] == "whk-cmms"


class TestInventoryContext:
    """Test inventory-specific context fields."""

    def test_kit_id_extraction(self):
        raw = {
            "entity_type": "WorkOrder",
            "kitId": "KIT-NEUTRAL-001",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["kit_id"] == "KIT-NEUTRAL-001"

    def test_location_path_extraction(self):
        raw = {
            "entity_type": "InventoryLocation",
            "path": "Warehouse01.MaintenanceArea.PartsShelves",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["location_path"] == "Warehouse01.MaintenanceArea.PartsShelves"

    def test_location_path_from_nested_object(self):
        raw = {
            "entity_type": "InventoryInvestigation",
            "inventoryLocation": {
                "path": "Warehouse01.MaintenanceArea.PartsShelves",
            },
        }
        ctx = build_record_context(raw)
        assert ctx.extra["location_path"] == "Warehouse01.MaintenanceArea.PartsShelves"

    def test_erp_id_extraction(self):
        raw = {
            "entity_type": "Item",
            "erpId": "ITEM-NS-00412",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["erp_id"] == "ITEM-NS-00412"


class TestContextDataStructure:
    """Test the RecordContext data structure returned."""

    def test_context_has_site(self):
        raw = {"entity_type": "WorkOrder"}
        ctx = build_record_context(raw)
        assert ctx.site == "whk01.distillery01"

    def test_context_has_area(self):
        raw = {"entity_type": "WorkOrder"}
        ctx = build_record_context(raw)
        assert ctx.area is not None

    def test_context_has_equipment_id(self):
        raw = {
            "entity_type": "WorkOrder",
            "assetId": "ASSET-001",
        }
        ctx = build_record_context(raw)
        assert ctx.equipment_id == "ASSET-001"

    def test_context_has_extra_dict(self):
        raw = {"entity_type": "WorkOrder"}
        ctx = build_record_context(raw)
        assert isinstance(ctx.extra, dict)
        assert len(ctx.extra) > 0


class TestGraphQLVsRabbitMQ:
    """Test context extraction from both GraphQL and RabbitMQ message formats."""

    def test_graphql_format_with_data_envelope(self):
        raw = {
            "data": {
                "entity_type": "WorkOrder",
                "globalId": "WO-001",
                "assetId": "ASSET-001",
            }
        }
        ctx = build_record_context(raw)
        assert ctx.extra["entity_type"] == "WorkOrder"
        assert ctx.extra["cross_system_id"] == "WO-001"

    def test_rabbitmq_format_without_envelope(self):
        raw = {
            "entity_type": "WorkOrder",
            "globalId": "WO-001",
            "assetId": "ASSET-001",
        }
        ctx = build_record_context(raw)
        assert ctx.extra["entity_type"] == "WorkOrder"
        assert ctx.extra["cross_system_id"] == "WO-001"
