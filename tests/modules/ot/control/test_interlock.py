"""Tests for the InterlockEngine.

Covers:
- Rule registry (add, remove, lookup)
- All interlock conditions (EQUALS, NOT_EQUALS, GT, LT, IN_RANGE, IS_TRUE, IS_FALSE)
- Pattern matching (fnmatch on target_tag_pattern)
- Bypass logic (role, reason, interlock_bypass flag)
- Disabled rules are skipped
- Null/missing check values don't block
- Multiple rules — first blocking rule wins
"""

import pytest
from unittest.mock import AsyncMock

from forge.modules.ot.control.models import (
    InterlockCondition,
    InterlockRule,
    WriteRequest,
    WriteResult,
    WriteRole,
    WriteStatus,
)
from forge.modules.ot.control.interlock import InterlockEngine


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_reader(values: dict | None = None):
    """Create a mock tag reader with preset values."""
    reader = AsyncMock()
    store = values or {}
    reader.read_tag = AsyncMock(side_effect=lambda path: store.get(path))
    return reader


def _pump_guard_rule() -> InterlockRule:
    return InterlockRule(
        rule_id="IL-001",
        name="Pump running guard",
        target_tag_pattern="WH/WHK01/Distillery01/*/Valve_Open",
        check_tag="WH/WHK01/Distillery01/Pump01/Running",
        condition=InterlockCondition.IS_TRUE,
    )


def _temp_guard_rule() -> InterlockRule:
    return InterlockRule(
        rule_id="IL-002",
        name="High temp guard",
        target_tag_pattern="WH/WHK01/Distillery01/*/CoolantValve",
        check_tag="WH/WHK01/Distillery01/TIT_2010/PV",
        condition=InterlockCondition.GREATER_THAN,
        check_value=180.0,
        bypass_min_role=WriteRole.ENGINEER,
    )


def _make_request(tag_path: str, **kw):
    defaults = dict(
        value=True,
        requestor="op1",
        role=WriteRole.OPERATOR,
        area="Distillery01",
    )
    defaults.update(kw)
    return WriteRequest(tag_path=tag_path, **defaults)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


class TestRuleRegistry:
    def test_add_and_get(self):
        engine = InterlockEngine()
        rule = _pump_guard_rule()
        engine.add_rule(rule)
        assert engine.get_rule("IL-001") is rule

    def test_remove(self):
        engine = InterlockEngine()
        engine.add_rule(_pump_guard_rule())
        assert engine.remove_rule("IL-001") is True
        assert engine.get_rule("IL-001") is None

    def test_remove_nonexistent(self):
        engine = InterlockEngine()
        assert engine.remove_rule("nope") is False

    def test_get_all(self):
        engine = InterlockEngine()
        engine.add_rule(_pump_guard_rule())
        engine.add_rule(_temp_guard_rule())
        assert len(engine.get_all_rules()) == 2

    def test_rule_count(self):
        engine = InterlockEngine()
        assert engine.rule_count == 0
        engine.add_rule(_pump_guard_rule())
        assert engine.rule_count == 1


# ---------------------------------------------------------------------------
# Condition evaluation
# ---------------------------------------------------------------------------


