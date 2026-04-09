"""Trigger system — decorators and registry for script event handlers.

Scripts use ``@forge.on_tag_change``, ``@forge.timer``, ``@forge.on_event``,
``@forge.on_alarm``, and ``@forge.api.route`` decorators to register handlers.
The ScriptEngine calls ``collect_handlers(module)`` after importing each script
to extract all registered handlers and wire them to runtime event sources.

Design decisions:
    D1: Decorators are *markers* — they attach metadata to functions but don't
        modify their behavior.  This means scripts are testable with plain
        pytest (no runtime required).
    D2: Each decorator creates a ``HandlerRegistration`` dataclass that the
        TriggerRegistry stores.  The ScriptEngine converts registrations to
        live asyncio tasks or callback subscriptions.
    D3: Pattern matching for tag_change uses fnmatch-style wildcards
        (``*`` matches one segment, ``**`` matches any depth).  This is
        consistent with MQTT topic wildcards and Ignition tag patterns.
"""

from __future__ import annotations

import enum
import fnmatch
import re
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any, Callable

import logging

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Trigger types
# ---------------------------------------------------------------------------


class TriggerType(str, enum.Enum):
    """All supported trigger types for script handlers."""

    TAG_CHANGE = "tag_change"
    TIMER = "timer"
    EVENT = "event"
    ALARM = "alarm"
    API_ROUTE = "api_route"


# ---------------------------------------------------------------------------
# Event models
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TagChangeEvent:
    """Payload delivered to @forge.on_tag_change handlers."""

    tag_path: str
    old_value: Any
    new_value: Any
    quality: str
    timestamp: str  # ISO-8601
    area: str | None = None
    equipment_id: str | None = None


@dataclass(frozen=True)
class AlarmEvent:
    """Payload delivered to @forge.on_alarm handlers."""

    alarm_id: str
    alarm_name: str
    state: str  # ACTIVE_UNACK, ACTIVE_ACK, CLEAR_UNACK, etc.
    priority: str  # CRITICAL, HIGH, MEDIUM, LOW, DIAGNOSTIC
    tag_path: str
    value: Any
    setpoint: Any
    timestamp: str
    area: str | None = None
    equipment_id: str | None = None


@dataclass(frozen=True)
class LifecycleEvent:
    """Payload delivered to @forge.on_event handlers."""

    event_type: str  # startup, shutdown, plc_connected, etc.
    detail: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Handler registration
# ---------------------------------------------------------------------------


@dataclass
class HandlerRegistration:
    """Metadata attached to a decorated function by a trigger decorator.

    The TriggerRegistry stores these.  The ScriptEngine converts them to
    live subscriptions or tasks at runtime.
    """

    trigger_type: TriggerType
    handler: Callable
    script_name: str = ""
    script_path: str = ""

    # tag_change-specific
    tag_pattern: str = ""

    # timer-specific
    interval: timedelta | None = None

    # event-specific
    event_types: list[str] = field(default_factory=list)

    # alarm-specific
    alarm_priorities: list[str] = field(default_factory=list)
    alarm_areas: list[str] = field(default_factory=list)
    alarm_names: list[str] = field(default_factory=list)

    # api_route-specific
    http_method: str = "GET"
    route_path: str = ""

    @property
    def handler_name(self) -> str:
        return self.handler.__name__


# ---------------------------------------------------------------------------
# Decorator attribute name (marker on the function object)
# ---------------------------------------------------------------------------

_HANDLER_ATTR = "__forge_handler__"


def _mark_handler(fn: Callable, registration: HandlerRegistration) -> Callable:
    """Attach a HandlerRegistration to a function via attribute."""
    if not hasattr(fn, _HANDLER_ATTR):
        setattr(fn, _HANDLER_ATTR, [])
    getattr(fn, _HANDLER_ATTR).append(registration)
    return fn


# ---------------------------------------------------------------------------
# Decorators
# ---------------------------------------------------------------------------


