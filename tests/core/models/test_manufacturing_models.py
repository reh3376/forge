"""Tests for manufacturing domain models.

Covers all 10 entity families:
- Required field enforcement
- Enum validation
- Optional field defaults
- forge_id auto-generation
- JSON round-trip serialization
- Schema generation
- Cross-model reference patterns
"""

from __future__ import annotations

import json
from datetime import datetime
from uuid import UUID

import pytest
from pydantic import ValidationError

from forge.core.models.manufacturing import (
    BusinessEntity,
    Lot,
    ManufacturingUnit,
    MaterialItem,
    OperationalEvent,
    PhysicalAsset,
    ProcessDefinition,
    ProcessStep,
    ProductionOrder,
    QualitySample,
    SampleResult,
    WorkOrder,
    WorkOrderDependency,
)
from forge.core.models.manufacturing.enums import (
    AssetOperationalState,
    AssetType,
    EntityType,
    EventCategory,
    EventSeverity,
    LifecycleState,
    OrderStatus,
    SampleOutcome,
    UnitStatus,
    WorkOrderPriority,
    WorkOrderStatus,
)

# ── Helpers ─────────────────────────────────────────────────────────


def _base_kwargs(**overrides: object) -> dict:
    """Minimal kwargs for ManufacturingModelBase."""
    defaults = {"source_system": "test-sys", "source_id": "test-001"}
    defaults.update(overrides)
    return defaults


# ── ManufacturingModelBase ──────────────────────────────────────────


class TestManufacturingModelBase:
    """Tests for the shared base model."""

    def test_forge_id_auto_generated(self) -> None:
        mu = ManufacturingUnit(
            **_base_kwargs(), unit_type="barrel",
        )
        assert isinstance(mu.forge_id, UUID)

    def test_forge_id_unique_per_instance(self) -> None:
        a = ManufacturingUnit(**_base_kwargs(), unit_type="barrel")
        b = ManufacturingUnit(**_base_kwargs(), unit_type="barrel")
        assert a.forge_id != b.forge_id

    def test_source_system_required(self) -> None:
        with pytest.raises(ValidationError):
            ManufacturingUnit(source_id="x", unit_type="barrel")

    def test_source_id_required(self) -> None:
        with pytest.raises(ValidationError):
            ManufacturingUnit(source_system="x", unit_type="barrel")

    def test_captured_at_auto_set(self) -> None:
        mu = ManufacturingUnit(**_base_kwargs(), unit_type="barrel")
        assert isinstance(mu.captured_at, datetime)

    def test_metadata_default_empty(self) -> None:
        mu = ManufacturingUnit(**_base_kwargs(), unit_type="barrel")
        assert mu.metadata == {}

    def test_metadata_accepts_arbitrary_keys(self) -> None:
        mu = ManufacturingUnit(
            **_base_kwargs(),
            unit_type="barrel",
            metadata={"disposition": "Filled", "custom_flag": True},
        )
        assert mu.metadata["disposition"] == "Filled"


# ── ManufacturingUnit ───────────────────────────────────────────────


class TestManufacturingUnit:
    """Tests for the ManufacturingUnit entity family."""

    def test_required_fields(self) -> None:
        mu = ManufacturingUnit(**_base_kwargs(), unit_type="barrel")
        assert mu.unit_type == "barrel"

    def test_unit_type_required(self) -> None:
        with pytest.raises(ValidationError):
            ManufacturingUnit(**_base_kwargs())

    def test_status_default_pending(self) -> None:
        mu = ManufacturingUnit(**_base_kwargs(), unit_type="barrel")
        assert mu.status == UnitStatus.PENDING

    def test_status_enum_validation(self) -> None:
        mu = ManufacturingUnit(
            **_base_kwargs(), unit_type="barrel",
            status=UnitStatus.ACTIVE,
        )
        assert mu.status == UnitStatus.ACTIVE

    def test_lifecycle_state_optional(self) -> None:
        mu = ManufacturingUnit(**_base_kwargs(), unit_type="barrel")
        assert mu.lifecycle_state is None

    def test_lifecycle_state_enum(self) -> None:
        mu = ManufacturingUnit(
            **_base_kwargs(), unit_type="barrel",
            lifecycle_state=LifecycleState.AGING,
        )
        assert mu.lifecycle_state == LifecycleState.AGING

    def test_all_optional_fields(self) -> None:
        mu = ManufacturingUnit(
            **_base_kwargs(), unit_type="batch",
            serial_number="SN-001", lot_id="L-1", location_id="LOC-1",
            owner_id="C-1", recipe_id="R-1",
            quantity=53.0, unit_of_measure="gallons",
            product_type="BOURBON",
        )
        assert mu.serial_number == "SN-001"
        assert mu.quantity == 53.0


