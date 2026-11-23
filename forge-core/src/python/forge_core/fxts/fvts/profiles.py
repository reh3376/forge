"""Render-profile baseline — the normative table in ``docs/FxTS/FVTS.md``.

Every forge-display render profile has a platform-wide limit on the update
rate it may receive. A profile no longer decides who may act: the owner decided
on 2026-11-19 and 21 (``docs/decisions/forge-display.md``, Q-7 and Q-8, and the
answer on alarm operations) that a tag write and every alarm operation follow
the user's role on any profile, so that an operator can monitor and control a
process from a carried tablet or laptop. The core's write chain and the
activity record are the control, and the record names the profile an action
came from.

Two things can still narrow what a profile offers, and neither can widen it:

* a spec may *tighten* a profile through ``render_profiles.overrides`` (runner
  check ``fvts:profile-baseline``), and an action lists the profiles it is
  offered on;
* a site may switch tag writes or alarm operations off for a profile
  (:class:`SitePolicy`), for example no writes from phones.

An action is permitted on a profile only when the spec supports the profile,
the action lists it, and neither the spec nor the site has switched its kind off
there (``fvts:action-profile-permitted``).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

ALARM_OPERATIONS = frozenset({"ACKNOWLEDGE", "SHELVE", "UNSHELVE", "DISABLE", "ENABLE", "RESET"})


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
    "desktop_app": ProfileBaseline("desktop_app", 10.0, True, ALARM_OPERATIONS, False),
    "web": ProfileBaseline("web", 4.0, True, ALARM_OPERATIONS, False),
    "mobile": ProfileBaseline("mobile", 1.0, True, ALARM_OPERATIONS, False),
}
PROFILES = tuple(PROFILE_BASELINE)


@dataclass(frozen=True)
class SitePolicy:
    """What a site has switched off, by profile (D-16, Q-8).

    The default switches nothing off. A site that does not want tag writes from
    phones lists ``mobile`` in ``writes_off``. It can only narrow: nothing here
    lets a profile do what the spec or the user's role does not allow.
    """

    writes_off: frozenset[str] = frozenset()
    alarm_operations_off: frozenset[str] = frozenset()

    def __post_init__(self) -> None:
        unknown = (self.writes_off | self.alarm_operations_off) - set(PROFILE_BASELINE)
        if unknown:
            msg = f"unknown render profile(s) in the site policy: {sorted(unknown)}"
            raise ValueError(msg)


NO_SITE_POLICY = SitePolicy()


@dataclass(frozen=True)
class EffectiveProfile:
    """What a profile may actually do under one spec: baseline ∩ spec ∩ override."""

    profile: str
    max_update_rate_hz: float
    writes_permitted: bool
    alarm_operations: frozenset[str]


def effective_profile(
    spec: dict[str, Any], profile: str, site: SitePolicy = NO_SITE_POLICY
) -> EffectiveProfile:
    """Tightest limits for ``profile`` under ``spec`` and the site's policy.

    An unknown profile raises ``KeyError``.
    """
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
    if profile in site.writes_off:
        writes = False
    if profile in site.alarm_operations_off:
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


def action_permitted(
    spec: dict[str, Any], action: dict[str, Any], profile: str, site: SitePolicy = NO_SITE_POLICY
) -> bool:
    """The spec supports the profile, the action lists it, and nothing switched its kind off."""
    if profile not in PROFILE_BASELINE:
        return False
    if profile not in spec.get("render_profiles", {}).get("supported", []):
        return False
    if profile not in action.get("allowed_profiles", []):
        return False
    return kind_permitted(action, effective_profile(spec, profile, site))


def visible_actions(
    spec: dict[str, Any],
    surface: dict[str, Any],
    profile: str,
    site: SitePolicy = NO_SITE_POLICY,
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
        if action is not None and action_permitted(spec, action, profile, site):
            visible.append(action_id)
        else:
            hidden.append(action_id)
    return visible, hidden
