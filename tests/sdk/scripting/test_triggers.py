"""Tests for the trigger system — decorators, pattern matching, registry."""

import pytest
from datetime import timedelta
from types import ModuleType

from forge.sdk.scripting.triggers import (
    HandlerRegistration,
    TagChangeEvent,
    AlarmEvent,
    LifecycleEvent,
    TriggerRegistry,
    TriggerType,
    _match_tag_pattern,
    _parse_interval,
    on_tag_change,
    timer,
    on_event,
    on_alarm,
    api,
    _HANDLER_ATTR,
)


# ---------------------------------------------------------------------------
# _parse_interval
# ---------------------------------------------------------------------------


class TestParseInterval:

    def test_seconds(self):
        assert _parse_interval("5s") == timedelta(seconds=5)

    def test_milliseconds(self):
        assert _parse_interval("100ms") == timedelta(milliseconds=100)

    def test_minutes(self):
        assert _parse_interval("1m") == timedelta(minutes=1)

    def test_hours(self):
        assert _parse_interval("0.5h") == timedelta(hours=0.5)

    def test_compound(self):
        assert _parse_interval("1h30m") == timedelta(hours=1, minutes=30)

    def test_compound_minutes_seconds(self):
        assert _parse_interval("2m30s") == timedelta(minutes=2, seconds=30)

    def test_invalid_raises(self):
        with pytest.raises(ValueError, match="Cannot parse"):
            _parse_interval("bogus")


# ---------------------------------------------------------------------------
# _match_tag_pattern
# ---------------------------------------------------------------------------


class TestMatchTagPattern:

    def test_exact_match(self):
        assert _match_tag_pattern("WH/WHK01/Distillery01/TIT_2010/Out_PV",
                                  "WH/WHK01/Distillery01/TIT_2010/Out_PV")

    def test_single_wildcard(self):
        assert _match_tag_pattern("WH/WHK01/*/TIT_2010/Out_PV",
                                  "WH/WHK01/Distillery01/TIT_2010/Out_PV")

    def test_single_wildcard_no_deep_match(self):
        """Single * should NOT match across slashes."""
        assert not _match_tag_pattern("WH/*/Out_PV",
                                       "WH/WHK01/Distillery01/TIT_2010/Out_PV")

    def test_double_wildcard(self):
        assert _match_tag_pattern("WH/**",
                                  "WH/WHK01/Distillery01/TIT_2010/Out_PV")

    def test_double_wildcard_middle(self):
        assert _match_tag_pattern("WH/**/Out_PV",
                                  "WH/WHK01/Distillery01/TIT_2010/Out_PV")

    def test_combined_wildcards(self):
        assert _match_tag_pattern("WH/*/Distillery01/**",
                                  "WH/WHK01/Distillery01/TIT_2010/Out_PV")

    def test_no_match(self):
        assert not _match_tag_pattern("WH/WHK01/Granary01/**",
                                       "WH/WHK01/Distillery01/TIT_2010/Out_PV")

    def test_empty_pattern_no_match(self):
        assert not _match_tag_pattern("", "WH/WHK01/TIT_2010/Out_PV")


# ---------------------------------------------------------------------------
# Decorators
# ---------------------------------------------------------------------------


class TestDecorators:

    def test_on_tag_change_marks_function(self):
        @on_tag_change("WH/**")
        async def handler(event):
            pass

        assert hasattr(handler, _HANDLER_ATTR)
        regs = getattr(handler, _HANDLER_ATTR)
        assert len(regs) == 1
        assert regs[0].trigger_type == TriggerType.TAG_CHANGE
        assert regs[0].tag_pattern == "WH/**"

    def test_timer_marks_function(self):
        @timer("30s", name="check")
        async def handler():
            pass

        regs = getattr(handler, _HANDLER_ATTR)
        assert regs[0].trigger_type == TriggerType.TIMER
        assert regs[0].interval == timedelta(seconds=30)

    def test_on_event_marks_function(self):
        @on_event("startup", "shutdown")
        async def handler(event):
            pass

        regs = getattr(handler, _HANDLER_ATTR)
        assert regs[0].trigger_type == TriggerType.EVENT
        assert regs[0].event_types == ["startup", "shutdown"]

    def test_on_alarm_marks_function(self):
        @on_alarm(priorities=["CRITICAL"], areas=["Distillery01"])
        async def handler(event):
            pass

        regs = getattr(handler, _HANDLER_ATTR)
        assert regs[0].trigger_type == TriggerType.ALARM
        assert regs[0].alarm_priorities == ["CRITICAL"]
        assert regs[0].alarm_areas == ["Distillery01"]

    def test_api_route_marks_function(self):
        @api.route("/status", method="GET")
        async def handler(request):
            pass

        regs = getattr(handler, _HANDLER_ATTR)
        assert regs[0].trigger_type == TriggerType.API_ROUTE
        assert regs[0].route_path == "/status"
        assert regs[0].http_method == "GET"

    def test_multiple_decorators_on_same_function(self):
        @on_tag_change("WH/**")
        @on_event("startup")
        async def handler(event):
            pass

        regs = getattr(handler, _HANDLER_ATTR)
        assert len(regs) == 2

    def test_decorator_preserves_function(self):
        """Decorated function is still callable and unchanged."""

        @on_tag_change("WH/**")
        def my_handler(event):
            return 42

        assert my_handler(None) == 42