# ── Lot ─────────────────────────────────────────────────────────────


class TestLot:
    """Tests for the Lot entity family."""

    def test_lot_number_required(self) -> None:
        lot = Lot(**_base_kwargs(), lot_number="2026-001")
        assert lot.lot_number == "2026-001"

    def test_lot_number_missing(self) -> None:
        with pytest.raises(ValidationError):
            Lot(**_base_kwargs())

    def test_status_default(self) -> None:
        lot = Lot(**_base_kwargs(), lot_number="L-1")
        assert lot.status == "CREATED"

    def test_parent_lot_hierarchy(self) -> None:
        lot = Lot(
            **_base_kwargs(), lot_number="L-1A",
            parent_lot_id="L-1",
        )
        assert lot.parent_lot_id == "L-1"


# ── PhysicalAsset ───────────────────────────────────────────────────


class TestPhysicalAsset:
    """Tests for the PhysicalAsset entity family."""

    def test_required_fields(self) -> None:
        pa = PhysicalAsset(
            **_base_kwargs(),
            asset_type=AssetType.EQUIPMENT,
            name="Fermenter-3",
        )
        assert pa.name == "Fermenter-3"

    def test_asset_type_required(self) -> None:
        with pytest.raises(ValidationError):
            PhysicalAsset(**_base_kwargs(), name="X")

    def test_name_required(self) -> None:
        with pytest.raises(ValidationError):
            PhysicalAsset(
                **_base_kwargs(), asset_type=AssetType.EQUIPMENT,
            )

    def test_asset_type_enum_values(self) -> None:
        for t in AssetType:
            pa = PhysicalAsset(
                **_base_kwargs(), asset_type=t, name=f"test-{t}",
            )
            assert pa.asset_type == t

    def test_operational_state(self) -> None:
        pa = PhysicalAsset(
            **_base_kwargs(),
            asset_type=AssetType.EQUIPMENT, name="Still-1",
            operational_state=AssetOperationalState.RUNNING,
        )
        assert pa.operational_state == AssetOperationalState.RUNNING

    def test_hierarchy_via_parent(self) -> None:
        pa = PhysicalAsset(
            **_base_kwargs(),
            asset_type=AssetType.WORK_UNIT, name="Rick-3",
            parent_id="floor-1",
            location_path="WH-A/Floor-1/Rick-3",
        )
        assert pa.parent_id == "floor-1"
        assert "WH-A" in pa.location_path


# ── OperationalEvent ────────────────────────────────────────────────


class TestOperationalEvent:
    """Tests for the OperationalEvent entity family."""

    def test_required_fields(self) -> None:
        ev = OperationalEvent(
            **_base_kwargs(),
            event_type="Entry", entity_type="manufacturing_unit",
            entity_id="b-1", event_time=datetime(2026, 4, 5),
        )
        assert ev.event_type == "Entry"

    def test_event_type_required(self) -> None:
        with pytest.raises(ValidationError):
            OperationalEvent(
                **_base_kwargs(),
                entity_type="x", entity_id="x",
                event_time=datetime(2026, 1, 1),
            )

    def test_severity_default_info(self) -> None:
        ev = OperationalEvent(
            **_base_kwargs(),
            event_type="X", entity_type="x", entity_id="x",
            event_time=datetime(2026, 1, 1),
        )
        assert ev.severity == EventSeverity.INFO

    def test_category_optional(self) -> None:
        ev = OperationalEvent(
            **_base_kwargs(),
            event_type="X", entity_type="x", entity_id="x",
            event_time=datetime(2026, 1, 1),
            category=EventCategory.QUALITY,
        )
        assert ev.category == EventCategory.QUALITY

    def test_severity_all_values(self) -> None:
        for s in EventSeverity:
            ev = OperationalEvent(
                **_base_kwargs(),
                event_type="X", entity_type="x", entity_id="x",
                event_time=datetime(2026, 1, 1), severity=s,
            )
            assert ev.severity == s


