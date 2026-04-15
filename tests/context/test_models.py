"""Tests for F21 Context Engine domain models."""

from __future__ import annotations

from datetime import time

from forge.context.models import (
    Batch,
    BatchStatus,
    Equipment,
    EquipmentStatus,
    ModeState,
    OperatingMode,
    ShiftDefinition,
    ShiftSchedule,
)


class TestEquipment:
    def test_defaults(self):
        eq = Equipment(equipment_id="FERM-001", name="Fermenter 1", site="WHK-Main")
        assert eq.status == EquipmentStatus.ACTIVE
        assert eq.area == ""
        assert eq.parent_id is None
        assert eq.attributes == {}

    def test_all_fields(self):
        eq = Equipment(
            equipment_id="FERM-001",
            name="Fermenter 1",
            site="WHK-Main",
            area="Fermentation",
            parent_id="AREA-FERM",
            equipment_type="fermenter",
            status=EquipmentStatus.MAINTENANCE,
            attributes={"capacity": 500},
        )
        assert eq.parent_id == "AREA-FERM"
        assert eq.attributes["capacity"] == 500


class TestEquipmentStatus:
    def test_values(self):
        assert len(EquipmentStatus) == 3
        assert EquipmentStatus.ACTIVE == "active"
        assert EquipmentStatus.DECOMMISSIONED == "decommissioned"


class TestBatch:
    def test_defaults(self):
        b = Batch(batch_id="B001", equipment_id="FERM-001")
        assert b.status == BatchStatus.ACTIVE
        assert b.ended_at is None
        assert b.material_ids == []

    def test_all_fields(self):
        b = Batch(
            batch_id="B001",
            equipment_id="FERM-001",
            recipe_id="R001",
            lot_id="L001",
            material_ids=["MAT-001", "MAT-002"],
        )
        assert b.recipe_id == "R001"
        assert len(b.material_ids) == 2


class TestBatchStatus:
    def test_values(self):
        assert len(BatchStatus) == 4


class TestShiftDefinition:
    def test_frozen(self):
        sd = ShiftDefinition(name="Day", start_time=time(6, 0), end_time=time(18, 0))
        assert sd.timezone == "America/Kentucky/Louisville"
        import pytest
        with pytest.raises(AttributeError):
            sd.name = "Night"  # type: ignore[misc]


class TestShiftSchedule:
    def test_defaults(self):
        ss = ShiftSchedule(site="WHK-Main")
        assert ss.shifts == []


class TestOperatingMode:
    def test_all_modes(self):
        assert len(OperatingMode) == 8
        assert OperatingMode.CIP == "CIP"
        assert OperatingMode.CHANGEOVER == "CHANGEOVER"


class TestModeState:
    def test_defaults(self):
        ms = ModeState(equipment_id="FERM-001", mode=OperatingMode.PRODUCTION)
        assert ms.source == ""