def on_tag_change(pattern: str) -> Callable:
    """Register a handler for tag value changes matching a pattern.

    Pattern uses fnmatch-style wildcards:
        ``*`` matches one path segment
        ``**`` matches any number of segments

    Example::

        @forge.on_tag_change("WH/WHK01/Distillery01/*/Out_PV")
        async def on_temp_change(event: TagChangeEvent):
            ...
    """

    def decorator(fn: Callable) -> Callable:
        reg = HandlerRegistration(
            trigger_type=TriggerType.TAG_CHANGE,
            handler=fn,
            tag_pattern=pattern,
        )
        return _mark_handler(fn, reg)

    return decorator


def _parse_interval(s: str) -> timedelta:
    """Parse a human-friendly interval string to timedelta.

    Supports: "100ms", "5s", "1m", "0.5h", "1h30m".
    """
    s = s.strip().lower()
    total_seconds = 0.0

    # Try compound: "1h30m", "2m30s"
    compound = re.findall(r"(\d+(?:\.\d+)?)\s*(ms|s|m|h)", s)
    if compound:
        for val, unit in compound:
            v = float(val)
            if unit == "ms":
                total_seconds += v / 1000
            elif unit == "s":
                total_seconds += v
            elif unit == "m":
                total_seconds += v * 60
            elif unit == "h":
                total_seconds += v * 3600
        return timedelta(seconds=total_seconds)

    raise ValueError(f"Cannot parse interval: {s!r}. Use '5s', '1m', '100ms', etc.")


def timer(interval: str, *, name: str = "", enabled: bool = True) -> Callable:
    """Register a handler for periodic execution.

    Args:
        interval: Human-friendly string like "5s", "1m", "100ms".
        name: Optional name for the timer (defaults to function name).
        enabled: Whether the timer starts immediately.

    Example::

        @forge.timer("30s", name="temp_check")
        async def check_temperatures():
            ...
    """

    td = _parse_interval(interval)

    def decorator(fn: Callable) -> Callable:
        reg = HandlerRegistration(
            trigger_type=TriggerType.TIMER,
            handler=fn,
            interval=td,
        )
        return _mark_handler(fn, reg)

    return decorator


def on_event(*event_types: str) -> Callable:
    """Register a handler for lifecycle events.

    Args:
        *event_types: One or more of: startup, shutdown, plc_connected,
                      plc_disconnected, tag_provider_change.

    Example::

        @forge.on_event("startup", "plc_connected")
        async def on_startup(event: LifecycleEvent):
            ...
    """

    def decorator(fn: Callable) -> Callable:
        reg = HandlerRegistration(
            trigger_type=TriggerType.EVENT,
            handler=fn,
            event_types=list(event_types),
        )
        return _mark_handler(fn, reg)

    return decorator


def on_alarm(
    *,
    priorities: list[str] | None = None,
    areas: list[str] | None = None,
    names: list[str] | None = None,
) -> Callable:
    """Register a handler for alarm state changes.

    Args:
        priorities: Filter by alarm priority (e.g., ["CRITICAL", "HIGH"]).
        areas: Filter by area (e.g., ["Distillery01"]).
        names: Filter by alarm name.

    Example::

        @forge.on_alarm(priorities=["CRITICAL", "HIGH"])
        async def on_critical_alarm(event: AlarmEvent):
            ...
    """

    def decorator(fn: Callable) -> Callable:
        reg = HandlerRegistration(
            trigger_type=TriggerType.ALARM,
            handler=fn,
            alarm_priorities=priorities or [],
            alarm_areas=areas or [],
            alarm_names=names or [],
        )
        return _mark_handler(fn, reg)

    return decorator


class _ApiRouteBuilder:
    """Builder for ``@forge.api.route`` decorators.

    Usage::

        @forge.api.route("/status", method="GET")
        async def get_status(request):
            return {"status": "ok"}
    """

    def route(self, path: str, *, method: str = "GET") -> Callable:
        def decorator(fn: Callable) -> Callable:
            reg = HandlerRegistration(
                trigger_type=TriggerType.API_ROUTE,
                handler=fn,
                http_method=method.upper(),
                route_path=path,
            )
            return _mark_handler(fn, reg)

        return decorator