# ── BusinessEntity ──────────────────────────────────────────────────


class TestBusinessEntity:
    """Tests for the BusinessEntity entity family."""

    def test_required_fields(self) -> None:
        be = BusinessEntity(
            **_base_kwargs(),
            entity_type=EntityType.CUSTOMER, name="Acme",
        )
        assert be.name == "Acme"

    def test_entity_type_required(self) -> None:
        with pytest.raises(ValidationError):
            BusinessEntity(**_base_kwargs(), name="X")

    def test_entity_type_all_values(self) -> None:
        for t in EntityType:
            be = BusinessEntity(
                **_base_kwargs(), entity_type=t, name=f"test-{t}",
            )
            assert be.entity_type == t

    def test_external_ids(self) -> None:
        be = BusinessEntity(
            **_base_kwargs(),
            entity_type=EntityType.VENDOR, name="BarrelCo",
            external_ids={"erp": "V-123", "global": "abc"},
        )
        assert be.external_ids["erp"] == "V-123"


# ── ProcessDefinition ───────────────────────────────────────────────


class TestProcessDefinition:
    """Tests for the ProcessDefinition entity family."""

    def test_required_fields(self) -> None:
        pd_ = ProcessDefinition(
            **_base_kwargs(), name="Bourbon Mash #1",
        )
        assert pd_.name == "Bourbon Mash #1"

    def test_steps_default_empty(self) -> None:
        pd_ = ProcessDefinition(**_base_kwargs(), name="X")
        assert pd_.steps == []

    def test_with_steps(self) -> None:
        steps = [
            ProcessStep(
                **_base_kwargs(source_id="s1"),
                step_number=1, name="Mashing",
            ),
            ProcessStep(
                **_base_kwargs(source_id="s2"),
                step_number=2, name="Fermentation",
            ),
        ]
        pd_ = ProcessDefinition(
            **_base_kwargs(), name="Bourbon",
            steps=steps,
        )
        assert len(pd_.steps) == 2
        assert pd_.steps[0].name == "Mashing"

    def test_bill_of_materials(self) -> None:
        pd_ = ProcessDefinition(
            **_base_kwargs(), name="Rye",
            bill_of_materials=[
                {"item_id": "CORN", "quantity": 75.0, "unit": "bushels"},
                {"item_id": "RYE", "quantity": 15.0, "unit": "bushels"},
            ],
        )
        assert len(pd_.bill_of_materials) == 2


# ── WorkOrder ───────────────────────────────────────────────────────


class TestWorkOrder:
    """Tests for the WorkOrder entity family."""

    def test_required_fields(self) -> None:
        wo = WorkOrder(
            **_base_kwargs(),
            title="Check WH-A", order_type="INVENTORY_CHECK",
        )
        assert wo.title == "Check WH-A"

    def test_status_default_pending(self) -> None:
        wo = WorkOrder(
            **_base_kwargs(),
            title="X", order_type="X",
        )
        assert wo.status == WorkOrderStatus.PENDING

    def test_priority_default_normal(self) -> None:
        wo = WorkOrder(
            **_base_kwargs(),
            title="X", order_type="X",
        )
        assert wo.priority == WorkOrderPriority.NORMAL

    def test_dependency(self) -> None:
        dep = WorkOrderDependency(
            **_base_kwargs(),
            dependent_order_id="j-2", prerequisite_order_id="j-1",
        )
        assert dep.dependency_type == "BLOCKS"

    def test_scheduling_fields(self) -> None:
        wo = WorkOrder(
            **_base_kwargs(),
            title="Fill", order_type="BARREL_FILL",
            planned_start=datetime(2026, 4, 5, 8, 0),
            planned_end=datetime(2026, 4, 5, 16, 0),
        )
        assert wo.planned_start.hour == 8


# ── MaterialItem ────────────────────────────────────────────────────