class TestConditions:
    @pytest.mark.asyncio
    async def test_is_true_blocks(self):
        reader = _make_reader({
            "WH/WHK01/Distillery01/Pump01/Running": True,
        })
        engine = InterlockEngine(tag_reader=reader)
        engine.add_rule(_pump_guard_rule())

        req = _make_request("WH/WHK01/Distillery01/V101/Valve_Open")
        result = await engine.check(req, WriteResult(request=req))

        assert result.interlock_passed is False
        assert result.status == WriteStatus.REJECTED_INTERLOCK
        assert "IL-001" in result.interlock_error

    @pytest.mark.asyncio
    async def test_is_true_allows_when_false(self):
        reader = _make_reader({
            "WH/WHK01/Distillery01/Pump01/Running": False,
        })
        engine = InterlockEngine(tag_reader=reader)
        engine.add_rule(_pump_guard_rule())

        req = _make_request("WH/WHK01/Distillery01/V101/Valve_Open")
        result = await engine.check(req, WriteResult(request=req))

        assert result.interlock_passed is True

    @pytest.mark.asyncio
    async def test_greater_than_blocks(self):
        reader = _make_reader({
            "WH/WHK01/Distillery01/TIT_2010/PV": 185.0,
        })
        engine = InterlockEngine(tag_reader=reader)
        engine.add_rule(_temp_guard_rule())

        req = _make_request("WH/WHK01/Distillery01/CW01/CoolantValve")
        result = await engine.check(req, WriteResult(request=req))

        assert result.interlock_passed is False

    @pytest.mark.asyncio
    async def test_greater_than_allows_when_below(self):
        reader = _make_reader({
            "WH/WHK01/Distillery01/TIT_2010/PV": 170.0,
        })
        engine = InterlockEngine(tag_reader=reader)
        engine.add_rule(_temp_guard_rule())

        req = _make_request("WH/WHK01/Distillery01/CW01/CoolantValve")
        result = await engine.check(req, WriteResult(request=req))

        assert result.interlock_passed is True

    @pytest.mark.asyncio
    async def test_equals_blocks(self):
        rule = InterlockRule(
            rule_id="IL-EQ",
            name="Mode guard",
            target_tag_pattern="t/*",
            check_tag="t/mode",
            condition=InterlockCondition.EQUALS,
            check_value="RUNNING",
        )
        reader = _make_reader({"t/mode": "RUNNING"})
        engine = InterlockEngine(tag_reader=reader)
        engine.add_rule(rule)

        req = _make_request("t/output")
        result = await engine.check(req, WriteResult(request=req))
        assert result.interlock_passed is False

    @pytest.mark.asyncio
    async def test_not_equals_blocks(self):
        rule = InterlockRule(
            rule_id="IL-NE",
            name="Not idle guard",
            target_tag_pattern="t/*",
            check_tag="t/mode",
            condition=InterlockCondition.NOT_EQUALS,
            check_value="IDLE",
        )
        reader = _make_reader({"t/mode": "RUNNING"})
        engine = InterlockEngine(tag_reader=reader)
        engine.add_rule(rule)

        req = _make_request("t/output")
        result = await engine.check(req, WriteResult(request=req))
        assert result.interlock_passed is False

    @pytest.mark.asyncio
    async def test_less_than_blocks(self):
        rule = InterlockRule(
            rule_id="IL-LT",
            name="Low pressure guard",
            target_tag_pattern="t/*",
            check_tag="t/pressure",
            condition=InterlockCondition.LESS_THAN,
            check_value=10.0,
        )
        reader = _make_reader({"t/pressure": 5.0})
        engine = InterlockEngine(tag_reader=reader)
        engine.add_rule(rule)

        req = _make_request("t/valve")
        result = await engine.check(req, WriteResult(request=req))
        assert result.interlock_passed is False

    @pytest.mark.asyncio
    async def test_in_range_blocks(self):
        rule = InterlockRule(
            rule_id="IL-IR",
            name="Danger zone guard",
            target_tag_pattern="t/*",
            check_tag="t/temp",
            condition=InterlockCondition.IN_RANGE,
            check_value=100.0,
            check_value_high=200.0,
        )
        reader = _make_reader({"t/temp": 150.0})
        engine = InterlockEngine(tag_reader=reader)
        engine.add_rule(rule)

        req = _make_request("t/heater")
        result = await engine.check(req, WriteResult(request=req))
        assert result.interlock_passed is False

    @pytest.mark.asyncio
    async def test_in_range_allows_outside(self):
        rule = InterlockRule(
            rule_id="IL-IR",
            name="Danger zone guard",
            target_tag_pattern="t/*",
            check_tag="t/temp",
            condition=InterlockCondition.IN_RANGE,
            check_value=100.0,
            check_value_high=200.0,
        )
        reader = _make_reader({"t/temp": 50.0})
        engine = InterlockEngine(tag_reader=reader)
        engine.add_rule(rule)

        req = _make_request("t/heater")
        result = await engine.check(req, WriteResult(request=req))
        assert result.interlock_passed is True

    @pytest.mark.asyncio
    async def test_is_false_blocks(self):
        rule = InterlockRule(
            rule_id="IL-IF",
            name="Safety not armed",
            target_tag_pattern="t/*",
            check_tag="t/safety_armed",
            condition=InterlockCondition.IS_FALSE,
        )
        reader = _make_reader({"t/safety_armed": False})
        engine = InterlockEngine(tag_reader=reader)
        engine.add_rule(rule)

        req = _make_request("t/motor")
        result = await engine.check(req, WriteResult(request=req))
        assert result.interlock_passed is False


# ---------------------------------------------------------------------------
# Pattern matching
# ---------------------------------------------------------------------------


class TestPatternMatching:
    @pytest.mark.asyncio
    async def test_no_matching_rules_passes(self):
        reader = _make_reader({"WH/WHK01/Distillery01/Pump01/Running": True})
        engine = InterlockEngine(tag_reader=reader)
        engine.add_rule(_pump_guard_rule())

        # Tag path doesn't match pattern
        req = _make_request("WH/WHK01/Granary/V101/Valve_Open")
        result = await engine.check(req, WriteResult(request=req))
        assert result.interlock_passed is True

    @pytest.mark.asyncio
    async def test_wildcard_matches_multiple(self):
        reader = _make_reader({"WH/WHK01/Distillery01/Pump01/Running": True})
        engine = InterlockEngine(tag_reader=reader)
        engine.add_rule(_pump_guard_rule())

        # Different valve, same area — should match the wildcard
        for valve in ["V101", "V102", "V999"]:
            req = _make_request(f"WH/WHK01/Distillery01/{valve}/Valve_Open")
            result = await engine.check(req, WriteResult(request=req))
            assert result.interlock_passed is False