api = _ApiRouteBuilder()


# ---------------------------------------------------------------------------
# TriggerRegistry
# ---------------------------------------------------------------------------


class TriggerRegistry:
    """Collects and stores handler registrations from script modules.

    After the ScriptEngine imports a script file, it calls
    ``collect_from_module(module)`` to extract all decorated handlers
    and store them in the registry.
    """

    def __init__(self) -> None:
        self._registrations: list[HandlerRegistration] = []

    @property
    def count(self) -> int:
        return len(self._registrations)

    def collect_from_module(self, module: Any, script_name: str = "", script_path: str = "") -> int:
        """Extract all handler registrations from a loaded module.

        Returns the number of handlers found.
        """
        found = 0
        for attr_name in dir(module):
            obj = getattr(module, attr_name, None)
            if callable(obj) and hasattr(obj, _HANDLER_ATTR):
                for reg in getattr(obj, _HANDLER_ATTR):
                    reg.script_name = script_name or getattr(module, "__name__", "unknown")
                    reg.script_path = script_path
                    self._registrations.append(reg)
                    found += 1
        return found

    def get_by_type(self, trigger_type: TriggerType) -> list[HandlerRegistration]:
        """Get all registrations of a specific trigger type."""
        return [r for r in self._registrations if r.trigger_type == trigger_type]

    def get_tag_change_handlers(self, tag_path: str) -> list[HandlerRegistration]:
        """Get all tag_change handlers whose pattern matches a tag path.

        Pattern matching:
            ``*`` matches exactly one path segment
            ``**`` matches any number of segments
        """
        matches = []
        for reg in self._registrations:
            if reg.trigger_type != TriggerType.TAG_CHANGE:
                continue
            if _match_tag_pattern(reg.tag_pattern, tag_path):
                matches.append(reg)
        return matches

    def get_alarm_handlers(self, priority: str = "", area: str = "", name: str = "") -> list[HandlerRegistration]:
        """Get alarm handlers matching the given alarm attributes."""
        matches = []
        for reg in self._registrations:
            if reg.trigger_type != TriggerType.ALARM:
                continue
            if reg.alarm_priorities and priority not in reg.alarm_priorities:
                continue
            if reg.alarm_areas and area not in reg.alarm_areas:
                continue
            if reg.alarm_names and name not in reg.alarm_names:
                continue
            matches.append(reg)
        return matches

    def clear(self) -> None:
        """Remove all registrations (used during hot-reload)."""
        self._registrations.clear()

    def clear_script(self, script_name: str) -> int:
        """Remove all registrations from a specific script.

        Returns the number of registrations removed.
        """
        before = len(self._registrations)
        self._registrations = [r for r in self._registrations if r.script_name != script_name]
        return before - len(self._registrations)

    @property
    def all_registrations(self) -> list[HandlerRegistration]:
        return list(self._registrations)


# ---------------------------------------------------------------------------
# Pattern matching
# ---------------------------------------------------------------------------


def _match_tag_pattern(pattern: str, tag_path: str) -> bool:
    """Match a tag path against a pattern with segment-aware wildcards.

    ``*``  → matches exactly one path segment (no slashes)
    ``**`` → matches zero or more segments (including slashes)

    Examples:
        "WH/WHK01/*/TIT_2010/Out_PV" matches "WH/WHK01/Distillery01/TIT_2010/Out_PV"
        "WH/**" matches "WH/WHK01/Distillery01/TIT_2010/Out_PV"
        "WH/*/Distillery01/**" matches "WH/WHK01/Distillery01/TIT_2010/Out_PV"
    """
    # Convert pattern to regex
    parts = pattern.split("/")
    regex_parts = []
    for part in parts:
        if part == "**":
            regex_parts.append(".*")
        elif "*" in part:
            # Replace * with [^/]+ (single segment wildcard)
            regex_parts.append(part.replace("*", "[^/]+"))
        else:
            regex_parts.append(re.escape(part))
    regex = "^" + "/".join(regex_parts) + "$"
    return bool(re.match(regex, tag_path))