class TestMaterialItem:
    """Tests for the MaterialItem entity family."""

    def test_required_fields(self) -> None:
        mi = MaterialItem(
            **_base_kwargs(),
            item_number="ITEM-1", name="53-Gal Oak Barrel",
        )
        assert mi.item_number == "ITEM-1"

    def test_item_number_required(self) -> None:
        with pytest.raises(ValidationError):
            MaterialItem(**_base_kwargs(), name="X")

    def test_external_ids(self) -> None:
        mi = MaterialItem(
            **_base_kwargs(),
            item_number="X", name="X",
            external_ids={"erp": "ERP-001"},
        )
        assert mi.external_ids["erp"] == "ERP-001"

    def test_is_active_default_true(self) -> None:
        mi = MaterialItem(
            **_base_kwargs(), item_number="X", name="X",
        )
        assert mi.is_active is True


# ── QualitySample ───────────────────────────────────────────────────


class TestQualitySample:
    """Tests for the QualitySample entity family."""

    def test_required_fields(self) -> None:
        qs = QualitySample(
            **_base_kwargs(),
            sample_type="proof", entity_type="manufacturing_unit",
            entity_id="b-1",
        )
        assert qs.sample_type == "proof"

    def test_overall_outcome_default_pending(self) -> None:
        qs = QualitySample(
            **_base_kwargs(),
            sample_type="x", entity_type="x", entity_id="x",
        )
        assert qs.overall_outcome == SampleOutcome.PENDING

    def test_with_results(self) -> None:
        sr = SampleResult(
            **_base_kwargs(source_id="sr-1"),
            parameter_name="proof",
            measured_value=120.5,
            lower_limit=100.0, upper_limit=130.0,
            outcome=SampleOutcome.PASS,
        )
        qs = QualitySample(
            **_base_kwargs(),
            sample_type="proof", entity_type="manufacturing_unit",
            entity_id="b-1", results=[sr],
        )
        assert len(qs.results) == 1
        assert qs.results[0].outcome == SampleOutcome.PASS

    def test_sample_result_text(self) -> None:
        sr = SampleResult(
            **_base_kwargs(),
            parameter_name="visual_check",
            measured_text="clear",
            outcome=SampleOutcome.PASS,
        )
        assert sr.measured_text == "clear"


# ── ProductionOrder ─────────────────────────────────────────────────


class TestProductionOrder:
    """Tests for the ProductionOrder entity family."""

    def test_required_fields(self) -> None:
        po = ProductionOrder(
            **_base_kwargs(), order_number="PRO-001",
        )
        assert po.order_number == "PRO-001"

    def test_status_default_draft(self) -> None:
        po = ProductionOrder(**_base_kwargs(), order_number="X")
        assert po.status == OrderStatus.DRAFT

    def test_status_all_values(self) -> None:
        for s in OrderStatus:
            po = ProductionOrder(
                **_base_kwargs(), order_number="X", status=s,
            )
            assert po.status == s

    def test_lot_ids_default_empty(self) -> None:
        po = ProductionOrder(**_base_kwargs(), order_number="X")
        assert po.lot_ids == []

    def test_quantities(self) -> None:
        po = ProductionOrder(
            **_base_kwargs(), order_number="X",
            planned_quantity=100.0, actual_quantity=95.0,
            unit_of_measure="barrels",
        )
        assert po.planned_quantity == 100.0
        assert po.actual_quantity == 95.0


# ── JSON Serialization ──────────────────────────────────────────────


