"""FVTS runner — enforces the module ↔ forge-display contract (BACKLOG FB-077).

Static checks over an FVTS spec (``<module>.fvts.json``): JSON-Schema
validity, FHTS integrity, enum parity with the Python models the schema
mirrors, cross-references into the owner's FACTS spec and the OT write
config, render-profile baselines, cross-site read-only, ISA-101, range
sanity, and the golden-message set rendered through the reference
renderer for every profile under test.

Schema-runner parity: every field of ``fvts.schema.json`` — top level and
``$defs`` properties — is enforced here. ``fvts:schema-valid`` applies the
schema itself; the other checks add the rules the schema cannot express.

    runner = FVTSRunner(schema_path=SCHEMA_PATH)
    report = await runner.run(target="ot-module-views", spec=spec)

Keyword arguments to ``run`` (all optional):
    facts_specs     {adapter_id: FACTS spec}; default: every spec under facts/specs
    write_config    OTControlConfig or its dict; tag_write targets must match a write_tags entry
    golden_messages list[GoldenMessage]; default: loaded from conformance_tests.golden_messages_path
    repo_root       Path the conformance paths resolve against; default: this checkout
"""

from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING, Any, ClassVar

from forge.governance.facts import SCHEMA_PATH as FACTS_SCHEMA_PATH
from forge.governance.fvts import REPO_ROOT
from forge.governance.fvts.profiles import (
    ALARM_OPERATIONS,
    PROFILE_BASELINE,
    effective_profile,
    kind_permitted,
    visible_actions,
)
from forge.governance.fvts.renderer import GoldenMessage, load_golden_messages, render_golden_set
from forge.governance.shared.runner import (
    FxTSRunner,
    FxTSVerdict,
    SpecViolation,
    VerdictStatus,
    verify_spec_hash,
)

if TYPE_CHECKING:
    from pathlib import Path

FACTS_SPECS_DIR = FACTS_SCHEMA_PATH.parent.parent / "specs"

# AlarmAction members that are system-initiated and therefore never UI actions.
SYSTEM_ALARM_ACTIONS = frozenset({"TRIGGER", "CLEAR", "SUPPRESS", "UNSUPPRESS"})

# FVTS point data types → OT TagWriteConfig data types a tag_write may target.
WRITABLE_TYPES: dict[str, frozenset[str]] = {
    "BOOLEAN": frozenset({"BOOLEAN"}),
    "INT": frozenset({"INT16", "INT32", "INT64"}),
    "FLOAT": frozenset({"FLOAT", "DOUBLE"}),
    "DOUBLE": frozenset({"DOUBLE", "FLOAT"}),
    "STRING": frozenset({"STRING"}),
    "ENUM": frozenset({"INT16", "INT32", "INT64", "STRING"}),
    "DATETIME": frozenset(),
}

_TOP_LEVEL = frozenset(
    {
        "spec_version",
        "view_identity",
        "scope",
        "data_bindings",
        "live_updates",
        "history",
        "alarms",
        "actions",
        "settings",
        "render_profiles",
        "surfaces",
        "design_system",
        "conformance_tests",
        "metadata",
        "integrity",
    }
)
_POINT = frozenset(
    {
        "point_id",
        "label",
        "source",
        "data_type",
        "engineering_units",
        "display_precision",
        "range",
        "enum_labels",
        "timestamp_basis",
        "quality_handling",
    }
)
_ACTION = frozenset(
    {
        "action_id",
        "label",
        "kind",
        "target_point",
        "alarm_operation",
        "command",
        "parameters_schema_ref",
        "required_role",
        "confirmation",
        "reason_code_required",
        "interlock_feedback",
        "handled_statuses",
        "timeout_ms",
        "audit",
        "allowed_profiles",
    }
)
_SURFACE = frozenset(
    {
        "surface_id",
        "title",
        "kind",
        "authoring",
        "scope_level",
        "allowed_profiles",
        "points",
        "actions",
    }
)


def load_facts_specs(directory: Path = FACTS_SPECS_DIR) -> dict[str, dict[str, Any]]:
    """Every ``*.facts.json`` under ``directory`` keyed by its adapter_id."""
    specs: dict[str, dict[str, Any]] = {}
    for file in sorted(directory.glob("*.facts.json")):
        spec = json.loads(file.read_text(encoding="utf-8"))
        adapter_id = spec.get("adapter_identity", {}).get("adapter_id")
        if adapter_id:
            specs[adapter_id] = spec
    return specs


