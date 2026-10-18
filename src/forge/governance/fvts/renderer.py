"""Reference renderer — the behaviour every forge-display renderer must share.

Runner check ``fvts:golden-messages`` pushes a golden message set through
this module once per ``conformance_tests.renderers_under_test`` profile.
It is not a UI. It is the smallest faithful model of what a renderer does
with the contract — bind points, mark quality and staleness, label enums,
format numbers, colour alarms by token, present action results, filter a
surface's actions by profile — and it raises ``GoldenRenderError`` the
moment a message or the spec breaks a rule. View models are plain dicts so
tests can assert on them.

Golden messages are JSON objects with a ``message_type`` and an optional
``profiles`` list naming the renderers the message applies to (default:
all under test). A file holds one message or a list; files render in name
order and the renderer keeps state across them (last good value per point)::

    {"message_type": "subscription_update", "now": "<iso8601>", "rate_hz": 4,
     "updates": [{"point_id": "...", "value": {"raw": 1.5, "quality": "GOOD"},
                  "timestamp": {"source_time": "<iso8601>"}, "context": {"site": "..."}}]}
    {"message_type": "subscription_status", "state": "connected" | "disconnected"}
    {"message_type": "history_response", "point_id": "...", "timestamp_basis": "source_time",
     "decimation": {"location": "server", "algorithm": "..."}, "series": [{"t": "...", "v": 1}]}
    {"message_type": "alarm_event",
     "events": [{"alarm_id": "...", "state": "...", "priority": "..."}]}
    {"message_type": "action_result", "action_id": "...", "status": "...",
     "interlock": {"rule_id": "...", "message": "..."}}
    {"message_type": "surface_render", "surface_id": "..."}
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from forge.governance.fvts.profiles import (
    PROFILE_BASELINE,
    action_permitted,
    effective_profile,
    visible_actions,
)

QUALITY_CODES = frozenset({"GOOD", "UNCERTAIN", "BAD", "NOT_AVAILABLE"})
BAD_QUALITIES = frozenset({"BAD", "NOT_AVAILABLE"})
NUMERIC_TYPES = frozenset({"INT", "FLOAT", "DOUBLE"})
# Mirrors $defs.writeStatus (and forge.modules.ot.control.models.WriteStatus, see fvts:enum-parity).
WRITE_STATUSES = frozenset(
    {
        "CONFIRMED",
        "UNCONFIRMED",
        "REJECTED_VALIDATION",
        "REJECTED_INTERLOCK",
        "REJECTED_AUTH",
        "REJECTED_REVIEW",
        "FAILED_WRITE",
        "FAILED_READBACK",
        "PENDING",
    }
)
MESSAGE_TYPES = frozenset(
    {
        "subscription_update",
        "subscription_status",
        "history_response",
        "alarm_event",
        "action_result",
        "surface_render",
    }
)


class GoldenRenderError(ValueError):
    """A golden message, or the spec it is rendered against, breaks the contract."""


@dataclass(frozen=True)
class GoldenMessage:
    """One golden message and where it came from (for verdict evidence)."""

    source: str
    message: dict[str, Any]


@dataclass(frozen=True)
class GoldenRun:
    """Outcome of rendering a golden set on one profile."""

    profile: str
    rendered: int
    skipped: int
    errors: list[str]


def load_golden_messages(directory: Path) -> list[GoldenMessage]:
    """Every ``*.json`` under ``directory`` in name order; a file may hold one message or a list."""
    messages: list[GoldenMessage] = []
    for file in sorted(Path(directory).glob("*.json")):
        data = json.loads(file.read_text(encoding="utf-8"))
        items = data if isinstance(data, list) else [data]
        for index, item in enumerate(items):
            if not isinstance(item, dict):
                msg = f"{file.name}[{index}]: a golden message must be a JSON object"
                raise GoldenRenderError(msg)
            source = f"{file.name}[{index}]" if len(items) > 1 else file.name
            messages.append(GoldenMessage(source, item))
    return messages


def render_golden_set(
    spec: dict[str, Any], profile: str, messages: list[GoldenMessage]
) -> GoldenRun:
    """Render a golden set on one profile; never raises, every failure becomes an error line."""
    errors: list[str] = []
    try:
        renderer = ReferenceRenderer(spec, profile)
    except GoldenRenderError as exc:
        return GoldenRun(profile, 0, len(messages), [str(exc)])
    rendered = skipped = 0
    for golden in messages:
        if not renderer.applies(golden.message):
            skipped += 1
            continue
        try:
            renderer.render(golden.message)
            rendered += 1
        except GoldenRenderError as exc:
            errors.append(f"{golden.source}: {exc}")
    return GoldenRun(profile, rendered, skipped, errors)


def _parse_time(value: Any, what: str) -> datetime:
    if not isinstance(value, str):
        msg = f"{what} must be an ISO-8601 string, got {value!r}"
        raise GoldenRenderError(msg)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        msg = f"{what} is not ISO-8601: {value!r}"
        raise GoldenRenderError(msg) from exc
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


class ReferenceRenderer:
    """Renders contract messages for one profile under one spec."""

    def __init__(self, spec: dict[str, Any], profile: str) -> None:
        if profile not in PROFILE_BASELINE:
            msg = f"unknown render profile {profile!r}"
            raise GoldenRenderError(msg)
        if profile not in spec.get("render_profiles", {}).get("supported", []):
            msg = f"profile {profile!r} is not in render_profiles.supported"
            raise GoldenRenderError(msg)
        self.spec = spec
        self.profile = profile
        self.effective = effective_profile(spec, profile)
        self.points = {
            p.get("point_id"): p for p in spec.get("data_bindings", {}).get("points", [])
        }
        self.actions = {a.get("action_id"): a for a in spec.get("actions", [])}
        self.surfaces = {s.get("surface_id"): s for s in spec.get("surfaces", [])}
        self._last_display: dict[str, str] = {}

    # -- dispatch -----------------------------------------------------------

    def applies(self, message: dict[str, Any]) -> bool:
        """A message with a ``profiles`` list applies only to those renderers."""
        profiles = message.get("profiles")
        return profiles is None or self.profile in profiles

    def render(self, message: dict[str, Any]) -> dict[str, Any]:
        kind = message.get("message_type")
        if kind not in MESSAGE_TYPES:
            msg = f"unknown message_type {kind!r} (expected one of {sorted(MESSAGE_TYPES)})"
            raise GoldenRenderError(msg)
        handler = getattr(self, f"_render_{kind}")
        try:
            return handler(message)
        except GoldenRenderError:
            raise
        except (KeyError, TypeError, ValueError, AttributeError) as exc:
            msg = f"malformed {kind} message or spec: {exc!r}"
            raise GoldenRenderError(msg) from exc

    # -- lookups ------------------------------------------------------------

    def _point(self, point_id: Any) -> dict[str, Any]:
        point = self.points.get(point_id)
        if point is None:
            msg = f"point {point_id!r} is not declared in data_bindings.points"
            raise GoldenRenderError(msg)
        return point

    def _action(self, action_id: Any) -> dict[str, Any]:
        action = self.actions.get(action_id)
        if action is None:
            msg = f"action {action_id!r} is not declared in actions"
            raise GoldenRenderError(msg)
        return action

    def _surface(self, surface_id: Any) -> dict[str, Any]:
        surface = self.surfaces.get(surface_id)
        if surface is None:
            msg = f"surface {surface_id!r} is not declared in surfaces"
            raise GoldenRenderError(msg)
        return surface

    # -- live values ----------------------------------------------------------

    def _render_subscription_update(self, message: dict[str, Any]) -> dict[str, Any]:
        rate = message.get("rate_hz")
        if rate is not None and float(rate) > self.effective.max_update_rate_hz:
            msg = (
                f"update rate {rate} Hz exceeds the {self.profile} ceiling of "
                f"{self.effective.max_update_rate_hz:g} Hz"
            )
            raise GoldenRenderError(msg)
        now = _parse_time(message["now"], "now") if "now" in message else datetime.now(UTC)
        values = [self._render_value(update, now) for update in message.get("updates", [])]
        return {"view": "subscription_update", "profile": self.profile, "values": values}

    def _render_value(self, update: dict[str, Any], now: datetime) -> dict[str, Any]:
        point_id = update.get("point_id")
        point = self._point(point_id)
        self._check_context(point_id, update.get("context") or {})
        value = update.get("value") or {}
        quality = value.get("quality", "GOOD")
        if quality not in QUALITY_CODES:
            msg = f"point {point_id}: quality {quality!r} is not a QualityCode"
            raise GoldenRenderError(msg)
        basis = point["timestamp_basis"]
        stamp = (update.get("timestamp") or {}).get(basis)
        if stamp is None:
            msg = f"point {point_id}: update carries no {basis} (the point's timestamp_basis)"
            raise GoldenRenderError(msg)
        age_ms = (now - _parse_time(stamp, f"point {point_id}: {basis}")).total_seconds() * 1000
        handling = point["quality_handling"]
        stale = age_ms > handling["stale_after_ms"]
        markers: list[str] = ["STALE"] if stale else []
        if quality in BAD_QUALITIES:
            markers.append(quality)
            last_value = handling["on_bad"] == "last_value_with_marker"
            display = self._last_display.get(point_id, "") if last_value else ""
        else:
            display = self._format(point, value.get("raw"))
            if quality == "UNCERTAIN":
                markers.append("UNCERTAIN")
            self._last_display[point_id] = display
        return {
            "point_id": point_id,
            "display": display,
            "markers": markers,
            "stale": stale,
            "age_ms": round(age_ms),
        }

    def _check_context(self, point_id: Any, context: dict[str, Any]) -> None:
        required = self.spec.get("scope", {}).get("required_context_fields", [])
        missing = [field for field in required if context.get(field) in (None, "")]
        if missing:
            msg = f"point {point_id}: update is missing required context fields {missing}"
            raise GoldenRenderError(msg)

    def _format(self, point: dict[str, Any], raw: Any) -> str:
        point_id = point.get("point_id")
        data_type = point.get("data_type")
        if data_type in NUMERIC_TYPES:
            if isinstance(raw, bool):
                msg = f"point {point_id}: raw value {raw!r} is a boolean, not {data_type}"
                raise GoldenRenderError(msg)
            try:
                number = float(raw)
            except (TypeError, ValueError):
                msg = f"point {point_id}: raw value {raw!r} is not numeric"
                raise GoldenRenderError(msg) from None
            text = f"{number:.{point['display_precision']}f}"
            return f"{text} {point['engineering_units']}".rstrip()
        if data_type == "ENUM":
            labels = point.get("enum_labels", {})
            key = str(raw)
            if key not in labels:
                msg = f"point {point_id}: no enum label for raw value {raw!r}"
                raise GoldenRenderError(msg)
            return labels[key]
        if data_type == "BOOLEAN":
            if not isinstance(raw, bool):
                msg = f"point {point_id}: raw value {raw!r} is not a boolean"
                raise GoldenRenderError(msg)
            return "ON" if raw else "OFF"
        if data_type == "DATETIME":
            return _parse_time(raw, f"point {point_id}: value").isoformat()
        return str(raw)

    def _render_subscription_status(self, message: dict[str, Any]) -> dict[str, Any]:
        state = message.get("state")
        if state not in ("connected", "disconnected"):
            msg = f"subscription state {state!r} is not connected|disconnected"
            raise GoldenRenderError(msg)
        # live_updates.on_disconnect is mark_all_stale: nothing ever freezes silently.
        marked = sorted(self.points) if state == "disconnected" else []
        return {"view": "subscription_status", "state": state, "marked_stale": marked}

    # -- history -------------------------------------------------------------

    def _render_history_response(self, message: dict[str, Any]) -> dict[str, Any]:
        history = self.spec.get("history", {})
        if not history.get("enabled"):
            msg = "history is not enabled in this contract"
            raise GoldenRenderError(msg)
        point = self._point(message.get("point_id"))
        decimation = message.get("decimation") or {}
        if decimation.get("location") != "server":
            msg = "history series must be decimated server-side; renderers never receive raw series"
            raise GoldenRenderError(msg)
        algorithm = history["decimation"]["algorithm"]
        if decimation.get("algorithm") != algorithm:
            msg = (
                f"history decimated with {decimation.get('algorithm')!r}, "
                f"contract says {algorithm!r}"
            )
            raise GoldenRenderError(msg)
        if message.get("timestamp_basis") != history["timestamp_basis"]:
            msg = (
                f"history timestamp_basis {message.get('timestamp_basis')!r} differs from the "
                f"contract's {history['timestamp_basis']!r}"
            )
            raise GoldenRenderError(msg)
        series = message.get("series", [])
        cap = history["max_points_per_series"]
        if len(series) > cap:
            msg = f"history series has {len(series)} points, contract caps it at {cap}"
            raise GoldenRenderError(msg)
        for sample in series:
            _parse_time(sample.get("t"), f"history sample for {point.get('point_id')}")
            if "v" not in sample:
                msg = f"history sample for {point.get('point_id')} has no value"
                raise GoldenRenderError(msg)
        return {
            "view": "history",
            "point_id": point.get("point_id"),
            "points": len(series),
            "algorithm": algorithm,
        }

    # -- alarms --------------------------------------------------------------

    def _render_alarm_event(self, message: dict[str, Any]) -> dict[str, Any]:
        alarms = self.spec.get("alarms", {})
        if not alarms.get("enabled"):
            msg = "alarms are not enabled in this contract"
            raise GoldenRenderError(msg)
        events = []
        for event in message.get("events", []):
            state, priority = event.get("state"), event.get("priority")
            if state not in alarms.get("states", []):
                msg = f"alarm {event.get('alarm_id')}: state {state!r} is not in alarms.states"
                raise GoldenRenderError(msg)
            if priority not in alarms.get("priorities", []):
                msg = (
                    f"alarm {event.get('alarm_id')}: priority {priority!r} not in alarms.priorities"
                )
                raise GoldenRenderError(msg)
            token = alarms.get("priority_tokens", {}).get(priority)
            if not token:
                msg = f"alarm {event.get('alarm_id')}: no design token for priority {priority}"
                raise GoldenRenderError(msg)
            events.append(
                {
                    "alarm_id": event.get("alarm_id"),
                    "state": state,
                    "priority": priority,
                    "token": token,
                    "annunciate": bool(alarms.get("audible_annunciation"))
                    and state == "ACTIVE_UNACK",
                }
            )
        return {"view": "alarm_event", "events": events}

    # -- actions -------------------------------------------------------------

    def _render_action_result(self, message: dict[str, Any]) -> dict[str, Any]:
        action_id = message.get("action_id")
        action = self._action(action_id)
        if not action_permitted(self.spec, action, self.profile):
            msg = (
                f"action {action_id} is not permitted on {self.profile}; a renderer never "
                "invokes it there, so it never receives a result for it"
            )
            raise GoldenRenderError(msg)
        status = message.get("status")
        if status not in WRITE_STATUSES:
            msg = f"action {action_id}: status {status!r} is not a WriteStatus"
            raise GoldenRenderError(msg)
        if action.get("kind") == "tag_write" and status not in action.get("handled_statuses", []):
            msg = f"action {action_id}: status {status} is not in handled_statuses"
            raise GoldenRenderError(msg)
        feedback = None
        if status == "REJECTED_INTERLOCK":
            interlock = message.get("interlock") or {}
            if not interlock.get("rule_id") or not interlock.get("message"):
                msg = (
                    f"action {action_id}: REJECTED_INTERLOCK without the blocking condition "
                    "(interlock_feedback requires rule_id and message)"
                )
                raise GoldenRenderError(msg)
            feedback = f"{interlock['rule_id']}: {interlock['message']}"
        return {
            "view": "action_result",
            "action_id": action_id,
            "status": status,
            "interlock_feedback": feedback,
            "audited": True,
        }

    # -- surfaces ------------------------------------------------------------

    def _render_surface_render(self, message: dict[str, Any]) -> dict[str, Any]:
        surface_id = message.get("surface_id")
        surface = self._surface(surface_id)
        if self.profile not in surface.get("allowed_profiles", []):
            msg = f"surface {surface_id} is not offered on {self.profile}"
            raise GoldenRenderError(msg)
        for point_id in surface.get("points", []):
            self._point(point_id)
        visible, hidden = visible_actions(self.spec, surface, self.profile)
        return {
            "view": "surface",
            "surface_id": surface_id,
            "kind": surface.get("kind"),
            "points": list(surface.get("points", [])),
            "actions_visible": visible,
            "actions_hidden": hidden,
        }
