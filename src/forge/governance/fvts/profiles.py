"""Render-profile baseline — the normative table in ``docs/FxTS/FVTS.md``.

Every forge-display render profile has platform-wide limits: the update
rate it may receive, whether it may write tags and which alarm operations
it may perform. A spec may *tighten* these through
``render_profiles.overrides`` and never loosen them (runner check
``fvts:profile-baseline``). The effective limit for a profile is the
tightest of the baseline, the spec's own ``live_updates`` ceiling and the
override, and an action is permitted on a profile only when the spec lists
the profile, supports it and the effective limits allow the action's kind
(``fvts:action-profile-permitted``).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

ALARM_OPERATIONS = frozenset({"ACKNOWLEDGE", "SHELVE", "UNSHELVE", "DISABLE", "ENABLE", "RESET"})
ACKNOWLEDGE_ONLY = frozenset({"ACKNOWLEDGE"})


@dataclass(frozen=True)
class ProfileBaseline:
    """Platform limits for one render profile (FVTS.md, "Render profiles")."""

    profile: str
    max_update_rate_hz: float
    writes_permitted: bool
    alarm_operations: frozenset[str]
    kiosk: bool


PROFILE_BASELINE: dict[str, ProfileBaseline] = {
    "desktop_hmi": ProfileBaseline("desktop_hmi", 20.0, True, ALARM_OPERATIONS, True),
    "desktop_app": ProfileBaseline("desktop_app", 10.0, False, ACKNOWLEDGE_ONLY, False),
    "web": ProfileBaseline("web", 4.0, False, ACKNOWLEDGE_ONLY, False),
    "mobile": ProfileBaseline("mobile", 1.0, False, ACKNOWLEDGE_ONLY, False),
}
PROFILES = tuple(PROFILE_BASELINE)


@dataclass(frozen=True)
class EffectiveProfile:
    """What a profile may actually do under one spec: baseline ∩ spec ∩ override."""

    profile: str
    max_update_rate_hz: float
    writes_permitted: bool
    alarm_operations: frozenset[str]


def effective_profile(spec: dict[str, Any], profile: str) -> EffectiveProfile:
    """Tightest limits for ``profile`` under ``spec`` (unknown profile → KeyError)."""
    base = PROFILE_BASELINE[profile]
    live = spec.get("live_updates", {})
    rate = min(
        base.max_update_rate_hz, float(live.get("max_update_rate_hz", base.max_update_rate_hz))
    )
    writes = base.writes_permitted
    operations = base.alarm_operations
    override = spec.get("render_profiles", {}).get("overrides", {}).get(profile, {})
    if "max_update_rate_hz" in override:
        rate = min(rate, float(override["max_update_rate_hz"]))
    if override.get("writes_permitted") is False:
        writes = False
    if override.get("alarm_operations_permitted") is False:
        operations = frozenset()
    return EffectiveProfile(profile, rate, writes, operations)


def kind_permitted(action: dict[str, Any], effective: EffectiveProfile) -> bool:
    """Does the profile's effective limit allow this action's kind at all?"""
    kind = action.get("kind")
    if kind == "tag_write":
        return effective.writes_permitted
    if kind == "alarm_operation":
        return action.get("alarm_operation") in effective.alarm_operations
    return kind == "module_command"


def action_permitted(spec: dict[str, Any], action: dict[str, Any], profile: str) -> bool:
    """Spec lists the profile for the action, supports it, and the baseline allows the kind."""
    if profile not in PROFILE_BASELINE:
        return False
    if profile not in spec.get("render_profiles", {}).get("supported", []):
        return False
    if profile not in action.get("allowed_profiles", []):
        return False
    return kind_permitted(action, effective_profile(spec, profile))


def visible_actions(
    spec: dict[str, Any], surface: dict[str, Any], profile: str
) -> tuple[list[str], list[str]]:
    """Split a surface's action list into (visible, hidden) for a profile.

    A surface may list actions the active profile forbids; renderers hide
    them rather than disable them (``fvts:profile-action-filter``).
    """
    actions = {a.get("action_id"): a for a in spec.get("actions", [])}
    visible: list[str] = []
    hidden: list[str] = []
    for action_id in surface.get("actions", []):
        action = actions.get(action_id)
        if action is not None and action_permitted(spec, action, profile):
            visible.append(action_id)
        else:
            hidden.append(action_id)
    return visible, hidden