# ---------------------------------------------------------------------------
# TriggerRegistry
# ---------------------------------------------------------------------------


class TestTriggerRegistry:

    def _make_module_with_handlers(self):
        """Create a mock module with decorated functions."""
        mod = ModuleType("test_script")

        @on_tag_change("WH/WHK01/Distillery01/*/Out_PV")
        async def on_temp(event):
            pass

        @timer("30s")
        async def check_temps():
            pass

        @on_event("startup")
        async def on_startup(event):
            pass

        mod.on_temp = on_temp
        mod.check_temps = check_temps
        mod.on_startup = on_startup
        return mod

    def test_collect_from_module(self):
        registry = TriggerRegistry()
        mod = self._make_module_with_handlers()
        count = registry.collect_from_module(mod, script_name="test")
        assert count == 3
        assert registry.count == 3

    def test_get_by_type(self):
        registry = TriggerRegistry()
        mod = self._make_module_with_handlers()
        registry.collect_from_module(mod, script_name="test")
        tag_handlers = registry.get_by_type(TriggerType.TAG_CHANGE)
        assert len(tag_handlers) == 1
        timer_handlers = registry.get_by_type(TriggerType.TIMER)
        assert len(timer_handlers) == 1

    def test_get_tag_change_handlers_matching(self):
        registry = TriggerRegistry()
        mod = self._make_module_with_handlers()
        registry.collect_from_module(mod, script_name="test")
        matches = registry.get_tag_change_handlers("WH/WHK01/Distillery01/TIT_2010/Out_PV")
        assert len(matches) == 1

    def test_get_tag_change_handlers_no_match(self):
        registry = TriggerRegistry()
        mod = self._make_module_with_handlers()
        registry.collect_from_module(mod, script_name="test")
        matches = registry.get_tag_change_handlers("WH/WHK01/Granary01/FIT_1010/Out_PV")
        assert len(matches) == 0

    def test_clear(self):
        registry = TriggerRegistry()
        mod = self._make_module_with_handlers()
        registry.collect_from_module(mod, script_name="test")
        registry.clear()
        assert registry.count == 0

    def test_clear_script(self):
        registry = TriggerRegistry()
        mod = self._make_module_with_handlers()
        registry.collect_from_module(mod, script_name="script_a")

        mod2 = ModuleType("other")

        @on_tag_change("WH/**")
        async def other_handler(event):
            pass

        mod2.other_handler = other_handler
        registry.collect_from_module(mod2, script_name="script_b")

        assert registry.count == 4
        removed = registry.clear_script("script_a")
        assert removed == 3
        assert registry.count == 1

    def test_get_alarm_handlers_filter_priority(self):
        registry = TriggerRegistry()
        mod = ModuleType("alarm_script")

        @on_alarm(priorities=["CRITICAL"])
        async def critical_handler(event):
            pass

        @on_alarm(priorities=["LOW"])
        async def low_handler(event):
            pass

        mod.critical_handler = critical_handler
        mod.low_handler = low_handler
        registry.collect_from_module(mod, script_name="alarms")

        matches = registry.get_alarm_handlers(priority="CRITICAL")
        assert len(matches) == 1
        assert matches[0].handler_name == "critical_handler"

    def test_get_alarm_handlers_no_filter_matches_all(self):
        registry = TriggerRegistry()
        mod = ModuleType("alarm_script")

        @on_alarm()
        async def catch_all(event):
            pass

        mod.catch_all = catch_all
        registry.collect_from_module(mod, script_name="alarms")

        matches = registry.get_alarm_handlers(priority="CRITICAL", area="Distillery01")
        assert len(matches) == 1


# ---------------------------------------------------------------------------
# Event dataclasses
# ---------------------------------------------------------------------------


class TestEventModels:

    def test_tag_change_event_frozen(self):
        event = TagChangeEvent(
            tag_path="WH/WHK01/TIT/Out_PV",
            old_value=77.0,
            new_value=78.4,
            quality="GOOD",
            timestamp="2026-04-08T12:00:00Z",
        )
        assert event.tag_path == "WH/WHK01/TIT/Out_PV"
        assert event.new_value == 78.4
        with pytest.raises(AttributeError):
            event.new_value = 99.0  # type: ignore

    def test_alarm_event_fields(self):
        event = AlarmEvent(
            alarm_id="a1",
            alarm_name="HIGH_TEMP",
            state="ACTIVE_UNACK",
            priority="HIGH",
            tag_path="WH/TIT/Out_PV",
            value=185.0,
            setpoint=180.0,
            timestamp="2026-04-08T12:00:00Z",
        )
        assert event.priority == "HIGH"

    def test_lifecycle_event_defaults(self):
        event = LifecycleEvent(event_type="startup")
        assert event.detail == {}
