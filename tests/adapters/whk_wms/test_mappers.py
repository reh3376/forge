"""Tests for all WMS entity mappers."""


from forge.adapters.whk_wms.mappers.business_entity import map_customer, map_vendor
from forge.adapters.whk_wms.mappers.lot import map_lot
from forge.adapters.whk_wms.mappers.manufacturing_unit import map_barrel
from forge.adapters.whk_wms.mappers.operational_event import map_barrel_event
from forge.adapters.whk_wms.mappers.physical_asset import (
    map_storage_location,
    map_warehouse,
)
from forge.adapters.whk_wms.mappers.production_order import map_production_order
from forge.adapters.whk_wms.mappers.work_order import map_warehouse_job
from forge.core.models.manufacturing.enums import (
    AssetType,
    EntityType,
    EventCategory,
    LifecycleState,
    OrderStatus,
    UnitStatus,
    WorkOrderPriority,
    WorkOrderStatus,
)

# ── map_barrel ─────────────────────────────────────────────────────


class TestMapBarrel:
    """Test WMS Barrel → ManufacturingUnit mapping."""

    def _raw(self, **overrides):
        base = {
            "id": "BRL-001",
            "serialNumber": "SN-001",
            "lotId": "LOT-001",
            "storageLocationId": "SL-001",
            "ownerId": "CUST-042",
            "disposition": "IN_STORAGE",
            "proofGallons": 53.2,
            "whiskeyType": "Bourbon",
        }
        base.update(overrides)
        return base

    def test_maps_basic_fields(self):
        barrel = map_barrel(self._raw())
        assert barrel is not None
        assert barrel.source_system == "whk-wms"
        assert barrel.source_id == "BRL-001"
        assert barrel.unit_type == "barrel"
        assert barrel.serial_number == "SN-001"

    def test_maps_lot_and_location(self):
        barrel = map_barrel(self._raw())
        assert barrel.lot_id == "LOT-001"
        assert barrel.location_id == "SL-001"
        assert barrel.owner_id == "CUST-042"

    def test_maps_disposition_to_status(self):
        barrel = map_barrel(self._raw(disposition="IN_STORAGE"))
        assert barrel.status == UnitStatus.ACTIVE
        assert barrel.lifecycle_state == LifecycleState.IN_STORAGE

    def test_maps_held_disposition(self):
        barrel = map_barrel(self._raw(disposition="ON_HOLD"))
        assert barrel.status == UnitStatus.HELD

    def test_maps_quantity(self):
        barrel = map_barrel(self._raw())
        assert barrel.quantity == 53.2
        assert barrel.unit_of_measure == "proof_gallons"

    def test_maps_metadata(self):
        barrel = map_barrel(self._raw(barrelTypeId="NEW_CHARRED_OAK", fillDate="2024-01-15"))
        assert barrel.metadata.get("barrel_type") == "NEW_CHARRED_OAK"
        assert barrel.metadata.get("fill_date") == "2024-01-15"

    def test_missing_id_returns_none(self):
        raw = {"serialNumber": "SN-001"}
        assert map_barrel(raw) is None

    def test_snake_case_keys(self):
        raw = {"id": "B1", "serial_number": "SN", "lot_id": "L1", "proof_gallons": 50.0}
        barrel = map_barrel(raw)
        assert barrel is not None
        assert barrel.serial_number == "SN"


# ── map_lot ────────────────────────────────────────────────────────


class TestMapLot:
    """Test WMS Lot → Lot mapping."""

    def _raw(self, **overrides):
        base = {"id": "LOT-001", "lotNumber": "LOT-2024-WB-0087", "status": "ACTIVE"}
        base.update(overrides)
        return base

    def test_maps_basic_fields(self):
        lot = map_lot(self._raw())
        assert lot is not None
        assert lot.source_id == "LOT-001"
        assert lot.lot_number == "LOT-2024-WB-0087"
        assert lot.status == "ACTIVE"

    def test_maps_quantity(self):
        lot = map_lot(self._raw(totalPGs=500.0))
        assert lot.quantity == 500.0
        assert lot.unit_of_measure == "proof_gallons"

    def test_maps_unit_count(self):
        lot = map_lot(self._raw(bblTotal=50))
        assert lot.unit_count == 50

    def test_missing_id_returns_none(self):
        assert map_lot({"lotNumber": "LOT-001"}) is None

    def test_missing_lot_number_returns_none(self):
        assert map_lot({"id": "LOT-001"}) is None


