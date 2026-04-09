"""Tests for the WriteValidator.

Covers:
- Tag config registry (register, unregister, lookup)
- Valid writes pass through
- Missing config → REJECTED_VALIDATION
- Non-writable tag → REJECTED_VALIDATION
- Type coercion failures → REJECTED_VALIDATION
- Range violations (below min, above max)
- All data types (BOOLEAN, INT16, INT32, INT64, FLOAT, DOUBLE, STRING)
"""

import pytest

from forge.modules.ot.control.models import (
    DataType,
    TagWriteConfig,
    WriteRequest,
    WriteResult,
    WriteRole,
    WriteStatus,
)
from forge.modules.ot.control.validation import WriteValidator


@pytest.fixture
def validator() -> WriteValidator:
    v = WriteValidator()
    v.register_tag(TagWriteConfig(
        tag_path="WH/WHK01/Distillery01/TIT_2010/SP",
        data_type=DataType.FLOAT,
        min_value=0.0,
        max_value=200.0,
        engineering_units="°F",
    ))
    v.register_tag(TagWriteConfig(
        tag_path="WH/WHK01/Distillery01/Valve01/Open",
        data_type=DataType.BOOLEAN,
    ))
    v.register_tag(TagWriteConfig(
        tag_path="WH/WHK01/Distillery01/Counter/Value",
        data_type=DataType.INT32,
        min_value=-1000,
        max_value=1000,
    ))
    v.register_tag(TagWriteConfig(
        tag_path="WH/WHK01/Readonly/Tag",
        data_type=DataType.FLOAT,
        writable=False,
    ))
    return v


def _make_request(tag_path: str = "WH/WHK01/Distillery01/TIT_2010/SP", value=100.0, **kw):
    return WriteRequest(tag_path=tag_path, value=value, **kw)


def _make_result(request: WriteRequest) -> WriteResult:
    return WriteResult(request=request)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


class TestRegistry:
    def test_register_and_get(self, validator: WriteValidator):
        config = validator.get_config("WH/WHK01/Distillery01/TIT_2010/SP")
        assert config is not None
        assert config.data_type == DataType.FLOAT

    def test_get_nonexistent(self, validator: WriteValidator):
        assert validator.get_config("does/not/exist") is None

    def test_unregister(self, validator: WriteValidator):
        assert validator.unregister_tag("WH/WHK01/Distillery01/TIT_2010/SP") is True
        assert validator.get_config("WH/WHK01/Distillery01/TIT_2010/SP") is None

    def test_unregister_nonexistent(self, validator: WriteValidator):
        assert validator.unregister_tag("nope") is False

    def test_get_all(self, validator: WriteValidator):
        assert len(validator.get_all_configs()) == 4

    def test_tag_count(self, validator: WriteValidator):
        assert validator.tag_count == 4

    def test_replace_existing(self, validator: WriteValidator):
        new_config = TagWriteConfig(
            tag_path="WH/WHK01/Distillery01/TIT_2010/SP",
            data_type=DataType.DOUBLE,
            min_value=0.0,
            max_value=500.0,
        )
        validator.register_tag(new_config)
        config = validator.get_config("WH/WHK01/Distillery01/TIT_2010/SP")
        assert config.data_type == DataType.DOUBLE
        assert config.max_value == 500.0
        assert validator.tag_count == 4  # No duplicates


# ---------------------------------------------------------------------------
# Valid writes
# ---------------------------------------------------------------------------


class TestValidWrites:
    def test_float_in_range(self, validator: WriteValidator):
        req = _make_request(value=100.0)
        result = validator.validate(req, _make_result(req))
        assert result.validation_passed is True
        assert result.status == WriteStatus.PENDING  # Not mutated

    def test_float_at_min(self, validator: WriteValidator):
        req = _make_request(value=0.0)
        result = validator.validate(req, _make_result(req))
        assert result.validation_passed is True

    def test_float_at_max(self, validator: WriteValidator):
        req = _make_request(value=200.0)
        result = validator.validate(req, _make_result(req))
        assert result.validation_passed is True

    def test_boolean_true(self, validator: WriteValidator):
        req = _make_request(tag_path="WH/WHK01/Distillery01/Valve01/Open", value=True)
        result = validator.validate(req, _make_result(req))
        assert result.validation_passed is True

    def test_boolean_false(self, validator: WriteValidator):
        req = _make_request(tag_path="WH/WHK01/Distillery01/Valve01/Open", value=False)
        result = validator.validate(req, _make_result(req))
        assert result.validation_passed is True

    def test_int32_in_range(self, validator: WriteValidator):
        req = _make_request(
            tag_path="WH/WHK01/Distillery01/Counter/Value",
            value=500,
            data_type=DataType.INT32,
        )
        result = validator.validate(req, _make_result(req))
        assert result.validation_passed is True


# ---------------------------------------------------------------------------
# Rejections
# ---------------------------------------------------------------------------


class TestRejections:
    def test_missing_config(self, validator: WriteValidator):
        req = _make_request(tag_path="unknown/tag")
        result = validator.validate(req, _make_result(req))
        assert result.validation_passed is False
        assert result.status == WriteStatus.REJECTED_VALIDATION
        assert "No write config" in result.validation_error

    def test_not_writable(self, validator: WriteValidator):
        req = _make_request(tag_path="WH/WHK01/Readonly/Tag", value=50.0)
        result = validator.validate(req, _make_result(req))
        assert result.validation_passed is False
        assert result.status == WriteStatus.REJECTED_VALIDATION
        assert "not writable" in result.validation_error

    def test_below_min(self, validator: WriteValidator):
        req = _make_request(value=-1.0)
        result = validator.validate(req, _make_result(req))
        assert result.validation_passed is False
        assert result.status == WriteStatus.REJECTED_VALIDATION
        assert "below minimum" in result.validation_error

    def test_above_max(self, validator: WriteValidator):
        req = _make_request(value=201.0)
        result = validator.validate(req, _make_result(req))
        assert result.validation_passed is False
        assert result.status == WriteStatus.REJECTED_VALIDATION
        assert "above maximum" in result.validation_error

    def test_type_coercion_failure(self, validator: WriteValidator):
        req = _make_request(
            tag_path="WH/WHK01/Distillery01/Counter/Value",
            value="not_a_number",
            data_type=DataType.INT32,
        )
        result = validator.validate(req, _make_result(req))
        assert result.validation_passed is False
        assert result.status == WriteStatus.REJECTED_VALIDATION
        assert "Type error" in result.validation_error

    def test_int16_overflow(self):
        """INT16 can't hold values > 32767."""
        v = WriteValidator()
        v.register_tag(TagWriteConfig(
            tag_path="t/int16",
            data_type=DataType.INT16,
        ))
        req = WriteRequest(tag_path="t/int16", value=40000, data_type=DataType.INT16)
        result = v.validate(req, WriteResult(request=req))
        assert result.validation_passed is False
        assert result.status == WriteStatus.REJECTED_VALIDATION
