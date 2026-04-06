"""Tests for the context field registry."""

from __future__ import annotations

import pytest

from forge.core.registry.context_fields import (
    ContextField,
    ContextFieldRegistry,
    build_default_registry,
    get_default_registry,
)


class TestContextField:
    """Tests for the ContextField dataclass."""

    def test_create_field(self) -> None:
        f = ContextField(
            name="test_field", field_type="str",
            description="A test field.",
        )
        assert f.name == "test_field"
        assert f.field_type == "str"

    def test_field_is_frozen(self) -> None:
        f = ContextField(
            name="x", field_type="str", description="x",
        )
        with pytest.raises(AttributeError):
            f.name = "y"  # type: ignore[misc]

    def test_provenance_fields(self) -> None:
        f = ContextField(
            name="lot_id", field_type="str",
            description="Lot reference",
            wms_provenance="Lot.id",
            mes_provenance="Lot.id",
        )
        assert f.wms_provenance == "Lot.id"
        assert f.mes_provenance == "Lot.id"


class TestContextFieldRegistry:
    """Tests for the registry CRUD operations."""

    def test_register_and_get(self) -> None:
        reg = ContextFieldRegistry()
        f = ContextField(
            name="test", field_type="str", description="test",
        )
        reg.register(f)
        assert reg.get_field("test") is f

    def test_get_missing_returns_none(self) -> None:
        reg = ContextFieldRegistry()
        assert reg.get_field("nonexistent") is None

    def test_list_fields_sorted(self) -> None:
        reg = ContextFieldRegistry()
        reg.register(ContextField(
            name="z_field", field_type="str", description="z",
        ))
        reg.register(ContextField(
            name="a_field", field_type="str", description="a",
        ))
        names = [f.name for f in reg.list_fields()]
        assert names == ["a_field", "z_field"]

    def test_list_field_names(self) -> None:
        reg = ContextFieldRegistry()
        reg.register(ContextField(
            name="b", field_type="str", description="b",
        ))
        reg.register(ContextField(
            name="a", field_type="str", description="a",
        ))
        assert reg.list_field_names() == ["a", "b"]

    def test_len(self) -> None:
        reg = ContextFieldRegistry()
        assert len(reg) == 0
        reg.register(ContextField(
            name="x", field_type="str", description="x",
        ))
        assert len(reg) == 1

    def test_contains(self) -> None:
        reg = ContextFieldRegistry()
        reg.register(ContextField(
            name="x", field_type="str", description="x",
        ))
        assert "x" in reg
        assert "y" not in reg

    def test_overwrite_on_reregister(self) -> None:
        reg = ContextFieldRegistry()
        f1 = ContextField(
            name="x", field_type="str", description="first",
        )
        f2 = ContextField(
            name="x", field_type="int", description="second",
        )
        reg.register(f1)
        reg.register(f2)
        assert reg.get_field("x").field_type == "int"


class TestValidation:
    """Tests for context validation."""

    def _reg(self) -> ContextFieldRegistry:
        reg = ContextFieldRegistry()
        reg.register(ContextField(
            name="lot_id", field_type="str",
            description="Lot", required=True,
        ))
        reg.register(ContextField(
            name="shift_id", field_type="str",
            description="Shift", required=False,
        ))
        return reg

    def test_valid_context_no_errors(self) -> None:
        errors = self._reg().validate_context(
            {"lot_id": "L-1", "shift_id": "B"},
        )
        assert errors == []

    def test_missing_required_field(self) -> None:
        errors = self._reg().validate_context({"shift_id": "B"})
        assert len(errors) == 1
        assert "lot_id" in errors[0]

    def test_unknown_field_flagged(self) -> None:
        errors = self._reg().validate_context(
            {"lot_id": "L-1", "bogus": "x"},
        )
        assert len(errors) == 1
        assert "bogus" in errors[0]

    def test_extra_field_allowed(self) -> None:
        errors = self._reg().validate_context(
            {"lot_id": "L-1", "extra": {"custom": "data"}},
        )
        assert errors == []

    def test_multiple_errors(self) -> None:
        errors = self._reg().validate_context(
            {"unknown1": "x", "unknown2": "y"},
        )
        # Missing lot_id + 2 unknown fields = 3 errors
        assert len(errors) == 3


class TestProvenance:
    """Tests for provenance lookup."""

    def test_wms_provenance(self) -> None:
        reg = ContextFieldRegistry()
        reg.register(ContextField(
            name="lot_id", field_type="str", description="lot",
            wms_provenance="Lot.id", mes_provenance="Lot.globalId",
        ))
        assert reg.get_provenance("lot_id", "whk-wms") == "Lot.id"

    def test_mes_provenance(self) -> None:
        reg = ContextFieldRegistry()
        reg.register(ContextField(
            name="lot_id", field_type="str", description="lot",
            wms_provenance="Lot.id", mes_provenance="Lot.globalId",
        ))
        assert reg.get_provenance("lot_id", "whk-mes") == "Lot.globalId"

    def test_unknown_system_returns_none(self) -> None:
        reg = ContextFieldRegistry()
        reg.register(ContextField(
            name="lot_id", field_type="str", description="lot",
        ))
        assert reg.get_provenance("lot_id", "unknown-sys") is None

    def test_unknown_field_returns_none(self) -> None:
        reg = ContextFieldRegistry()
        assert reg.get_provenance("bogus", "whk-wms") is None


class TestDefaultRegistry:
    """Tests for the pre-built default registry."""

    def test_default_registry_has_12_fields(self) -> None:
        reg = get_default_registry()
        assert len(reg) == 12

    def test_cross_spoke_fields_present(self) -> None:
        reg = get_default_registry()
        cross_spoke = [
            "lot_id", "shift_id", "operator_id",
            "event_timestamp", "event_type", "work_order_id",
        ]
        for name in cross_spoke:
            assert name in reg, f"Missing cross-spoke field: {name}"

    def test_context_record_fields_present(self) -> None:
        reg = get_default_registry()
        cr_fields = [
            "equipment_id", "batch_id", "recipe_id",
            "operating_mode", "area", "site",
        ]
        for name in cr_fields:
            assert name in reg, (
                f"Missing ContextualRecord field: {name}"
            )

    def test_all_fields_have_descriptions(self) -> None:
        reg = get_default_registry()
        for f in reg.list_fields():
            assert f.description, (
                f"Field {f.name} has no description"
            )

    def test_all_fields_have_provenance(self) -> None:
        reg = get_default_registry()
        for f in reg.list_fields():
            assert f.wms_provenance is not None, (
                f"Field {f.name} missing WMS provenance"
            )
            assert f.mes_provenance is not None, (
                f"Field {f.name} missing MES provenance"
            )

    def test_singleton_behavior(self) -> None:
        r1 = get_default_registry()
        r2 = get_default_registry()
        assert r1 is r2

    def test_build_returns_new_instance(self) -> None:
        r1 = build_default_registry()
        r2 = build_default_registry()
        assert r1 is not r2
        assert len(r1) == len(r2)