# ── map_storage_location ──────────────────────────────────────────


class TestMapStorageLocation:
    """Test WMS StorageLocation → PhysicalAsset mapping."""

    def _raw(self, **overrides):
        base = {
            "id": "SL-001",
            "warehouseName": "Warehouse 01",
            "floor": 2,
            "rick": 15,
            "position": 4,
            "warehouseId": "WH-001",
        }
        base.update(overrides)
        return base

    def test_maps_basic_fields(self):
        asset = map_storage_location(self._raw())
        assert asset is not None
        assert asset.source_id == "SL-001"
        assert asset.asset_type == AssetType.STORAGE_POSITION

    def test_builds_location_path(self):
        asset = map_storage_location(self._raw())
        assert asset.location_path == "Warehouse 01/F2/R15/P4"

    def test_sets_parent_id(self):
        asset = map_storage_location(self._raw())
        assert asset.parent_id == "WH-001"

    def test_missing_id_returns_none(self):
        raw = {"floor": 2, "rick": 15}
        assert map_storage_location(raw) is None


# ── map_warehouse ─────────────────────────────────────────────────


class TestMapWarehouse:
    """Test WMS Warehouse → PhysicalAsset mapping."""

    def test_maps_basic_fields(self):
        raw = {"id": "WH-001", "name": "Warehouse 01", "isActive": True}
        asset = map_warehouse(raw)
        assert asset is not None
        assert asset.source_id == "WH-001"
        assert asset.asset_type == AssetType.SITE
        assert asset.name == "Warehouse 01"

    def test_inactive_warehouse(self):
        raw = {"id": "WH-002", "name": "Old Warehouse", "isActive": False}
        asset = map_warehouse(raw)
        assert asset.operational_state.value == "OFFLINE"

    def test_missing_id_returns_none(self):
        assert map_warehouse({"name": "Test"}) is None


# ── map_barrel_event ──────────────────────────────────────────────


class TestMapBarrelEvent:
    """Test WMS BarrelEvent → OperationalEvent mapping."""

    def _raw(self, **overrides):
        base = {
            "id": "EVT-001",
            "barrelId": "BRL-001",
            "eventType": "Fill",
            "eventTime": "2026-04-06T14:30:00+00:00",
            "createdById": "USR-017",
        }
        base.update(overrides)
        return base

    def test_maps_basic_fields(self):
        event = map_barrel_event(self._raw())
        assert event is not None
        assert event.source_id == "EVT-001"
        assert event.event_type == "Fill"
        assert event.entity_type == "manufacturing_unit"
        assert event.entity_id == "BRL-001"

    def test_maps_category(self):
        event = map_barrel_event(self._raw(eventType="fill"))
        assert event.category == EventCategory.PRODUCTION

    def test_maps_logistics_category(self):
        event = map_barrel_event(self._raw(eventType="transfer"))
        assert event.category == EventCategory.LOGISTICS

    def test_maps_quality_category(self):
        event = map_barrel_event(self._raw(eventType="gauge"))
        assert event.category == EventCategory.QUALITY

    def test_maps_operator(self):
        event = map_barrel_event(self._raw())
        assert event.operator_id == "USR-017"

    def test_maps_event_time(self):
        event = map_barrel_event(self._raw())
        assert event.event_time.year == 2026

    def test_missing_barrel_id_returns_none(self):
        raw = {"id": "EVT-001", "eventType": "Fill"}
        assert map_barrel_event(raw) is None

    def test_missing_id_returns_none(self):
        raw = {"barrelId": "BRL-001", "eventType": "Fill"}
        assert map_barrel_event(raw) is None


# ── map_customer ──────────────────────────────────────────────────


class TestMapCustomer:
    """Test WMS Customer → BusinessEntity mapping."""

    def test_maps_basic_fields(self):
        raw = {"id": "C1", "data": {"name": "Test Corp"}, "globalId": "G-001"}
        cust = map_customer(raw)
        assert cust is not None
        assert cust.entity_type == EntityType.CUSTOMER
        assert cust.name == "Test Corp"
        assert cust.external_ids.get("global") == "G-001"

    def test_extracts_contact_info(self):
        raw = {"id": "C1", "data": {"name": "Corp", "email": "test@corp.com", "phone": "555-1234"}}
        cust = map_customer(raw)
        assert cust.contact_info.get("email") == "test@corp.com"

    def test_parent_customer(self):
        raw = {"id": "C2", "data": {"name": "Sub Corp"}, "parentCustomerId": "C1"}
        cust = map_customer(raw)
        assert cust.parent_id == "C1"

    def test_missing_id_returns_none(self):
        assert map_customer({"data": {"name": "No ID"}}) is None

    def test_json_string_data(self):
        import json
        raw = {"id": "C1", "data": json.dumps({"name": "JSON Corp"})}
        cust = map_customer(raw)
        assert cust.name == "JSON Corp"


