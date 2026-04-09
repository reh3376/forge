"""Tests for control write data models.

Covers:
- WriteStatus, WriteRole, DataType enums
- WriteRole hierarchy and has_authority_over
- WriteRequest immutability
- WriteResult.to_dict() serialization
- TagWriteConfig.validate_value() for each data type
- Type coercion edge cases
"""

import pytest

from forge.modules.ot.control.models import (
    DataType,
    InterlockCondition,
    InterlockRule,
    TagWriteConfig,
    WritePermission,
    WriteRequest,
    WriteResult,
    WriteRole,
    WriteStatus,
)


# ---------------------------------------------------------------------------
# WriteRole
# ---------------------------------------------------------------------------


class TestWriteRole:
    def test_rank_ordering(self):
        assert WriteRole.OPERATOR.rank < WriteRole.ENGINEER.rank
        assert WriteRole.ENGINEER.rank < WriteRole.ADMIN.rank

    def test_admin_has_authority_over_all(self):
        assert WriteRole.ADMIN.has_authority_over(WriteRole.ADMIN) is True
        assert WriteRole.ADMIN.has_authority_over(WriteRole.ENGINEER) is True
        assert WriteRole.ADMIN.has_authority_over(WriteRole.OPERATOR) is True

    def test_operator_only_over_self(self):
        assert WriteRole.OPERATOR.has_authority_over(WriteRole.OPERATOR) is True
        assert WriteRole.OPERATOR.has_authority_over(WriteRole.ENGINEER) is False
        assert WriteRole.OPERATOR.has_authority_over(WriteRole.ADMIN) is False

    def test_engineer_over_operator(self):
        assert WriteRole.ENGINEER.has_authority_over(WriteRole.OPERATOR) is True
        assert WriteRole.ENGINEER.has_authority_over(WriteRole.ENGINEER) is True
        assert WriteRole.ENGINEER.has_authority_over(WriteRole.ADMIN) is False


# ---------------------------------------------------------------------------
# WriteRequest
# ---------------------------------------------------------------------------


class TestWriteRequest:
    def test_frozen(self):
        req = WriteRequest(tag_path="t/tag", value=42)
        with pytest.raises(AttributeError):
            req.tag_path = "changed"  # type: ignore

    def test_auto_id(self):
        r1 = WriteRequest(tag_path="t", value=1)
        r2 = WriteRequest(tag_path="t", value=2)
        assert r1.request_id != r2.request_id

    def test_defaults(self):
        req = WriteRequest(tag_path="t", value=1)
        assert req.data_type == DataType.FLOAT
        assert req.role == WriteRole.OPERATOR
        assert req.interlock_bypass is False


# ---------------------------------------------------------------------------
# WriteResult.to_dict
# ---------------------------------------------------------------------------


class TestWriteResultDict:
    def test_to_dict_includes_all_fields(self):
        req = WriteRequest(tag_path="t/tag", value=100.0, requestor="op1")
        result = WriteResult(request=req, status=WriteStatus.CONFIRMED)
        d = result.to_dict()

        assert d["tag_path"] == "t/tag"
        assert d["requested_value"] == 100.0
        assert d["requestor"] == "op1"
        assert d["status"] == "CONFIRMED"
        assert "timestamp" in d
        assert "request_id" in d

    def test_to_dict_completed_at_none(self):
        req = WriteRequest(tag_path="t", value=1)
        result = WriteResult(request=req)
        d = result.to_dict()
        assert d["completed_at"] is None


# ---------------------------------------------------------------------------
# TagWriteConfig.validate_value
# ---------------------------------------------------------------------------


