"""The Go manufacturing models mirror the Python ones, held by one fixture (FB-016).

``go/internal/models/manufacturing/testdata/python_models.json`` is written from
the Python models by this module (``python -m tests.core.models.test_go_parity``)
and read by the Go package's ``parity_test.go``. It carries every enum's members,
and per model its field list, the fields Python requires, the fields that default
to ``None``, the JSON of a *minimal* instance (the required values only, so it
shows the Python defaults) and of a *full* one (every field set). The test here
holds the fixture equal to the current Python models, so a change on either side
fails one suite or the other until the fixture is regenerated and the Go side
follows. Python emits empty containers (``{}``, ``[]``) where Go omits them; the
Go test compares without them.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from enum import StrEnum
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest

from forge.core.models import manufacturing as package
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
    enums,
)
from forge.core.models.manufacturing.base import ManufacturingModelBase
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

FIXTURE = (
    Path(__file__).resolve().parents[3]
    / "go"
    / "internal"
    / "models"
    / "manufacturing"
    / "testdata"
    / "python_models.json"
)
REGENERATE = "python -m tests.core.models.test_go_parity"

FORGE_ID = UUID("00000000-0000-4000-8000-000000000001")
CAPTURED_AT = datetime(2026, 10, 23, 12, 0, 0, tzinfo=UTC)
STARTED = datetime(2026, 10, 23, 13, 0, 0, tzinfo=UTC)
ENDED = datetime(2026, 10, 23, 15, 30, 0, tzinfo=UTC)

# Whole seconds only: Python writes six fractional digits, Go trims zeros.


def _base(source_system: str, source_id: str) -> dict[str, Any]:
    return {
        "source_system": source_system,
        "source_id": source_id,
        "forge_id": FORGE_ID,
        "captured_at": CAPTURED_AT,
    }


_STEP = ProcessStep(
    **_base("forge-mes", "S-001"),
    step_number=1,
    name="Milling",
    step_type="operation",
    parent_step_id="S-000",
    duration_minutes=30.0,
    parameters={"temp_c": 65.5, "agitate": True, "mode": "slow"},
    description="Mill the grain bill.",
)
_RESULT = SampleResult(
    **_base("whk-wms", "SR-001"),
    parameter_name="proof",
    measured_value=90.0,
    measured_text="90 proof",
    unit_of_measure="proof",
    lower_limit=80.0,
    upper_limit=100.0,
    outcome=SampleOutcome.PASS,
)

#: Per model: its source system and id, the required values (the minimal
#: instance), and every other field (the full instance adds them).
_MODELS: dict[type[ManufacturingModelBase], tuple[str, str, dict[str, Any], dict[str, Any]]] = {
    BusinessEntity: (
        "whk-wms",
        "C-001",
        {"entity_type": EntityType.CUSTOMER, "name": "Acme Corp"},
        {
            "parent_id": "C-000",
            "external_ids": {"erp": "C-12345"},
            "contact_info": {"email": "ops@acme.example"},
            "location": "Louisville, KY",
            "is_active": False,
            "metadata": {"tier": 1},
        },
    ),
    Lot: (
        "whk-wms",
        "L-001",
        {"lot_number": "2026-001"},
        {
            "product_type": "bourbon",
            "item_id": "ITEM-7",
            "recipe_id": "R-001",
            "production_order_id": "PO-001",
            "customer_id": "C-001",
            "status": "STARTED",
            "quantity": 53.0,
            "unit_of_measure": "bbl",
            "parent_lot_id": "2025-009",
            "unit_count": 10,
            "metadata": {"whiskey_type_id": "WT-1"},
        },
    ),
    ManufacturingUnit: (
        "whk-wms",
        "B-001",
        {"unit_type": "barrel"},
        {
            "serial_number": "SN-12345",
            "lot_id": "L-001",
            "location_id": "WH-A-1-3-12",
            "owner_id": "C-001",
            "recipe_id": "R-001",
            "status": UnitStatus.ACTIVE,
            "lifecycle_state": LifecycleState.AGING,
            "quantity": 53.0,
            "unit_of_measure": "gallons",
            "product_type": "bourbon",
            "metadata": {"disposition": "AGING"},
        },
    ),
    MaterialItem: (
        "whk-wms",
        "I-001",
        {"item_number": "BBL-53-WHT-OAK", "name": "53-gallon White Oak Barrel"},
        {
            "description": "Charred white oak, 53 gallons.",
            "category": "barrel",
            "unit_of_measure": "each",
            "vendor_id": "V-001",
            "external_ids": {"erp": "ITEM-1234"},
            "is_active": False,
            "metadata": {"char_level": 4},
        },
    ),
    OperationalEvent: (
        "whk-wms",
        "EVT-001",
        {
            "event_type": "Entry",
            "entity_type": "manufacturing_unit",
            "entity_id": "B-001",
            "event_time": STARTED,
        },
        {
            "event_subtype": "Received",
            "category": EventCategory.LOGISTICS,
            "severity": EventSeverity.WARNING,
            "asset_id": "WH-A",
            "operator_id": "op-17",
            "result": "OK",
            "work_order_id": "WO-001",
            "metadata": {"reason_id": 3},
        },
    ),
    PhysicalAsset: (
        "whk-wms",
        "WH-A",
        {"asset_type": AssetType.SITE, "name": "Warehouse A"},
        {
            "parent_id": "ENT-1",
            "location_path": "Enterprise/Site-1",
            "operational_state": AssetOperationalState.RUNNING,
            "capacity": 20000.0,
            "capacity_unit": "bbl",
            "metadata": {"floors": 7},
        },
    ),
    ProcessStep: (
        "forge-mes",
        "S-001",
        {"step_number": 1, "name": "Milling"},
        {
            k: v
            for k, v in _STEP.model_dump().items()
            if k not in {*_base("", ""), "step_number", "name", "metadata"}
        }
        | {"metadata": {"operation_id": "OP-9"}},
    ),
    ProcessDefinition: (
        "forge-mes",
        "R-001",
        {"name": "Bourbon Mash Recipe"},
        {
            "version": "2.0",
            "product_type": "bourbon",
            "is_published": True,
            "customer_id": "C-001",
            "steps": [_STEP],
            "parameters": {"yield_target": 0.92, "organic": False, "grain": "corn"},
            "bill_of_materials": [{"item_id": "CORN", "quantity": 1000.0, "unit": "kg"}],
            "description": "Standard bourbon mash.",
            "metadata": {"whiskey_type": "bourbon"},
        },
    ),
    ProductionOrder: (
        "forge-mes",
        "PO-001",
        {"order_number": "PO-2026-001"},
        {
            "recipe_id": "R-001",
            "customer_id": "C-001",
            "status": OrderStatus.IN_PROGRESS,
            "product_type": "bourbon",
            "planned_quantity": 100.0,
            "actual_quantity": 40.0,
            "unit_of_measure": "bbl",
            "planned_start": STARTED,
            "planned_end": ENDED,
            "actual_start": STARTED,
            "actual_end": ENDED,
            "lot_ids": ["L-001", "L-002"],
            "priority": 2,
            "metadata": {"container_type": "barrel"},
        },
    ),
    SampleResult: (
        "whk-wms",
        "SR-001",
        {"parameter_name": "proof"},
        {
            k: v
            for k, v in _RESULT.model_dump().items()
            if k not in {*_base("", ""), "parameter_name", "metadata"}
        }
        | {"metadata": {"sample_type_id": 2}},
    ),
    QualitySample: (
        "whk-wms",
        "QS-001",
        {"sample_type": "proof_check", "entity_type": "manufacturing_unit", "entity_id": "B-001"},
        {
            "sampled_by": "op-17",
            "sampled_at": STARTED,
            "asset_id": "LAB-1",
            "results": [_RESULT],
            "overall_outcome": SampleOutcome.PASS,
            "metadata": {"volume_ml": 50},
        },
    ),
    WorkOrderDependency: (
        "whk-wms",
        "DEP-001",
        {"dependent_order_id": "WO-002", "prerequisite_order_id": "WO-001"},
        {"dependency_type": "RELATED", "metadata": {"template_id": "T-1"}},
    ),
    WorkOrder: (
        "whk-wms",
        "WO-001",
        {"title": "Transfer barrels to Warehouse B", "order_type": "TRANSFER"},
        {
            "status": WorkOrderStatus.IN_PROGRESS,
            "priority": WorkOrderPriority.HIGH,
            "parent_id": "WO-000",
            "assigned_asset_id": "WH-B",
            "assigned_operator_id": "op-17",
            "planned_start": STARTED,
            "planned_end": ENDED,
            "actual_start": STARTED,
            "actual_end": ENDED,
            "production_order_id": "PO-001",
            "lot_id": "L-001",
            "metadata": {"job_type": "TRANSFER"},
        },
    ),
}


def _dump(model: ManufacturingModelBase) -> dict[str, Any]:
    return model.model_dump(mode="json", exclude_none=True)


def _enums() -> dict[str, list[str]]:
    return {
        cls.__name__: [member.value for member in cls]
        for cls in vars(enums).values()
        if isinstance(cls, type)
        and issubclass(cls, StrEnum)
        and cls is not StrEnum
        and cls.__module__ == enums.__name__
    }


def _model_document(model: type[ManufacturingModelBase]) -> dict[str, Any]:
    source_system, source_id, required, rest = _MODELS[model]
    fields = model.model_fields
    return {
        "fields": list(fields),
        "required": [name for name, field in fields.items() if field.is_required()],
        "optional": [
            name
            for name, field in fields.items()
            if not field.is_required() and field.default is None
        ],
        "minimal": _dump(model(**_base(source_system, source_id), **required)),
        "full": _dump(model(**_base(source_system, source_id), **required, **rest)),
    }


def document() -> dict[str, Any]:
    """What the fixture holds, from the Python models as they are now."""
    return {
        "generated_by": f"{REGENERATE} (tests/core/models/test_go_parity.py)",
        "enums": _enums(),
        "models": {model.__name__: _model_document(model) for model in _MODELS},
    }


def write() -> Path:
    FIXTURE.parent.mkdir(exist_ok=True)
    FIXTURE.write_text(json.dumps(document(), indent=2) + "\n", encoding="utf-8")
    return FIXTURE


def test_fixture_matches_the_python_models():
    assert FIXTURE.is_file(), f"missing fixture; regenerate: {REGENERATE}"
    stored = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert stored == document(), f"the Python models changed; regenerate: {REGENERATE}"


def test_every_manufacturing_model_is_in_the_fixture():
    exported = {
        obj
        for obj in (getattr(package, name) for name in package.__all__)
        if isinstance(obj, type)
        and issubclass(obj, ManufacturingModelBase)
        and obj is not ManufacturingModelBase
    }
    assert exported == set(_MODELS)
    assert set(_enums()) == {
        name for name in package.__all__ if issubclass(getattr(package, name), StrEnum)
    }


@pytest.mark.parametrize("model", list(_MODELS), ids=lambda model: model.__name__)
def test_minimal_is_the_required_fields_and_full_sets_every_field(model):
    doc = _model_document(model)
    _, _, required, rest = _MODELS[model]
    assert set(required) == set(doc["required"]) - {"source_system", "source_id"}
    assert set(doc["full"]) == set(model.model_fields), "full must set every field"
    assert not set(rest) & set(required)
    assert set(doc["optional"]).isdisjoint(doc["required"])


if __name__ == "__main__":
    print(f"wrote {write()}")