# ── map_vendor ────────────────────────────────────────────────────


class TestMapVendor:
    """Test WMS Vendor → BusinessEntity mapping."""

    def test_maps_basic_fields(self):
        raw = {"id": "V1", "data": {"name": "Oak Supplier"}, "globalId": "GV-001"}
        vendor = map_vendor(raw)
        assert vendor is not None
        assert vendor.entity_type == EntityType.VENDOR
        assert vendor.name == "Oak Supplier"

    def test_missing_id_returns_none(self):
        assert map_vendor({"data": {"name": "No ID"}}) is None


# ── map_warehouse_job ─────────────────────────────────────────────


class TestMapWarehouseJob:
    """Test WMS WarehouseJobs → WorkOrder mapping."""

    def _raw(self, **overrides):
        base = {
            "id": "J-001",
            "title": "Transfer to WH02",
            "jobType": "TRANSFER",
            "status": "IN_PROGRESS",
            "priority": "HIGH",
        }
        base.update(overrides)
        return base

    def test_maps_basic_fields(self):
        job = map_warehouse_job(self._raw())
        assert job is not None
        assert job.source_id == "J-001"
        assert job.title == "Transfer to WH02"
        assert job.order_type == "TRANSFER"

    def test_maps_status(self):
        job = map_warehouse_job(self._raw())
        assert job.status == WorkOrderStatus.IN_PROGRESS

    def test_maps_priority(self):
        job = map_warehouse_job(self._raw())
        assert job.priority == WorkOrderPriority.HIGH

    def test_maps_parent_job(self):
        job = map_warehouse_job(self._raw(parentJobId="J-000"))
        assert job.parent_id == "J-000"

    def test_missing_title_returns_none(self):
        raw = {"id": "J-001", "jobType": "TRANSFER"}
        assert map_warehouse_job(raw) is None

    def test_missing_job_type_returns_none(self):
        raw = {"id": "J-001", "title": "Test Job"}
        assert map_warehouse_job(raw) is None


# ── map_production_order ──────────────────────────────────────────


class TestMapProductionOrder:
    """Test WMS ProductionOrder → ProductionOrder mapping."""

    def _raw(self, **overrides):
        base = {
            "id": "PO-001",
            "orderNumber": "PO-2024-001",
            "status": "IN_PROGRESS",
            "maxQuantity": 100,
            "customerId": "C1",
        }
        base.update(overrides)
        return base

    def test_maps_basic_fields(self):
        po = map_production_order(self._raw())
        assert po is not None
        assert po.source_id == "PO-001"
        assert po.order_number == "PO-2024-001"

    def test_maps_status(self):
        po = map_production_order(self._raw())
        assert po.status == OrderStatus.IN_PROGRESS

    def test_maps_barreling_status(self):
        po = map_production_order(self._raw(status=None, barrelingStatus="BARRELING"))
        assert po.status == OrderStatus.IN_PROGRESS

    def test_maps_quantity(self):
        po = map_production_order(self._raw())
        assert po.planned_quantity == 100.0
        assert po.unit_of_measure == "barrels"

    def test_maps_customer(self):
        po = map_production_order(self._raw())
        assert po.customer_id == "C1"

    def test_missing_id_returns_none(self):
        raw = {"orderNumber": "PO-001"}
        assert map_production_order(raw) is None

    def test_json_data_field(self):
        import json
        raw = {
            "id": "PO-002",
            "data": json.dumps({"orderNumber": "PO-DATA-001", "recipeId": "R1"}),
        }
        po = map_production_order(raw)
        assert po is not None
        assert po.order_number == "PO-DATA-001"
        assert po.recipe_id == "R1"

    def test_lot_ids_mapping(self):
        po = map_production_order(self._raw(lotIds=["L1", "L2", "L3"]))
        assert po.lot_ids == ["L1", "L2", "L3"]