class TestTagWriteConfigValidation:
    def test_float_in_range(self):
        cfg = TagWriteConfig(tag_path="t", data_type=DataType.FLOAT, min_value=0, max_value=100)
        ok, err = cfg.validate_value(50.0)
        assert ok is True
        assert err == ""

    def test_float_below_min(self):
        cfg = TagWriteConfig(tag_path="t", data_type=DataType.FLOAT, min_value=0, max_value=100)
        ok, err = cfg.validate_value(-1.0)
        assert ok is False
        assert "below minimum" in err

    def test_float_above_max(self):
        cfg = TagWriteConfig(tag_path="t", data_type=DataType.FLOAT, min_value=0, max_value=100)
        ok, err = cfg.validate_value(101.0)
        assert ok is False
        assert "above maximum" in err

    def test_not_writable(self):
        cfg = TagWriteConfig(tag_path="t", writable=False)
        ok, err = cfg.validate_value(1.0)
        assert ok is False
        assert "not writable" in err

    def test_boolean_always_valid(self):
        cfg = TagWriteConfig(tag_path="t", data_type=DataType.BOOLEAN)
        ok, _ = cfg.validate_value(True)
        assert ok is True
        ok, _ = cfg.validate_value(False)
        assert ok is True

    def test_string_always_valid(self):
        cfg = TagWriteConfig(tag_path="t", data_type=DataType.STRING)
        ok, _ = cfg.validate_value("hello")
        assert ok is True

    def test_int16_overflow(self):
        cfg = TagWriteConfig(tag_path="t", data_type=DataType.INT16)
        ok, err = cfg.validate_value(40000)
        assert ok is False
        assert "Type error" in err

    def test_int32_valid(self):
        cfg = TagWriteConfig(tag_path="t", data_type=DataType.INT32, min_value=-100, max_value=100)
        ok, _ = cfg.validate_value(50)
        assert ok is True

    def test_float_coercion_from_int(self):
        cfg = TagWriteConfig(tag_path="t", data_type=DataType.FLOAT, min_value=0, max_value=100)
        ok, _ = cfg.validate_value(50)  # int → float
        assert ok is True

    def test_no_range_limits(self):
        """Float with no min/max — any numeric value is valid."""
        cfg = TagWriteConfig(tag_path="t", data_type=DataType.FLOAT)
        ok, _ = cfg.validate_value(999999.0)
        assert ok is True

    def test_type_error_string_to_int(self):
        cfg = TagWriteConfig(tag_path="t", data_type=DataType.INT32)
        ok, err = cfg.validate_value("not_a_number")
        assert ok is False
        assert "Type error" in err


# ---------------------------------------------------------------------------
# InterlockRule
# ---------------------------------------------------------------------------


class TestInterlockRule:
    def test_frozen(self):
        rule = InterlockRule(
            rule_id="r1", name="test",
            target_tag_pattern="*", check_tag="t",
            condition=InterlockCondition.IS_TRUE,
        )
        with pytest.raises(AttributeError):
            rule.rule_id = "changed"  # type: ignore


# ---------------------------------------------------------------------------
# WritePermission
# ---------------------------------------------------------------------------


class TestWritePermission:
    def test_frozen(self):
        perm = WritePermission()
        with pytest.raises(AttributeError):
            perm.area_pattern = "changed"  # type: ignore

    def test_auto_id(self):
        p1 = WritePermission()
        p2 = WritePermission()
        assert p1.permission_id != p2.permission_id


# ---------------------------------------------------------------------------
# DataType enum
# ---------------------------------------------------------------------------


class TestDataType:
    def test_all_values(self):
        expected = {"BOOLEAN", "INT16", "INT32", "INT64", "FLOAT", "DOUBLE", "STRING"}
        assert {dt.value for dt in DataType} == expected


# ---------------------------------------------------------------------------
# WriteStatus enum
# ---------------------------------------------------------------------------


class TestWriteStatus:
    def test_all_values(self):
        expected = {
            "CONFIRMED", "UNCONFIRMED", "REJECTED_VALIDATION",
            "REJECTED_INTERLOCK", "REJECTED_AUTH", "FAILED_WRITE",
            "FAILED_READBACK", "PENDING",
        }
        assert {ws.value for ws in WriteStatus} == expected