def tag_pattern(tag_path: str) -> re.Pattern[str]:
    """``{placeholder}`` segments match one path segment; everything else is literal."""
    parts = re.split(r"(\{[a-z_]+\})", tag_path)
    body = "".join("[^/]+" if part.startswith("{") else re.escape(part) for part in parts)
    return re.compile(f"^{body}$")


def write_tags(write_config: Any) -> list[dict[str, Any]]:
    """Normalise an ``OTControlConfig`` or its JSON dict to plain write_tags dicts."""
    tags = (
        write_config.get("write_tags", [])
        if isinstance(write_config, dict)
        else write_config.write_tags
    )
    rows: list[dict[str, Any]] = []
    for tag in tags:
        if isinstance(tag, dict):
            data_type = tag.get("data_type", "FLOAT")
            rows.append(
                {
                    "tag_path": tag.get("tag_path", ""),
                    "data_type": getattr(data_type, "value", data_type),
                    "min_value": tag.get("min_value"),
                    "max_value": tag.get("max_value"),
                    "writable": tag.get("writable", True),
                }
            )
        else:
            rows.append(
                {
                    "tag_path": tag.tag_path,
                    "data_type": getattr(tag.data_type, "value", tag.data_type),
                    "min_value": tag.min_value,
                    "max_value": tag.max_value,
                    "writable": tag.writable,
                }
            )
    return rows


