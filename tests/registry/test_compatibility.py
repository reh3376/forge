"""Tests for schema compatibility checker and diff."""

from __future__ import annotations

from forge.registry.compatibility import (
    check_compatibility,
    compute_diff,
)
from forge.registry.models import CompatibilityMode

# ---------------------------------------------------------------------------
# compute_diff tests
# ---------------------------------------------------------------------------


class TestComputeDiff:
    def test_identical_schemas(self):
        schema = {"type": "object", "properties": {"a": {"type": "string"}}}
        assert compute_diff(schema, schema) == []

    def test_added_field(self):
        old = {"type": "object", "properties": {"a": {"type": "string"}}}
        new = {
            "type": "object",
            "properties": {"a": {"type": "string"}, "b": {"type": "integer"}},
        }
        diffs = compute_diff(old, new)
        assert len(diffs) == 1
        assert diffs[0].field_path == "b"
        assert diffs[0].change_type == "added"

    def test_removed_field(self):
        old = {
            "type": "object",
            "properties": {"a": {"type": "string"}, "b": {"type": "integer"}},
        }
        new = {"type": "object", "properties": {"a": {"type": "string"}}}
        diffs = compute_diff(old, new)
        assert len(diffs) == 1
        assert diffs[0].field_path == "b"
        assert diffs[0].change_type == "removed"

    def test_type_changed(self):
        old = {"type": "object", "properties": {"a": {"type": "string"}}}
        new = {"type": "object", "properties": {"a": {"type": "integer"}}}
        diffs = compute_diff(old, new)
        assert len(diffs) == 1
        assert diffs[0].change_type == "type_changed"
        assert diffs[0].old_value == "string"
        assert diffs[0].new_value == "integer"

    def test_required_added(self):
        old = {"type": "object", "properties": {"a": {"type": "string"}}}
        new = {
            "type": "object",
            "properties": {"a": {"type": "string"}},
            "required": ["a"],
        }
        diffs = compute_diff(old, new)
        assert len(diffs) == 1
        assert diffs[0].change_type == "required_added"

    def test_required_removed(self):
        old = {
            "type": "object",
            "properties": {"a": {"type": "string"}},
            "required": ["a"],
        }
        new = {"type": "object", "properties": {"a": {"type": "string"}}}
        diffs = compute_diff(old, new)
        assert len(diffs) == 1
        assert diffs[0].change_type == "required_removed"

    def test_new_field_required(self):
        old = {"type": "object", "properties": {"a": {"type": "string"}}}
        new = {
            "type": "object",
            "properties": {"a": {"type": "string"}, "b": {"type": "integer"}},
            "required": ["b"],
        }
        diffs = compute_diff(old, new)
        assert len(diffs) == 2
        types = {d.change_type for d in diffs}
        assert "added" in types
        assert "required_added" in types

    def test_nested_object_diff(self):
        old = {
            "type": "object",
            "properties": {
                "address": {
                    "type": "object",
                    "properties": {"city": {"type": "string"}},
                },
            },
        }
        new = {
            "type": "object",
            "properties": {
                "address": {
                    "type": "object",
                    "properties": {
                        "city": {"type": "string"},
                        "zip": {"type": "string"},
                    },
                },
            },
        }
        diffs = compute_diff(old, new)
        assert len(diffs) == 1
        assert diffs[0].field_path == "address.zip"
        assert diffs[0].change_type == "added"

    def test_empty_schemas(self):
        assert compute_diff({}, {}) == []

    def test_field_diff_description(self):
        old = {"type": "object", "properties": {"a": {"type": "string"}}}
        new = {"type": "object", "properties": {"a": {"type": "integer"}}}
        diffs = compute_diff(old, new)
        assert "type changed" in diffs[0].description


# ---------------------------------------------------------------------------
# check_compatibility tests
# ---------------------------------------------------------------------------


class TestCheckCompatibility:
    def _base_schema(self):
        return {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "value": {"type": "number"},
            },
            "required": ["name"],
        }

    def test_none_mode_always_compatible(self):
        old = self._base_schema()
        new = {"type": "object", "properties": {}}  # totally different
        result = check_compatibility(old, new, CompatibilityMode.NONE)
        assert result.compatible is True
        assert result.mode == CompatibilityMode.NONE

    def test_backward_adding_optional_field(self):
        old = self._base_schema()
        new = {**old, "properties": {**old["properties"], "extra": {"type": "string"}}}
        result = check_compatibility(old, new, CompatibilityMode.BACKWARD)
        assert result.compatible is True

    def test_backward_adding_required_field_fails(self):
        old = self._base_schema()
        new = {
            "type": "object",
            "properties": {
                **old["properties"],
                "extra": {"type": "string"},
            },
            "required": ["name", "extra"],
        }
        result = check_compatibility(old, new, CompatibilityMode.BACKWARD)
        assert result.compatible is False
        assert any("BACKWARD" in e for e in result.errors)

    def test_backward_type_change_fails(self):
        old = self._base_schema()
        new = {
            "type": "object",
            "properties": {
                "name": {"type": "integer"},
                "value": {"type": "number"},
            },
            "required": ["name"],
        }
        result = check_compatibility(old, new, CompatibilityMode.BACKWARD)
        assert result.compatible is False

    def test_forward_removing_field_fails(self):
        old = self._base_schema()
        new = {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"],
        }
        result = check_compatibility(old, new, CompatibilityMode.FORWARD)
        assert result.compatible is False
        assert any("FORWARD" in e for e in result.errors)

    def test_forward_adding_optional_field(self):
        old = self._base_schema()
        new = {**old, "properties": {**old["properties"], "extra": {"type": "string"}}}
        result = check_compatibility(old, new, CompatibilityMode.FORWARD)
        assert result.compatible is True

    def test_full_adding_required_field_fails(self):
        old = self._base_schema()
        new = {
            "type": "object",
            "properties": {**old["properties"], "extra": {"type": "string"}},
            "required": ["name", "extra"],
        }
        result = check_compatibility(old, new, CompatibilityMode.FULL)
        assert result.compatible is False

    def test_full_removing_field_fails(self):
        old = self._base_schema()
        new = {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"],
        }
        result = check_compatibility(old, new, CompatibilityMode.FULL)
        assert result.compatible is False

    def test_full_adding_optional_field(self):
        old = self._base_schema()
        new = {**old, "properties": {**old["properties"], "extra": {"type": "string"}}}
        result = check_compatibility(old, new, CompatibilityMode.FULL)
        assert result.compatible is True

    def test_identical_schemas_always_compatible(self):
        schema = self._base_schema()
        for mode in CompatibilityMode:
            result = check_compatibility(schema, schema, mode)
            assert result.compatible is True, f"Failed for mode {mode}"

    def test_result_includes_diffs(self):
        old = self._base_schema()
        new = {**old, "properties": {**old["properties"], "extra": {"type": "string"}}}
        result = check_compatibility(old, new, CompatibilityMode.BACKWARD)
        assert len(result.diffs) == 1
        assert result.diff_summary[0] == "Field 'extra' was added"