class TestSerialization:
    """Tests for JSON round-trip and schema generation."""

    def test_manufacturing_unit_round_trip(self) -> None:
        mu = ManufacturingUnit(
            **_base_kwargs(), unit_type="barrel",
            serial_number="SN-001", status=UnitStatus.ACTIVE,
        )
        j = mu.model_dump_json()
        mu2 = ManufacturingUnit.model_validate_json(j)
        assert mu2.serial_number == "SN-001"
        assert mu2.status == UnitStatus.ACTIVE
        assert mu2.forge_id == mu.forge_id

    def test_lot_round_trip(self) -> None:
        lot = Lot(**_base_kwargs(), lot_number="L-1", quantity=10.5)
        j = lot.model_dump_json()
        lot2 = Lot.model_validate_json(j)
        assert lot2.lot_number == "L-1"
        assert lot2.quantity == 10.5

    def test_nested_steps_round_trip(self) -> None:
        pd_ = ProcessDefinition(
            **_base_kwargs(), name="Bourbon",
            steps=[
                ProcessStep(
                    **_base_kwargs(source_id="s1"),
                    step_number=1, name="Mash",
                ),
            ],
        )
        j = pd_.model_dump_json()
        pd2 = ProcessDefinition.model_validate_json(j)
        assert len(pd2.steps) == 1
        assert pd2.steps[0].name == "Mash"

    def test_nested_results_round_trip(self) -> None:
        qs = QualitySample(
            **_base_kwargs(),
            sample_type="proof", entity_type="x", entity_id="x",
            results=[
                SampleResult(
                    **_base_kwargs(source_id="sr1"),
                    parameter_name="proof",
                    measured_value=120.0,
                    outcome=SampleOutcome.PASS,
                ),
            ],
        )
        j = qs.model_dump_json()
        qs2 = QualitySample.model_validate_json(j)
        assert qs2.results[0].measured_value == 120.0

    def test_dict_round_trip(self) -> None:
        mu = ManufacturingUnit(
            **_base_kwargs(), unit_type="barrel",
        )
        d = mu.model_dump()
        mu2 = ManufacturingUnit(**d)
        assert mu2.forge_id == mu.forge_id

    def test_schema_generation_all_families(self) -> None:
        families = [
            ManufacturingUnit, Lot, PhysicalAsset,
            OperationalEvent, BusinessEntity, ProcessDefinition,
            WorkOrder, MaterialItem, QualitySample, ProductionOrder,
        ]
        for model_cls in families:
            schema = model_cls.model_json_schema()
            assert "properties" in schema, (
                f"{model_cls.__name__} schema missing properties"
            )
            assert len(schema["properties"]) >= 5, (
                f"{model_cls.__name__} has too few properties"
            )

    def test_schema_valid_json(self) -> None:
        schema = ManufacturingUnit.model_json_schema()
        j = json.dumps(schema)
        parsed = json.loads(j)
        assert parsed["title"] == "ManufacturingUnit"


# ── Cross-Model Consistency ─────────────────────────────────────────


class TestCrossModelConsistency:
    """Tests for consistency across entity families."""

    def test_all_families_have_forge_id(self) -> None:
        families = [
            ManufacturingUnit(**_base_kwargs(), unit_type="x"),
            Lot(**_base_kwargs(), lot_number="x"),
            PhysicalAsset(
                **_base_kwargs(),
                asset_type=AssetType.EQUIPMENT, name="x",
            ),
            OperationalEvent(
                **_base_kwargs(),
                event_type="x", entity_type="x",
                entity_id="x", event_time=datetime(2026, 1, 1),
            ),
            BusinessEntity(
                **_base_kwargs(),
                entity_type=EntityType.CUSTOMER, name="x",
            ),
            ProcessDefinition(**_base_kwargs(), name="x"),
            WorkOrder(
                **_base_kwargs(), title="x", order_type="x",
            ),
            MaterialItem(
                **_base_kwargs(), item_number="x", name="x",
            ),
            QualitySample(
                **_base_kwargs(),
                sample_type="x", entity_type="x", entity_id="x",
            ),
            ProductionOrder(**_base_kwargs(), order_number="x"),
        ]
        for instance in families:
            assert isinstance(instance.forge_id, UUID), (
                f"{type(instance).__name__} missing forge_id"
            )
            assert instance.source_system == "test-sys"
            assert instance.source_id == "test-001"
            assert isinstance(instance.metadata, dict)

    def test_id_reference_format_consistent(self) -> None:
        """All cross-model references use source_id strings."""
        mu = ManufacturingUnit(
            **_base_kwargs(), unit_type="barrel",
            lot_id="L-1", location_id="LOC-1",
            owner_id="C-1", recipe_id="R-1",
        )
        # All references are plain strings (not UUIDs, not ints)
        assert isinstance(mu.lot_id, str)
        assert isinstance(mu.location_id, str)
        assert isinstance(mu.owner_id, str)
        assert isinstance(mu.recipe_id, str)

    def test_enum_values_well_formed(self) -> None:
        """Verify all enum members are non-empty uppercase strings."""
        for enum_cls in [
            UnitStatus, AssetType, EntityType,
            WorkOrderStatus, OrderStatus, SampleOutcome,
        ]:
            for member in enum_cls:
                assert member.value == member.value.upper(), (
                    f"{enum_cls.__name__}.{member.name} is not uppercase"
                )
                assert len(member.value) > 0
        # Spot-check that distinct enums have distinct meanings
        assert UnitStatus.ACTIVE.value != WorkOrderStatus.IN_PROGRESS.value