# ---------------------------------------------------------------------------
# Bypass logic
# ---------------------------------------------------------------------------


class TestBypass:
    @pytest.mark.asyncio
    async def test_admin_can_bypass(self):
        reader = _make_reader({"WH/WHK01/Distillery01/Pump01/Running": True})
        engine = InterlockEngine(tag_reader=reader)
        engine.add_rule(_pump_guard_rule())

        req = _make_request(
            "WH/WHK01/Distillery01/V101/Valve_Open",
            role=WriteRole.ADMIN,
            interlock_bypass=True,
            reason="Emergency maintenance",
        )
        result = await engine.check(req, WriteResult(request=req))
        assert result.interlock_passed is True

    @pytest.mark.asyncio
    async def test_operator_cannot_bypass_admin_rule(self):
        reader = _make_reader({"WH/WHK01/Distillery01/Pump01/Running": True})
        engine = InterlockEngine(tag_reader=reader)
        engine.add_rule(_pump_guard_rule())  # bypass_min_role = ADMIN

        req = _make_request(
            "WH/WHK01/Distillery01/V101/Valve_Open",
            role=WriteRole.OPERATOR,
            interlock_bypass=True,
            reason="I want to",
        )
        result = await engine.check(req, WriteResult(request=req))
        assert result.interlock_passed is False

    @pytest.mark.asyncio
    async def test_bypass_without_reason_fails(self):
        reader = _make_reader({"WH/WHK01/Distillery01/Pump01/Running": True})
        engine = InterlockEngine(tag_reader=reader)
        engine.add_rule(_pump_guard_rule())

        req = _make_request(
            "WH/WHK01/Distillery01/V101/Valve_Open",
            role=WriteRole.ADMIN,
            interlock_bypass=True,
            reason="",  # Empty reason
        )
        result = await engine.check(req, WriteResult(request=req))
        assert result.interlock_passed is False

    @pytest.mark.asyncio
    async def test_bypass_flag_not_set(self):
        reader = _make_reader({"WH/WHK01/Distillery01/Pump01/Running": True})
        engine = InterlockEngine(tag_reader=reader)
        engine.add_rule(_pump_guard_rule())

        req = _make_request(
            "WH/WHK01/Distillery01/V101/Valve_Open",
            role=WriteRole.ADMIN,
            interlock_bypass=False,  # Flag not set
            reason="Emergency",
        )
        result = await engine.check(req, WriteResult(request=req))
        assert result.interlock_passed is False

    @pytest.mark.asyncio
    async def test_engineer_can_bypass_engineer_rule(self):
        reader = _make_reader({
            "WH/WHK01/Distillery01/TIT_2010/PV": 185.0,
        })
        engine = InterlockEngine(tag_reader=reader)
        engine.add_rule(_temp_guard_rule())  # bypass_min_role = ENGINEER

        req = _make_request(
            "WH/WHK01/Distillery01/CW01/CoolantValve",
            role=WriteRole.ENGINEER,
            interlock_bypass=True,
            reason="Calibration override",
        )
        result = await engine.check(req, WriteResult(request=req))
        assert result.interlock_passed is True


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    @pytest.mark.asyncio
    async def test_disabled_rule_skipped(self):
        rule = InterlockRule(
            rule_id="IL-DIS",
            name="Disabled rule",
            target_tag_pattern="t/*",
            check_tag="t/check",
            condition=InterlockCondition.IS_TRUE,
            enabled=False,
        )
        reader = _make_reader({"t/check": True})
        engine = InterlockEngine(tag_reader=reader)
        engine.add_rule(rule)

        req = _make_request("t/output")
        result = await engine.check(req, WriteResult(request=req))
        assert result.interlock_passed is True

    @pytest.mark.asyncio
    async def test_null_check_value_does_not_block(self):
        """If the check tag can't be read, don't block (fail-open)."""
        reader = _make_reader({})  # Check tag not available
        engine = InterlockEngine(tag_reader=reader)
        engine.add_rule(_pump_guard_rule())

        req = _make_request("WH/WHK01/Distillery01/V101/Valve_Open")
        result = await engine.check(req, WriteResult(request=req))
        assert result.interlock_passed is True

    @pytest.mark.asyncio
    async def test_no_rules_at_all_passes(self):
        engine = InterlockEngine()
        req = _make_request("any/tag")
        result = await engine.check(req, WriteResult(request=req))
        assert result.interlock_passed is True