class FVTSRunner(FxTSRunner):
    """Module ↔ forge-display contract runner for the FVTS framework."""

    framework = "FVTS"
    version = "0.1.0"

    _ENFORCED_FIELDS: ClassVar[set[str]] = set(_TOP_LEVEL) | {
        f"$.{field}" for field in _POINT | _ACTION | _SURFACE
    }

    def __init__(self, schema_path: Path | str | None = None) -> None:
        super().__init__(schema_path=schema_path)
        self._validator: Any = None

    def implemented_fields(self) -> set[str]:
        return set(self._ENFORCED_FIELDS)

    async def _run_checks(self, target: str, **kwargs: Any) -> list[FxTSVerdict]:
        spec: dict[str, Any] | None = kwargs.get("spec")
        if spec is None:
            return [
                FxTSVerdict(
                    check_id="fvts:spec-load",
                    spec_ref="FVTS/spec-load",
                    status=VerdictStatus.ERROR,
                    message=f"No spec provided for view contract '{target}'.",
                )
            ]
        facts_specs: dict[str, dict[str, Any]] = (
            kwargs["facts_specs"] if kwargs.get("facts_specs") is not None else load_facts_specs()
        )
        repo_root: Path = kwargs.get("repo_root") or REPO_ROOT
        return [
            self._check_schema_valid(spec),
            self._check_identity(spec, target),
            *self._check_integrity(spec),
            self._check_enum_parity(),
            self._check_owner_in_facts(spec, facts_specs, repo_root),
            self._check_unique_ids(spec),
            self._check_surface_refs(spec),
            self._check_action_target(spec, facts_specs, kwargs.get("write_config")),
            self._check_action_profile_permitted(spec),
            self._check_profile_supported(spec),
            self._check_profile_baseline(spec),
            self._check_profile_action_filter(spec),
            self._check_cross_site_read_only(spec),
            self._check_isa101(spec),
            self._check_range_sane(spec),
            self._check_conformance_paths(spec, repo_root),
            self._check_golden_messages(spec, kwargs.get("golden_messages"), repo_root),
            self._check_metadata(spec),
        ]

    # ------------------------------------------------------------------
    # Verdict helper
    # ------------------------------------------------------------------

    @staticmethod
    def _verdict(
        check: str,
        ref: str,
        violations: list[SpecViolation],
        ok: str,
        *,
        evidence: dict[str, Any] | None = None,
    ) -> FxTSVerdict:
        if violations:
            head = "; ".join(v.message for v in violations[:3])
            more = f" (+{len(violations) - 3} more)" if len(violations) > 3 else ""
            return FxTSVerdict(
                check_id=f"fvts:{check}",
                spec_ref=f"FVTS/{ref}",
                status=VerdictStatus.FAIL,
                message=f"{len(violations)} violation(s): {head}{more}",
                violations=violations,
                evidence=evidence or {},
            )
        return FxTSVerdict(
            check_id=f"fvts:{check}",
            spec_ref=f"FVTS/{ref}",
            status=VerdictStatus.PASS,
            message=ok,
            evidence=evidence or {},
        )

    @staticmethod
    def _points(spec: dict[str, Any]) -> dict[str, dict[str, Any]]:
        return {p.get("point_id"): p for p in spec.get("data_bindings", {}).get("points", [])}

    @staticmethod
    def _actions(spec: dict[str, Any]) -> dict[str, dict[str, Any]]:
        return {a.get("action_id"): a for a in spec.get("actions", [])}

    @staticmethod
    def _supported(spec: dict[str, Any]) -> list[str]:
        return list(spec.get("render_profiles", {}).get("supported", []))

    # ------------------------------------------------------------------
    # fvts:schema-valid — the schema itself, every field, every $def
    # ------------------------------------------------------------------

    def _check_schema_valid(self, spec: dict[str, Any]) -> FxTSVerdict:
        if self.schema is None:
            return FxTSVerdict(
                check_id="fvts:schema-valid",
                spec_ref="FVTS/schema",
                status=VerdictStatus.ERROR,
                message="No schema configured; cannot validate the spec.",
            )
        if self._validator is None:
            from jsonschema import Draft202012Validator

            self._validator = Draft202012Validator(self.schema)
        errors = sorted(self._validator.iter_errors(spec), key=lambda e: list(e.absolute_path))
        violations = [
            SpecViolation(
                field="/".join(str(p) for p in e.absolute_path) or "$",
                message=e.message[:240],
            )
            for e in errors
        ]
        return self._verdict(
            "schema-valid",
            "schema",
            violations,
            f"Spec validates against {self.schema.get('$id')}.",
        )

    # ------------------------------------------------------------------
    # fvts:identity-match
    # ------------------------------------------------------------------

    def _check_identity(self, spec: dict[str, Any], target: str) -> FxTSVerdict:
        view_id = spec.get("view_identity", {}).get("view_id", "")
        violations = []
        if view_id != target:
            violations.append(
                SpecViolation(
                    field="view_identity.view_id",
                    expected=target,
                    actual=view_id,
                    message=f"view_id '{view_id}' does not match target '{target}'",
                )
            )
        return self._verdict(
            "identity-match", "view_identity", violations, f"view_id is '{view_id}'."
        )

    # ------------------------------------------------------------------
    # fvts:hash-verified / fvts:hash-approved (FHTS)
    # ------------------------------------------------------------------

    def _check_integrity(self, spec: dict[str, Any]) -> list[FxTSVerdict]:
        integrity = spec.get("integrity")
        if integrity is None:
            missing = SpecViolation(
                field="integrity",
                message="no integrity block; every FVTS spec carries an FHTS hash",
            )
            return [
                self._verdict("hash-verified", "integrity/spec_hash", [missing], ""),
                self._verdict("hash-approved", "integrity/hash_state", [missing], ""),
            ]
        verified, hash_message = verify_spec_hash(spec)
        hash_violations = []
        if verified is not True:
            hash_violations.append(SpecViolation(field="integrity.spec_hash", message=hash_message))
        state = integrity.get("hash_state", "unknown")
        approved_by = integrity.get("approved_by") or ""
        state_violations = []
        if state != "approved" or not approved_by:
            state_violations.append(
                SpecViolation(
                    field="integrity.hash_state",
                    expected="approved (with approved_by)",
                    actual=f"{state} / approved_by={approved_by!r}",
                    message=(
                        f"hash_state is '{state}' (approved_by={approved_by!r}); the contract is "
                        "not binding until the owner approves it"
                    ),
                    severity="warning",
                )
            )
        return [
            self._verdict("hash-verified", "integrity/spec_hash", hash_violations, hash_message),
            self._verdict(
                "hash-approved",
                "integrity/hash_state",
                state_violations,
                f"hash_state is 'approved' by {approved_by}.",
                evidence={"hash_state": state, "approved_by": approved_by},
            ),
        ]

    # ------------------------------------------------------------------
    # fvts:enum-parity — schema $defs mirror the Python models
    # ------------------------------------------------------------------

    def _check_enum_parity(self) -> FxTSVerdict:
        if self.schema is None:
            return FxTSVerdict(
                check_id="fvts:enum-parity",
                spec_ref="FVTS/$defs",
                status=VerdictStatus.ERROR,
                message="No schema configured; cannot compare enums.",
            )
        from forge.core.models.contextual_record import QualityCode, RecordContext, RecordTimestamp
        from forge.modules.ot.alarming.models import AlarmAction, AlarmPriority, AlarmState
        from forge.modules.ot.control.models import WriteRole, WriteStatus

        expected: dict[str, set[str]] = {
            "qualityCode": {e.value for e in QualityCode},
            "contextField": set(RecordContext.model_fields) - {"extra"},
            "timestampBasis": set(RecordTimestamp.model_fields),
            "alarmState": {e.value for e in AlarmState},
            "alarmPriority": {e.value for e in AlarmPriority},
            "alarmOperation": {e.value for e in AlarmAction} - SYSTEM_ALARM_ACTIONS,
            "role": {e.value for e in WriteRole} | {"VIEWER"},
            "writeStatus": {e.value for e in WriteStatus},
        }
        defs = self.schema.get("$defs", {})
        violations = []
        for name, want in expected.items():
            have = set(defs.get(name, {}).get("enum", []))
            if have != want:
                violations.append(
                    SpecViolation(
                        field=f"$defs.{name}",
                        expected=sorted(want),
                        actual=sorted(have),
                        message=(
                            f"$defs.{name} drifted from its Python model: "
                            f"missing {sorted(want - have)}, extra {sorted(have - want)}"
                        ),
                    )
                )
        if set(ALARM_OPERATIONS) != expected["alarmOperation"]:
            violations.append(
                SpecViolation(
                    field="profiles.ALARM_OPERATIONS",
                    message="the profile baseline's alarm operations drifted from AlarmAction",
                )
            )
        return self._verdict(
            "enum-parity",
            "$defs",
            violations,
            f"{len(expected)} mirrored enums match their Python models.",
            evidence={name: sorted(values) for name, values in expected.items()},
        )

    # ------------------------------------------------------------------
    # fvts:owner-in-facts
    # ------------------------------------------------------------------

    def _check_owner_in_facts(
        self, spec: dict[str, Any], facts_specs: dict[str, dict[str, Any]], repo_root: Path
    ) -> FxTSVerdict:
        identity = spec.get("view_identity", {})
        owner = identity.get("owner_module", "")
        violations = []
        facts = facts_specs.get(owner)
        if facts is None:
            violations.append(
                SpecViolation(
                    field="view_identity.owner_module",
                    actual=owner,
                    message=(
                        f"owner_module '{owner}' has no FACTS spec (known: {sorted(facts_specs)})"
                    ),
                )
            )
        ref = identity.get("facts_spec_ref")
        if ref and not ref.startswith("forge://") and not (repo_root / ref).is_file():
            violations.append(
                SpecViolation(
                    field="view_identity.facts_spec_ref",
                    actual=ref,
                    message=f"facts_spec_ref '{ref}' does not exist under {repo_root}",
                )
            )
        bound = sorted(
            {p.get("source", {}).get("adapter_id", "") for p in self._points(spec).values()}
        )
        for adapter_id in bound:
            if adapter_id not in facts_specs:
                violations.append(
                    SpecViolation(
                        field="data_bindings.points[].source.adapter_id",
                        actual=adapter_id,
                        message=f"bound adapter '{adapter_id}' has no FACTS spec",
                    )
                )
        return self._verdict(
            "owner-in-facts",
            "view_identity/owner_module",
            violations,
            f"owner '{owner}' and bound adapters {bound} all have FACTS specs.",
            evidence={"owner_module": owner, "bound_adapters": bound},
        )

    # ------------------------------------------------------------------
    # fvts:unique-ids / fvts:surface-refs
    # ------------------------------------------------------------------

    def _check_unique_ids(self, spec: dict[str, Any]) -> FxTSVerdict:
        violations = []
        groups = (
            ("data_bindings.points", spec.get("data_bindings", {}).get("points", []), "point_id"),
            ("actions", spec.get("actions", []), "action_id"),
            ("surfaces", spec.get("surfaces", []), "surface_id"),
        )
        for field, items, key in groups:
            ids = [item.get(key) for item in items]
            duplicates = sorted({i for i in ids if ids.count(i) > 1}, key=str)
            if duplicates:
                violations.append(
                    SpecViolation(
                        field=field, actual=duplicates, message=f"duplicate {key}: {duplicates}"
                    )
                )
        return self._verdict(
            "unique-ids", "ids", violations, "point, action and surface ids are unique."
        )

    def _check_surface_refs(self, spec: dict[str, Any]) -> FxTSVerdict:
        points, actions = self._points(spec), self._actions(spec)
        violations = []
        for surface in spec.get("surfaces", []):
            sid = surface.get("surface_id")
            for point_id in surface.get("points", []):
                if point_id not in points:
                    violations.append(
                        SpecViolation(
                            field=f"surfaces[{sid}].points",
                            actual=point_id,
                            message=f"surface '{sid}' binds unknown point '{point_id}'",
                        )
                    )
            for action_id in surface.get("actions", []):
                if action_id not in actions:
                    violations.append(
                        SpecViolation(
                            field=f"surfaces[{sid}].actions",
                            actual=action_id,
                            message=f"surface '{sid}' invokes unknown action '{action_id}'",
                        )
                    )
        return self._verdict(
            "surface-refs",
            "surfaces",
            violations,
            f"{len(spec.get('surfaces', []))} surfaces reference only declared points and actions.",
        )

    # ------------------------------------------------------------------
    # fvts:action-target
    # ------------------------------------------------------------------

    def _check_action_target(
        self,
        spec: dict[str, Any],
        facts_specs: dict[str, dict[str, Any]],
        write_config: Any,
    ) -> FxTSVerdict:
        points = self._points(spec)
        owner = spec.get("view_identity", {}).get("owner_module", "")
        owner_facts = facts_specs.get(owner)
        alarms_enabled = bool(spec.get("alarms", {}).get("enabled"))
        tags = write_tags(write_config) if write_config is not None else None
        violations: list[SpecViolation] = []
        checked: list[str] = []
        for action in spec.get("actions", []):
            aid, kind = action.get("action_id"), action.get("kind")
            if kind == "alarm_operation" and not alarms_enabled:
                violations.append(
                    SpecViolation(
                        field=f"actions[{aid}].alarm_operation",
                        message=f"action '{aid}' operates alarms but alarms.enabled is false",
                    )
                )
            if kind != "tag_write":
                continue
            target = action.get("target_point")
            point = points.get(target)
            if point is None:
                violations.append(
                    SpecViolation(
                        field=f"actions[{aid}].target_point",
                        actual=target,
                        message=f"action '{aid}' targets undeclared point '{target}'",
                    )
                )
                continue
            checked.append(aid)
            bound_to = point.get("source", {}).get("adapter_id")
            if bound_to != owner:
                violations.append(
                    SpecViolation(
                        field=f"actions[{aid}].target_point",
                        message=(
                            f"action '{aid}' writes '{target}', which is bound to adapter "
                            f"'{bound_to}', not the owner '{owner}'"
                        ),
                    )
                )
            if (
                owner_facts is not None
                and owner_facts.get("capabilities", {}).get("write") is not True
            ):
                violations.append(
                    SpecViolation(
                        field=f"actions[{aid}]",
                        message=f"owner '{owner}' declares capabilities.write=false in FACTS",
                    )
                )
            if tags is not None:
                violations.extend(self._match_write_tag(aid, point, tags))
        return self._verdict(
            "action-target",
            "actions/target_point",
            violations,
            f"{len(checked)} tag_write action(s) target writable owner points.",
            evidence={
                "tag_write_actions": checked,
                "write_config": "checked" if tags is not None else "not provided",
            },
        )

    @staticmethod
    def _match_write_tag(
        aid: str, point: dict[str, Any], tags: list[dict[str, Any]]
    ) -> list[SpecViolation]:
        tag_path = point.get("source", {}).get("tag_path", "")
        pattern = tag_pattern(tag_path)
        matches = [t for t in tags if pattern.match(t["tag_path"])]
        field = f"actions[{aid}].target_point"
        if not matches:
            return [
                SpecViolation(
                    field=field,
                    actual=tag_path,
                    message=f"action '{aid}': no write_tags entry matches '{tag_path}'",
                )
            ]
        violations = []
        allowed = WRITABLE_TYPES.get(point.get("data_type", ""), frozenset())
        display = point.get("range")
        for tag in matches:
            if not tag["writable"]:
                violations.append(
                    SpecViolation(
                        field=field,
                        message=f"action '{aid}': tag '{tag['tag_path']}' is not writable",
                    )
                )
            if tag["data_type"] not in allowed:
                violations.append(
                    SpecViolation(
                        field=field,
                        expected=sorted(allowed),
                        actual=tag["data_type"],
                        message=(
                            f"action '{aid}': point is {point.get('data_type')} but tag "
                            f"'{tag['tag_path']}' is {tag['data_type']}"
                        ),
                    )
                )
            if display is not None:
                lo, hi = display.get("lo"), display.get("hi")
                low_ok = tag["min_value"] is None or lo is None or lo >= tag["min_value"]
                high_ok = tag["max_value"] is None or hi is None or hi <= tag["max_value"]
                if not (low_ok and high_ok):
                    violations.append(
                        SpecViolation(
                            field=field,
                            expected=f"[{tag['min_value']}, {tag['max_value']}]",
                            actual=f"[{lo}, {hi}]",
                            message=(
                                f"action '{aid}': display range exceeds the writable range of "
                                f"'{tag['tag_path']}'"
                            ),
                        )
                    )
        return violations

    # ------------------------------------------------------------------
    # fvts:action-profile-permitted / fvts:profile-supported
    # ------------------------------------------------------------------

    def _check_action_profile_permitted(self, spec: dict[str, Any]) -> FxTSVerdict:
        supported = set(self._supported(spec))
        violations = []
        for action in spec.get("actions", []):
            aid, kind = action.get("action_id"), action.get("kind")
            for profile in action.get("allowed_profiles", []):
                if profile not in supported:
                    violations.append(
                        SpecViolation(
                            field=f"actions[{aid}].allowed_profiles",
                            actual=profile,
                            message=(
                                f"action '{aid}' allows '{profile}', "
                                "not in render_profiles.supported"
                            ),
                        )
                    )
                elif profile in PROFILE_BASELINE and not kind_permitted(
                    action, effective_profile(spec, profile)
                ):
                    what = kind if kind != "alarm_operation" else action.get("alarm_operation")
                    violations.append(
                        SpecViolation(
                            field=f"actions[{aid}].allowed_profiles",
                            actual=profile,
                            message=(
                                f"action '{aid}': {what} is not permitted on '{profile}' "
                                "by the baseline"
                            ),
                        )
                    )
        return self._verdict(
            "action-profile-permitted",
            "actions/allowed_profiles",
            violations,
            "every action's profiles are supported and permitted by the baseline.",
        )

    def _check_profile_supported(self, spec: dict[str, Any]) -> FxTSVerdict:
        supported = set(self._supported(spec))
        violations = []

        def check(field: str, profiles: Any) -> None:
            for profile in profiles or []:
                if profile not in supported:
                    violations.append(
                        SpecViolation(
                            field=field,
                            actual=profile,
                            message=f"{field} lists '{profile}', not in render_profiles.supported",
                        )
                    )

        for surface in spec.get("surfaces", []):
            check(
                f"surfaces[{surface.get('surface_id')}].allowed_profiles",
                surface.get("allowed_profiles"),
            )
        settings = spec.get("settings", {})
        if settings.get("exposed"):
            check("settings.allowed_profiles", settings.get("allowed_profiles"))
        check("render_profiles.overrides", spec.get("render_profiles", {}).get("overrides", {}))
        check(
            "conformance_tests.renderers_under_test",
            spec.get("conformance_tests", {}).get("renderers_under_test"),
        )
        return self._verdict(
            "profile-supported",
            "render_profiles/supported",
            violations,
            f"surfaces, settings, overrides and renderers stay within {sorted(supported)}.",
        )

    # ------------------------------------------------------------------
    # fvts:profile-baseline / fvts:profile-action-filter
    # ------------------------------------------------------------------

    def _check_profile_baseline(self, spec: dict[str, Any]) -> FxTSVerdict:
        live_rate = spec.get("live_updates", {}).get("max_update_rate_hz")
        violations = []
        if not isinstance(live_rate, int | float) or live_rate <= 0 or live_rate > 20:
            violations.append(
                SpecViolation(
                    field="live_updates.max_update_rate_hz",
                    expected="0 < rate ≤ 20",
                    actual=live_rate,
                    message=f"live_updates.max_update_rate_hz {live_rate!r} is outside (0, 20]",
                )
            )
            live_rate = 20.0
        for profile, override in spec.get("render_profiles", {}).get("overrides", {}).items():
            base = PROFILE_BASELINE.get(profile)
            if base is None:
                continue  # reported by fvts:profile-supported / schema
            ceiling = min(base.max_update_rate_hz, float(live_rate))
            rate = override.get("max_update_rate_hz")
            if rate is not None and rate > ceiling:
                violations.append(
                    SpecViolation(
                        field=f"render_profiles.overrides.{profile}.max_update_rate_hz",
                        expected=f"≤ {ceiling:g}",
                        actual=rate,
                        message=(
                            f"override loosens the '{profile}' rate ceiling "
                            f"({rate} > {ceiling:g} Hz)"
                        ),
                    )
                )
            if override.get("writes_permitted") is True and not base.writes_permitted:
                violations.append(
                    SpecViolation(
                        field=f"render_profiles.overrides.{profile}.writes_permitted",
                        message=(
                            f"override grants tag writes on '{profile}'; the baseline forbids them"
                        ),
                    )
                )
            if (
                override.get("alarm_operations_permitted") is True
                and base.alarm_operations != ALARM_OPERATIONS
            ):
                violations.append(
                    SpecViolation(
                        field=f"render_profiles.overrides.{profile}.alarm_operations_permitted",
                        message=(
                            f"override claims all alarm operations on '{profile}'; the baseline "
                            f"permits {sorted(base.alarm_operations)} only"
                        ),
                    )
                )
        effective = {
            profile: {
                "max_update_rate_hz": effective_profile(spec, profile).max_update_rate_hz,
                "writes_permitted": effective_profile(spec, profile).writes_permitted,
                "alarm_operations": sorted(effective_profile(spec, profile).alarm_operations),
            }
            for profile in self._supported(spec)
            if profile in PROFILE_BASELINE
        }
        return self._verdict(
            "profile-baseline",
            "render_profiles/overrides",
            violations,
            "overrides only tighten the baseline.",
            evidence={"effective": effective},
        )

    def _check_profile_action_filter(self, spec: dict[str, Any]) -> FxTSVerdict:
        table: dict[str, dict[str, list[str]]] = {}
        violations = []
        for surface in spec.get("surfaces", []):
            sid = surface.get("surface_id")
            seen_visible: set[str] = set()
            for profile in surface.get("allowed_profiles", []):
                if profile not in PROFILE_BASELINE:
                    continue
                visible, hidden = visible_actions(spec, surface, profile)
                table[f"{sid}@{profile}"] = {"visible": visible, "hidden": hidden}
                seen_visible.update(visible)
            for action_id in surface.get("actions", []):
                if action_id not in seen_visible:
                    violations.append(
                        SpecViolation(
                            field=f"surfaces[{sid}].actions",
                            actual=action_id,
                            message=(
                                f"surface '{sid}' lists action '{action_id}', "
                                "which is hidden on every "
                                "profile the surface allows"
                            ),
                        )
                    )
        return self._verdict(
            "profile-action-filter",
            "surfaces/actions",
            violations,
            "every surface action is visible on at least one of the surface's profiles.",
            evidence={"filter": table},
        )

    # ------------------------------------------------------------------
    # fvts:cross-site-read-only / fvts:isa101-required / fvts:range-sane
    # ------------------------------------------------------------------

    def _check_cross_site_read_only(self, spec: dict[str, Any]) -> FxTSVerdict:
        if not spec.get("scope", {}).get("multi_site"):
            return self._verdict(
                "cross-site-read-only",
                "scope/multi_site",
                [],
                "single-site contract; writes allowed.",
            )
        actions = self._actions(spec)
        violations = []
        for surface in spec.get("surfaces", []):
            for action_id in surface.get("actions", []):
                if actions.get(action_id, {}).get("kind") == "tag_write":
                    violations.append(
                        SpecViolation(
                            field=f"surfaces[{surface.get('surface_id')}].actions",
                            actual=action_id,
                            message=(
                                f"multi_site contract reaches tag_write '{action_id}' from surface "
                                f"'{surface.get('surface_id')}'; cross-site views are read-only"
                            ),
                        )
                    )
        return self._verdict(
            "cross-site-read-only",
            "scope/multi_site",
            violations,
            "multi_site contract reaches no tag writes.",
        )

    def _check_isa101(self, spec: dict[str, Any]) -> FxTSVerdict:
        hmi = [
            s.get("surface_id") for s in spec.get("surfaces", []) if s.get("kind") == "hmi_screen"
        ]
        flag = spec.get("design_system", {}).get("isa101_high_performance")
        violations = []
        if hmi and flag is not True:
            violations.append(
                SpecViolation(
                    field="design_system.isa101_high_performance",
                    expected=True,
                    actual=flag,
                    message=f"hmi_screen surfaces {hmi} require isa101_high_performance: true",
                )
            )
        return self._verdict(
            "isa101-required",
            "design_system/isa101_high_performance",
            violations,
            f"ISA-101 flag is {flag}; hmi_screen surfaces: {hmi}.",
        )

    def _check_range_sane(self, spec: dict[str, Any]) -> FxTSVerdict:
        violations = []
        for point_id, point in self._points(spec).items():
            rng = point.get("range")
            if rng is None:
                continue
            lo, hi = rng.get("lo"), rng.get("hi")
            if not (isinstance(lo, int | float) and isinstance(hi, int | float) and lo < hi):
                violations.append(
                    SpecViolation(
                        field=f"data_bindings.points[{point_id}].range",
                        expected="lo < hi",
                        actual=f"lo={lo}, hi={hi}",
                        message=f"point '{point_id}' range lo={lo} is not below hi={hi}",
                    )
                )
        reconnect = spec.get("live_updates", {}).get("reconnect") or {}
        initial, maximum = reconnect.get("initial_backoff_ms"), reconnect.get("max_backoff_ms")
        if initial is not None and maximum is not None and initial > maximum:
            violations.append(
                SpecViolation(
                    field="live_updates.reconnect",
                    expected="initial_backoff_ms ≤ max_backoff_ms",
                    actual=f"{initial} > {maximum}",
                    message=(
                        f"reconnect initial_backoff_ms {initial} exceeds max_backoff_ms {maximum}"
                    ),
                )
            )
        return self._verdict(
            "range-sane", "data_bindings/range", violations, "ranges and backoffs are ordered."
        )

    # ------------------------------------------------------------------
    # fvts:conformance-paths / fvts:golden-messages / fvts:metadata
    # ------------------------------------------------------------------

    def _check_conformance_paths(self, spec: dict[str, Any], repo_root: Path) -> FxTSVerdict:
        tests = spec.get("conformance_tests", {})
        violations = []
        suite = tests.get("suite_path")
        if not suite or not (repo_root / suite).is_file():
            violations.append(
                SpecViolation(
                    field="conformance_tests.suite_path",
                    actual=suite,
                    message=f"suite_path {suite!r} does not exist under {repo_root}",
                )
            )
        golden = tests.get("golden_messages_path")
        if golden and not (repo_root / golden).is_dir():
            violations.append(
                SpecViolation(
                    field="conformance_tests.golden_messages_path",
                    actual=golden,
                    message=f"golden_messages_path {golden!r} is not a directory under {repo_root}",
                )
            )
        return self._verdict(
            "conformance-paths",
            "conformance_tests",
            violations,
            f"suite '{suite}' and golden set '{golden}' exist.",
        )

    def _check_golden_messages(
        self, spec: dict[str, Any], messages: list[GoldenMessage] | None, repo_root: Path
    ) -> FxTSVerdict:
        tests = spec.get("conformance_tests", {})
        renderers = list(tests.get("renderers_under_test", []))
        violations: list[SpecViolation] = []
        if messages is None:
            golden = tests.get("golden_messages_path")
            directory = (repo_root / golden) if golden else None
            messages = load_golden_messages(directory) if directory and directory.is_dir() else []
        if not renderers:
            violations.append(
                SpecViolation(
                    field="conformance_tests.renderers_under_test",
                    message=(
                        "no renderers_under_test; a contract without conformance "
                        "evidence is unverified"
                    ),
                )
            )
        if not messages:
            violations.append(
                SpecViolation(
                    field="conformance_tests.golden_messages_path",
                    message="no golden messages found; every FVTS spec ships a golden set",
                )
            )
        runs: dict[str, dict[str, Any]] = {}
        for profile in renderers:
            run = render_golden_set(spec, profile, messages)
            runs[profile] = {
                "rendered": run.rendered,
                "skipped": run.skipped,
                "errors": len(run.errors),
            }
            violations.extend(
                SpecViolation(
                    field=f"conformance_tests.renderers_under_test[{profile}]",
                    message=f"{profile}: {error}",
                )
                for error in run.errors
            )
        return self._verdict(
            "golden-messages",
            "conformance_tests/golden_messages_path",
            violations,
            f"{len(messages)} golden message(s) render on {renderers}.",
            evidence={"renderers": runs, "messages": [m.source for m in messages]},
        )

    def _check_metadata(self, spec: dict[str, Any]) -> FxTSVerdict:
        metadata = spec.get("metadata")
        violations = []
        if metadata is not None and not isinstance(metadata, dict):
            violations.append(
                SpecViolation(
                    field="metadata",
                    message=f"metadata must be an object, got {type(metadata).__name__}",
                )
            )
        return self._verdict("metadata", "metadata", violations, "metadata is a free-form object.")
