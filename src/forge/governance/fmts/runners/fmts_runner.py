"""FMTS runner — checks a module against the forge module requirements (BACKLOG FB-135).

Static checks over an FMTS spec (``<module>.fmts.json``), decided in
``docs/decisions/forge-module-requirements.md`` (D-12): JSON-Schema
validity, FHTS integrity, the waivers, and the requirements that can be
checked without running the module:

    M-1   speaks only gRPC ``forge.v1.AdapterService`` to the hub
    M-2   an approved FACTS spec that the manifest matches
    M-3   a time contract for every counterpart
    M-8   Forge-issued credentials only, no database of its own
    M-9   no user interface code; screens described in FVTS specs
    M-10  roles and scopes declared
    M-11  built from the module SDK template

M-4 to M-7 (the time exchange, failing closed, UTC stamps, health with
refusals by cause) need a running module. The conformance kit
(``forge.governance.fmts.conformance``, FB-137) runs them: for a module on
the ``python-adapter`` template the runner finds the adapter class in the
module's ``adapter.py``, drives it against a reference hub and reports what
happened. A Python module off the template supplies a ``conformance.py`` hook
beside its ``adapter.py`` (the OT module does). A module the kit cannot drive
(another language, another process: FB-155) is reported as SKIP "NOT CHECKED" with
that cause, never as passed.

A requirement the spec waives is reported as SKIP with the waiver's reason
and backlog item on every run. A waiver whose backlog item is closed or
missing fails. A waiver of M-3 or M-4 (time-keeping) needs admin privileges:
it fails until the spec's hash is approved.

    runner = FMTSRunner(schema_path=SCHEMA_PATH)
    report = await runner.run(target="forge-wms", spec=spec)

Keyword arguments to ``run`` (all optional):
    repo_root   Path the spec's repository-relative paths resolve against; default: this checkout
    backlog     {item id: is open}; default: parsed from ``<repo_root>/BACKLOG.md``
"""

from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING, Any, ClassVar

from forge.governance.facts import SCHEMA_PATH as FACTS_SCHEMA_PATH
from forge.governance.fmts import REPO_ROOT
from forge.governance.shared.runner import (
    FxTSRunner,
    FxTSVerdict,
    SpecViolation,
    VerdictStatus,
    load_schema,
    verify_spec_hash,
)

if TYPE_CHECKING:
    from pathlib import Path

REQUIREMENTS: dict[str, str] = {
    "M-1": "speaks only gRPC forge.v1.AdapterService to the hub",
    "M-2": "has an approved FACTS spec that its manifest matches",
    "M-3": "declares a time contract for every counterpart",
    "M-4": "implements the time exchange and reports its measurement",
    "M-5": "fails closed on a bad clock or a hub refusal, with the cause on its health",
    "M-6": "stamps UTC and never invents a source time",
    "M-7": "reports health with refusals by cause",
    "M-8": "holds only Forge-issued credentials and owns no database connection",
    "M-9": "ships no user interface code; its screens are FVTS specs",
    "M-10": "declares its roles and scopes",
    "M-11": "is built from the module SDK template for its language",
    # The transport contract's requirements (D-12 amendment, owner 2026-11-19; D-15).
    "M-12": "gives every record a stable record id",
    "M-13": "stores and forwards what it cannot deliver, with a declared capacity",
    "M-14": "says goodbye on a proper shutdown and declares a last will",
    "M-15": "refuses a command that arrives after its expiry",
    "M-16": "applies each business write-back once by its id and confirms it",
}

# Time-keeping is the core requirement (owner, O-1). Its two requirements can be waived
# only with admin privileges (owner, Q-10, 2026-11-18): the waiver counts once the spec's
# hash is approved, and until then it fails by name. Only the owner approves a hash today;
# the admin scope of the role model takes that place when it exists (FB-075). A waiver
# covers this check only: the hub still refuses a module that does not exchange time (O-2).
# M-15 joins them (owner, 2026-11-19): refusing a late command protects a running process.
ADMIN_WAIVABLE = frozenset({"M-3", "M-4", "M-15"})

# Requirements that bind only a module that declares the matching kind of downward
# message in ``transport`` (owner, 2026-11-19). A command is a write to a tag in a process
# controller that directly affects a process; a business write-back is delivered once and
# only once. For any other module the claim is ``not_applicable``.
CONDITIONAL: dict[str, str] = {
    "M-15": "process_control_writes",
    "M-16": "business_write_backs",
}
# Checked against a running module once the transport contract is built (FB-164): the
# conformance kit has no check for them yet, so a claim of "met" is reported as not checked.
TRANSPORT_KIT = ("M-12", "M-13", "M-14", "M-15", "M-16")
TRANSPORT_KIT_ITEM = "FB-164"

# Checked against a running module by the conformance kit (FB-137). The kit drives a
# Python adapter in this process; a driver for any other module is FB-155.
CONFORMANCE_KIT = ("M-4", "M-5", "M-6", "M-7")
CONFORMANCE_KIT_ITEM = "FB-155"

# The hub's REST routes a module must not call (M-1; the routes themselves retire with FB-123).
HUB_REST_ROUTES = ("/v1/records", "/v1/adapters/register")

SOURCE_SUFFIXES = frozenset({".py", ".go", ".ts", ".js", ".mjs", ".cjs"})
UI_SUFFIXES = frozenset({".tsx", ".jsx", ".vue", ".svelte"})
SKIPPED_DIRS = frozenset(
    {"node_modules", "__pycache__", ".git", ".next", "dist", "build", "coverage", ".turbo"}
)

# The six-file layout ``forge module init`` generates (docs/MODULE_BUILDER.md §2).
PYTHON_ADAPTER_FILES = (
    "__init__.py",
    "manifest.json",
    "adapter.py",
    "config.py",
    "context.py",
    "record_builder.py",
)
# The Go layout of docs/decisions/forge-mes-go.md §4.
GO_MODULE_PATHS = ("backend", "spec/manifest.json", "cmd")

SCOPE_PATTERN = re.compile(r"^[a-z][a-z0-9-]*(:[a-z0-9*][a-z0-9*-]*)+$")
ROLE_ID_PATTERN = re.compile(r"^[a-z][a-z0-9-]*$")
BACKLOG_ROW = re.compile(r"^\| (FB-\d{3,}) \| [^|]+ \| (.*)$")
BACKLOG_CLOSED = ("**Done", "**Fixed")

_TOP_LEVEL = frozenset(
    {
        "spec_version",
        "module_identity",
        "hub_link",
        "transport",
        "references",
        "baseline",
        "waivers",
        "time_contract",
        "user_interface",
        "scaffold",
        "metadata",
        "integrity",
    }
)
_WAIVER = frozenset({"requirement", "reason", "backlog_item"})
_DATABASE = frozenset(
    {
        "name",
        "owner",
        "engine",
        "access",
        "credential",
        "written_time_source",
        "clock_read_method",
        "tolerance_class",
        "clock_probe_interval_seconds",
        "offset_reported",
        "polling_interval_seconds",
        "fail_closed",
    }
)
_THIRD_PARTY = frozenset(
    {
        "name",
        "interface",
        "clock_read_method",
        "tolerance_class",
        "clock_probe_interval_seconds",
        "offset_reported",
        "polling_interval_seconds",
        "fail_closed",
    }
)


def load_backlog(repo_root: Path) -> dict[str, bool]:
    """Read ``BACKLOG.md`` into ``{item id: is open}``.

    An item is closed when its description starts with ``**Done`` or ``**Fixed``.
    A missing file gives an empty mapping, so every waiver then fails as unknown.
    """
    path = repo_root / "BACKLOG.md"
    if not path.is_file():
        return {}
    items: dict[str, bool] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        match = BACKLOG_ROW.match(line)
        if match:
            items[match.group(1)] = not match.group(2).startswith(BACKLOG_CLOSED)
    return items


def _walk(root: Path) -> list[Path]:
    """Every file under ``root``, without vendored, built or cached directories."""
    if root.is_file():
        return [root]
    found: list[Path] = []
    stack = [root]
    while stack:
        for entry in sorted(stack.pop().iterdir()):
            if entry.is_dir():
                if entry.name not in SKIPPED_DIRS and not entry.is_symlink():
                    stack.append(entry)
            elif entry.is_file():
                found.append(entry)
    return found


def _load_json(path: Path) -> tuple[Any, str]:
    """Return ``(document, "")`` or ``(None, why it could not be read)``."""
    if not path.is_file():
        return None, "file not found"
    try:
        return json.loads(path.read_text(encoding="utf-8")), ""
    except (OSError, json.JSONDecodeError) as exc:
        return None, f"not readable as JSON: {exc}"


class FMTSRunner(FxTSRunner):
    """Module requirements runner for the FMTS framework."""

    framework = "FMTS"
    version = "0.1.0"

    _ENFORCED_FIELDS: ClassVar[set[str]] = set(_TOP_LEVEL) | {
        f"$.{field}" for field in _WAIVER | _DATABASE | _THIRD_PARTY
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
                    check_id="fmts:spec-load",
                    spec_ref="FMTS/spec-load",
                    status=VerdictStatus.ERROR,
                    message=f"No spec provided for module '{target}'.",
                )
            ]
        repo_root: Path = kwargs.get("repo_root") or REPO_ROOT
        backlog: dict[str, bool] = (
            kwargs["backlog"] if kwargs.get("backlog") is not None else load_backlog(repo_root)
        )
        schema_verdict = self._check_schema_valid(spec)
        head = [
            schema_verdict,
            self._check_identity(spec, target),
            *self._check_integrity(spec),
            self._check_enum_parity(),
        ]
        if schema_verdict.status != VerdictStatus.PASS:
            # The remaining checks read fields the schema guarantees; without it they
            # would report noise. The schema failure is the finding.
            return head
        facts_spec, facts_error = _load_json(repo_root / spec["references"]["facts"]["path"])
        requirement_checks = {
            "M-1": lambda: self._check_m1(spec, repo_root),
            "M-2": lambda: self._check_m2(spec, repo_root, facts_spec, facts_error),
            "M-3": lambda: self._check_m3(spec, facts_spec),
            "M-8": lambda: self._check_m8(spec),
            "M-9": lambda: self._check_m9(spec, repo_root),
            "M-10": lambda: self._check_m10(spec, repo_root),
            "M-11": lambda: self._check_m11(spec, repo_root),
        }
        waived = {w["requirement"]: w for w in spec["waivers"]}
        verdicts = [
            *head,
            self._check_source_paths(spec, repo_root),
            self._check_waivers(spec, backlog),
            self._check_transport(spec, facts_spec),
        ]
        wanted = [
            r for r in CONFORMANCE_KIT if not (spec["baseline"][r] == "waived" and r in waived)
        ]
        kit, kit_blocked = await self._run_kit(spec, repo_root) if wanted else ({}, "")
        for requirement in REQUIREMENTS:
            if spec["baseline"][requirement] == "waived" and requirement in waived:
                verdicts.append(self._waived(requirement, waived[requirement]))
            elif spec["baseline"][requirement] == "not_applicable":
                verdicts.append(self._not_applicable(spec, requirement))
            elif requirement in TRANSPORT_KIT:
                verdicts.append(self._needs_transport_contract(requirement))
            elif requirement in CONFORMANCE_KIT:
                verdicts.append(
                    kit.get(requirement) or self._needs_conformance_kit(requirement, kit_blocked)
                )
            else:
                verdicts.append(requirement_checks[requirement]())
        verdicts.append(self._check_metadata(spec))
        return verdicts

    # ------------------------------------------------------------------
    # Verdict helpers
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
                check_id=f"fmts:{check}",
                spec_ref=f"FMTS/{ref}",
                status=VerdictStatus.FAIL,
                message=f"{len(violations)} violation(s): {head}{more}",
                violations=violations,
                evidence=evidence or {},
            )
        return FxTSVerdict(
            check_id=f"fmts:{check}",
            spec_ref=f"FMTS/{ref}",
            status=VerdictStatus.PASS,
            message=ok,
            evidence=evidence or {},
        )

    @staticmethod
    def _check_id(requirement: str) -> str:
        return requirement.lower().replace("-", "")

    def _waived(self, requirement: str, waiver: dict[str, Any]) -> FxTSVerdict:
        return FxTSVerdict(
            check_id=f"fmts:{self._check_id(requirement)}",
            spec_ref=f"FMTS/baseline/{requirement}",
            status=VerdictStatus.SKIP,
            message=(
                f"WAIVED until {waiver['backlog_item']}: {requirement} "
                f"({REQUIREMENTS[requirement]}) is not enforced. Reason: {waiver['reason']}"
            ),
            evidence={"waived": True, "backlog_item": waiver["backlog_item"]},
        )

    def _needs_conformance_kit(self, requirement: str, why: str) -> FxTSVerdict:
        return FxTSVerdict(
            check_id=f"fmts:{self._check_id(requirement)}",
            spec_ref=f"FMTS/baseline/{requirement}",
            status=VerdictStatus.SKIP,
            message=(
                f"NOT CHECKED: {requirement} ({REQUIREMENTS[requirement]}) needs a running "
                f"module, and the conformance kit cannot drive this one: {why} "
                f"({CONFORMANCE_KIT_ITEM}). The claim 'met' is unverified."
            ),
            evidence={"waived": False, "unverified": True, "blocked_on": CONFORMANCE_KIT_ITEM},
        )

    def _needs_transport_contract(self, requirement: str) -> FxTSVerdict:
        return FxTSVerdict(
            check_id=f"fmts:{self._check_id(requirement)}",
            spec_ref=f"FMTS/baseline/{requirement}",
            status=VerdictStatus.SKIP,
            message=(
                f"NOT CHECKED: {requirement} ({REQUIREMENTS[requirement]}) is behaviour of the "
                "transport contract, which is not built, so the conformance kit has no check "
                f"for it ({TRANSPORT_KIT_ITEM}). The claim 'met' is unverified."
            ),
            evidence={"waived": False, "unverified": True, "blocked_on": TRANSPORT_KIT_ITEM},
        )

    def _not_applicable(self, spec: dict[str, Any], requirement: str) -> FxTSVerdict:
        """A conditional requirement the module is not bound by; the claim must be true."""
        flag = CONDITIONAL.get(requirement)
        violations = []
        if flag is None:
            violations.append(
                SpecViolation(
                    field=f"baseline.{requirement}",
                    message=f"{requirement} binds every module; it cannot be not_applicable",
                )
            )
        elif spec["transport"][flag]:
            violations.append(
                SpecViolation(
                    field=f"baseline.{requirement}",
                    message=(
                        f"transport.{flag} is true, so {requirement} "
                        f"({REQUIREMENTS[requirement]}) is required: claim met, or waive it"
                    ),
                )
            )
        return self._verdict(
            self._check_id(requirement),
            f"baseline/{requirement}",
            violations,
            f"Not applicable: transport.{flag} is false, so {requirement} does not bind "
            "this module.",
            evidence={"not_applicable": True},
        )

    def _check_transport(self, spec: dict[str, Any], facts_spec: Any) -> FxTSVerdict:
        """``fmts:transport``: the two declarations agree with the claims and with FACTS."""
        transport, baseline = spec["transport"], spec["baseline"]
        violations = [
            SpecViolation(
                field=f"baseline.{requirement}",
                message=(
                    f"transport.{flag} is false, so {requirement} does not bind this module: "
                    f"claim not_applicable, not {baseline[requirement]!r}"
                ),
            )
            for requirement, flag in CONDITIONAL.items()
            if not transport[flag] and baseline[requirement] != "not_applicable"
        ]
        declared = sorted(flag for flag in CONDITIONAL.values() if transport[flag])
        writes = None
        if isinstance(facts_spec, dict):
            writes = bool((facts_spec.get("capabilities") or {}).get("write"))
            if writes and not declared:
                violations.append(
                    SpecViolation(
                        field="transport",
                        message=(
                            "the FACTS spec declares the write capability, but the module "
                            "declares neither process-control writes nor business write-backs"
                        ),
                    )
                )
            if not writes and declared:
                violations.append(
                    SpecViolation(
                        field="transport",
                        message=(
                            f"the module declares {', '.join(declared)}, but its FACTS spec "
                            "declares no write capability"
                        ),
                    )
                )
        if (
            spec["module_identity"]["kind"] == "ot"
            and writes
            and not transport[CONDITIONAL["M-15"]]
        ):
            violations.append(
                SpecViolation(
                    field="transport.process_control_writes",
                    message=(
                        "a module of kind 'ot' with the write capability writes to process "
                        "controllers; process_control_writes must be true"
                    ),
                )
            )
        return self._verdict(
            "transport",
            "transport",
            violations,
            (f"Declares {', '.join(declared)}; " if declared else "Takes no downward writes; ")
            + "the claims for M-15 and M-16 and the FACTS write capability agree.",
            evidence={"declared": declared, "facts_write": writes},
        )

    async def _run_kit(
        self, spec: dict[str, Any], repo_root: Path
    ) -> tuple[dict[str, FxTSVerdict], str]:
        """Run the conformance kit on the module; the verdicts, or why it could not run."""
        from forge.governance.fmts import conformance

        template = spec["scaffold"]["template"]
        paths = spec["module_identity"]["source_paths"]
        manifest, _ = _load_json(repo_root / spec["references"]["manifest"])
        load = None
        try:
            fixture = conformance.load_fixture(repo_root, spec["module_identity"]["module_id"])
            if template == "python-adapter":
                found = [rel for rel in paths if (repo_root / rel / "adapter.py").is_file()]
                module_name = conformance.adapter_module_name(found[0]) if found else None
                if module_name is None:
                    return {}, (
                        "its adapter.py is not in an importable Forge package under src/forge"
                    )
                factory = conformance.find_adapter_class(module_name)
            else:
                # off the template: the module supplies its own hook beside its adapter.py
                hooked = [
                    rel for rel in paths if (repo_root / rel / conformance.HOOK_FILE).is_file()
                ]
                hook = conformance.load_hook(hooked[0]) if hooked else None
                if hook is None:
                    return {}, (
                        f"it is not on the python-adapter template (template '{template}') "
                        f"and supplies no {conformance.HOOK_FILE} hook"
                    )
                factory, load = hook
        except Exception as exc:
            return {}, f"it could not be loaded ({type(exc).__name__}: {exc})"
        params = {
            **conformance.placeholder_params(manifest if isinstance(manifest, dict) else {}),
            **fixture.get("params", {}),
        }
        events = list(fixture.get("events", []))
        results = await conformance.run_conformance(
            lambda hub: conformance.PythonAdapterDriver(
                hub, factory, params=params, events=events, load=load
            )
        )
        return results, ""

    # ------------------------------------------------------------------
    # fmts:schema-valid, fmts:identity-match, fmts:hash-*, fmts:enum-parity
    # ------------------------------------------------------------------

    def _check_schema_valid(self, spec: dict[str, Any]) -> FxTSVerdict:
        if self.schema is None:
            return FxTSVerdict(
                check_id="fmts:schema-valid",
                spec_ref="FMTS/schema",
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

    def _check_identity(self, spec: dict[str, Any], target: str) -> FxTSVerdict:
        identity = spec.get("module_identity")
        module_id = identity.get("module_id", "") if isinstance(identity, dict) else ""
        violations = []
        if module_id != target:
            violations.append(
                SpecViolation(
                    field="module_identity.module_id",
                    expected=target,
                    actual=module_id,
                    message=f"module_id '{module_id}' does not match target '{target}'",
                )
            )
        return self._verdict(
            "identity-match", "module_identity", violations, f"module_id is '{module_id}'."
        )

    def _check_integrity(self, spec: dict[str, Any]) -> list[FxTSVerdict]:
        """The two hash verdicts, from the shared runner (D-14, F-4), at this place."""
        return self.integrity_verdicts(spec)

    def _check_enum_parity(self) -> FxTSVerdict:
        if self.schema is None:
            return FxTSVerdict(
                check_id="fmts:enum-parity",
                spec_ref="FMTS/$defs",
                status=VerdictStatus.ERROR,
                message="No schema configured; cannot compare enums.",
            )
        facts = load_schema(FACTS_SCHEMA_PATH)
        want = set(facts["properties"]["time_governance"]["properties"]["tolerance_class"]["enum"])
        have = set(self.schema.get("$defs", {}).get("toleranceClass", {}).get("enum", []))
        claims = set(self.schema.get("properties", {}).get("baseline", {}).get("required", []))
        violations = []
        if have != want:
            violations.append(
                SpecViolation(
                    field="$defs.toleranceClass",
                    expected=sorted(want),
                    actual=sorted(have),
                    message=(
                        "$defs.toleranceClass drifted from FACTS time_governance.tolerance_class: "
                        f"missing {sorted(want - have)}, extra {sorted(have - want)}"
                    ),
                )
            )
        if claims != set(REQUIREMENTS):
            violations.append(
                SpecViolation(
                    field="properties.baseline.required",
                    expected=sorted(REQUIREMENTS),
                    actual=sorted(claims),
                    message="the schema's baseline claims drifted from the runner's requirements",
                )
            )
        return self._verdict(
            "enum-parity",
            "$defs",
            violations,
            "Tolerance classes match FACTS; the baseline lists the sixteen requirements.",
        )

    # ------------------------------------------------------------------
    # fmts:source-paths, fmts:waivers
    # ------------------------------------------------------------------

    def _check_source_paths(self, spec: dict[str, Any], repo_root: Path) -> FxTSVerdict:
        paths = spec["module_identity"]["source_paths"]
        violations = [
            SpecViolation(
                field="module_identity.source_paths",
                actual=rel,
                message=f"source path '{rel}' does not exist in the repository",
            )
            for rel in paths
            if not self._inside(repo_root, rel) or not (repo_root / rel).exists()
        ]
        return self._verdict(
            "source-paths",
            "module_identity/source_paths",
            violations,
            f"{len(paths)} source path(s) exist.",
        )

    @staticmethod
    def _inside(repo_root: Path, rel: str) -> bool:
        """A declared path stays inside the repository."""
        try:
            (repo_root / rel).resolve().relative_to(repo_root.resolve())
        except ValueError:
            return False
        return True

    def _check_waivers(self, spec: dict[str, Any], backlog: dict[str, bool]) -> FxTSVerdict:
        baseline, waivers = spec["baseline"], spec["waivers"]
        integrity = spec.get("integrity") or {}
        approved_by = (
            integrity.get("approved_by") if integrity.get("hash_state") == "approved" else ""
        ) or ""
        violations = []
        seen: set[str] = set()
        for index, waiver in enumerate(waivers):
            requirement, item = waiver["requirement"], waiver["backlog_item"]
            field = f"waivers[{index}]"
            if requirement in seen:
                violations.append(
                    SpecViolation(field=field, message=f"{requirement} is waived more than once")
                )
            seen.add(requirement)
            if requirement in ADMIN_WAIVABLE and not approved_by:
                violations.append(
                    SpecViolation(
                        field=field,
                        message=(
                            f"{requirement} is waived only with admin privileges (time "
                            "keeping, and refusing a late command): the waiver does not "
                            "count until the spec's hash is approved"
                        ),
                    )
                )
            if baseline[requirement] != "waived":
                violations.append(
                    SpecViolation(
                        field=field,
                        message=(
                            f"{requirement} has a waiver but the baseline claims "
                            f"{baseline[requirement]!r}"
                        ),
                    )
                )
            if item not in backlog:
                violations.append(
                    SpecViolation(
                        field=f"{field}.backlog_item",
                        actual=item,
                        message=f"{item} is not in BACKLOG.md; a waiver names an open item",
                    )
                )
            elif not backlog[item]:
                violations.append(
                    SpecViolation(
                        field=f"{field}.backlog_item",
                        actual=item,
                        message=(
                            f"{item} is closed, so the waiver of {requirement} has expired: "
                            "meet the requirement and remove the waiver"
                        ),
                    )
                )
        violations.extend(
            SpecViolation(
                field=f"baseline.{requirement}",
                message=f"{requirement} is claimed 'waived' but no waiver names it",
            )
            for requirement, claim in baseline.items()
            if claim == "waived" and requirement not in seen
        )
        return self._verdict(
            "waivers",
            "waivers",
            violations,
            f"{len(waivers)} waiver(s), each naming an open backlog item."
            if waivers
            else "No waivers: every requirement that binds the module is claimed met.",
            evidence={
                "waived": sorted(seen),
                "backlog_items": {w["requirement"]: w["backlog_item"] for w in waivers},
                "admin_waivers": sorted(seen & ADMIN_WAIVABLE),
                "approved_by": approved_by,
            },
        )

    # ------------------------------------------------------------------
    # fmts:m1 — gRPC AdapterService only
    # ------------------------------------------------------------------

    def _check_m1(self, spec: dict[str, Any], repo_root: Path) -> FxTSVerdict:
        violations = []
        scanned = 0
        for rel in spec["module_identity"]["source_paths"]:
            root = repo_root / rel
            if not self._inside(repo_root, rel) or not root.exists():
                continue  # reported by fmts:source-paths
            for path in _walk(root):
                if path.suffix not in SOURCE_SUFFIXES:
                    continue
                scanned += 1
                try:
                    text = path.read_text(encoding="utf-8", errors="replace")
                except OSError as exc:
                    violations.append(
                        SpecViolation(field=str(path.relative_to(repo_root)), message=str(exc))
                    )
                    continue
                for route in HUB_REST_ROUTES:
                    if route in text:
                        where = path.relative_to(repo_root)
                        violations.append(
                            SpecViolation(
                                field=str(where),
                                actual=route,
                                message=(
                                    f"{where} names the hub REST route {route}; a module "
                                    "reaches the hub only through forge.v1.AdapterService"
                                ),
                            )
                        )
        return self._verdict(
            "m1",
            "baseline/M-1",
            violations,
            f"hub_link is gRPC forge.v1.AdapterService; no hub REST route in {scanned} "
            "source file(s).",
            evidence={"files_scanned": scanned, "routes": list(HUB_REST_ROUTES)},
        )

    # ------------------------------------------------------------------
    # fmts:m2 — an approved FACTS spec that the manifest matches
    # ------------------------------------------------------------------

    def _check_m2(
        self,
        spec: dict[str, Any],
        repo_root: Path,
        facts_spec: Any,
        facts_error: str,
    ) -> FxTSVerdict:
        ref = spec["references"]["facts"]
        violations = []
        identity: dict[str, Any] = {}
        if not isinstance(facts_spec, dict):
            violations.append(
                SpecViolation(
                    field="references.facts.path",
                    actual=ref["path"],
                    message=f"FACTS spec {ref['path']}: {facts_error or 'not a JSON object'}",
                )
            )
        else:
            identity = facts_spec.get("adapter_identity") or {}
            if identity.get("adapter_id") != ref["adapter_id"]:
                violations.append(
                    SpecViolation(
                        field="references.facts.adapter_id",
                        expected=ref["adapter_id"],
                        actual=identity.get("adapter_id"),
                        message=(
                            f"the FACTS spec is for '{identity.get('adapter_id')}', "
                            f"not '{ref['adapter_id']}'"
                        ),
                    )
                )
            verified, hash_message = verify_spec_hash(facts_spec)
            if verified is not True:
                violations.append(
                    SpecViolation(
                        field="references.facts.path",
                        message=f"the FACTS spec's hash does not verify: {hash_message}",
                    )
                )
            integrity = facts_spec.get("integrity") or {}
            if integrity.get("hash_state") != "approved" or not integrity.get("approved_by"):
                violations.append(
                    SpecViolation(
                        field="references.facts.path",
                        actual=integrity.get("hash_state"),
                        message="the FACTS spec is not approved by the owner",
                    )
                )
        manifest_rel = spec["references"]["manifest"]
        manifest, manifest_error = _load_json(repo_root / manifest_rel)
        if not isinstance(manifest, dict):
            violations.append(
                SpecViolation(
                    field="references.manifest",
                    actual=manifest_rel,
                    message=f"manifest {manifest_rel}: {manifest_error or 'not a JSON object'}",
                )
            )
        elif identity:
            violations.extend(
                SpecViolation(
                    field=f"references.manifest:{key}",
                    expected=identity.get(key),
                    actual=manifest.get(key),
                    message=(
                        f"manifest {key} is {manifest.get(key)!r} but the FACTS spec "
                        f"declares {identity.get(key)!r}"
                    ),
                )
                for key in ("adapter_id", "version", "type", "tier", "protocol")
                if manifest.get(key) != identity.get(key)
            )
            # the hub refuses a registration whose schema_ref differs from the spec's
            spec_ref = (facts_spec.get("data_contract") or {}).get("schema_ref")
            manifest_ref = (manifest.get("data_contract") or {}).get("schema_ref")
            if spec_ref and spec_ref != manifest_ref:
                violations.append(
                    SpecViolation(
                        field="references.manifest:data_contract.schema_ref",
                        expected=spec_ref,
                        actual=manifest_ref,
                        message=(
                            f"manifest schema_ref is {manifest_ref!r} but the FACTS spec "
                            f"declares {spec_ref!r}; the hub refuses that registration"
                        ),
                    )
                )
        return self._verdict(
            "m2",
            "baseline/M-2",
            violations,
            f"FACTS spec '{ref['adapter_id']}' is approved and the manifest matches its identity.",
        )

    # ------------------------------------------------------------------
    # fmts:m3 — the time contract
    # ------------------------------------------------------------------

    def _check_m3(self, spec: dict[str, Any], facts_spec: Any) -> FxTSVerdict:
        contract = spec["time_contract"]
        kind = spec["module_identity"]["kind"]
        governance = (
            facts_spec.get("time_governance") if isinstance(facts_spec, dict) else None
        ) or {}
        violations = []
        if not governance.get("tolerance_class"):
            violations.append(
                SpecViolation(
                    field="time_contract.hub",
                    message=(
                        "the FACTS spec declares no time_governance.tolerance_class, so the "
                        "link to the hub has no tolerance class"
                    ),
                )
            )
        devices = contract["plant_floor_devices"]
        if kind == "ot" and devices != "declared-in-facts":
            violations.append(
                SpecViolation(
                    field="time_contract.plant_floor_devices",
                    actual=devices,
                    message="an ot module talks to plant-floor devices and must declare them",
                )
            )
        if (
            devices == "declared-in-facts"
            and not governance.get("clock_read_method")
            and governance.get("source_timestamp_origin") != "forge"
        ):
            violations.append(
                SpecViolation(
                    field="time_contract.plant_floor_devices",
                    message=(
                        "the FACTS time_governance names no clock_read_method for the "
                        "devices and does not declare source_timestamp_origin 'forge'"
                    ),
                )
            )
        if kind == "integration" and not contract["third_party_systems"]:
            violations.append(
                SpecViolation(
                    field="time_contract.third_party_systems",
                    message=(
                        "an integration module declares the third-party system it "
                        "integrates and that system's time contract entry"
                    ),
                )
            )
        for index, database in enumerate(contract["databases"]):
            violations.extend(self._database_violations(index, database))
        for index, system in enumerate(contract["third_party_systems"]):
            violations.extend(
                self._clock_violations(f"time_contract.third_party_systems[{index}]", system)
            )
        for group in ("databases", "third_party_systems"):
            names = [entry["name"] for entry in contract[group]]
            violations.extend(
                SpecViolation(
                    field=f"time_contract.{group}",
                    actual=name,
                    message=f"'{name}' is declared more than once in {group}",
                )
                for name in sorted({n for n in names if names.count(n) > 1})
            )
        return self._verdict(
            "m3",
            "baseline/M-3",
            violations,
            f"Time contract: hub ({governance.get('tolerance_class')}), "
            f"{len(contract['databases'])} database(s), "
            f"{len(contract['third_party_systems'])} third-party system(s), "
            f"plant-floor devices {devices}.",
            evidence={"hub_tolerance_class": governance.get("tolerance_class")},
        )

    def _database_violations(self, index: int, database: dict[str, Any]) -> list[SpecViolation]:
        field = f"time_contract.databases[{index}]"
        name = database["name"]
        violations = []
        writes = database["access"] in ("write", "read-write")
        if database["owner"] == "third-party":
            violations.extend(self._clock_violations(field, database))
            if writes and "written_time_source" not in database:
                violations.append(
                    SpecViolation(
                        field=f"{field}.written_time_source",
                        message=f"'{name}' is written but names no written_time_source",
                    )
                )
            return violations
        # A hub database's clock is the hub's to check (Q-5); a module-owned one is an
        # M-8 violation, and until it is gone its times follow the same rule.
        if writes and "written_time_source" not in database:
            violations.append(
                SpecViolation(
                    field=f"{field}.written_time_source",
                    message=(
                        f"'{name}' is written but names no written_time_source; a time "
                        "the module writes comes from its own governed clock or the "
                        "hub's, never from the database's now()"
                    ),
                )
            )
        violations.extend(
            SpecViolation(
                field=f"{field}.{key}",
                message=(
                    f"'{name}' is owned by the {database['owner']}; {key} applies only "
                    "to a third-party database, whose clock the module measures"
                ),
            )
            for key in (
                "clock_read_method",
                "tolerance_class",
                "clock_probe_interval_seconds",
                "offset_reported",
                "polling_interval_seconds",
            )
            if key in database
        )
        return violations

    @staticmethod
    def _clock_violations(field: str, entry: dict[str, Any]) -> list[SpecViolation]:
        """A third-party clock is either read and corrected, or declared unreadable."""
        name = entry["name"]
        method = entry.get("clock_read_method")
        if method is None:
            return [
                SpecViolation(
                    field=f"{field}.clock_read_method",
                    message=f"'{name}' names no clock_read_method",
                )
            ]
        if method == "unreadable":
            violations = [
                SpecViolation(
                    field=f"{field}.{key}",
                    message=f"'{name}' has an unreadable clock; {key} does not apply",
                )
                for key in ("tolerance_class", "clock_probe_interval_seconds", "offset_reported")
                if key in entry
            ]
            if "polling_interval_seconds" not in entry:
                violations.append(
                    SpecViolation(
                        field=f"{field}.polling_interval_seconds",
                        message=(
                            f"'{name}' has an unreadable clock: the module's read time is "
                            "the stamp and polling_interval_seconds is the uncertainty "
                            "recorded on every record"
                        ),
                    )
                )
            return violations
        violations = [
            SpecViolation(
                field=f"{field}.{key}",
                message=f"'{name}' has a readable clock ({method}) and must declare {key}",
            )
            for key in ("tolerance_class", "clock_probe_interval_seconds", "offset_reported")
            if key not in entry
        ]
        if "polling_interval_seconds" in entry:
            violations.append(
                SpecViolation(
                    field=f"{field}.polling_interval_seconds",
                    message=(
                        f"'{name}' has a readable clock; polling_interval_seconds is the "
                        "uncertainty of an unreadable one"
                    ),
                )
            )
        return violations

    # ------------------------------------------------------------------
    # fmts:m8 — Forge-issued credentials, no database of its own
    # ------------------------------------------------------------------

    def _check_m8(self, spec: dict[str, Any]) -> FxTSVerdict:
        violations = []
        databases = spec["time_contract"]["databases"]
        for index, database in enumerate(databases):
            field = f"time_contract.databases[{index}]"
            name, owner, credential = database["name"], database["owner"], database["credential"]
            if owner == "module":
                violations.append(
                    SpecViolation(
                        field=f"{field}.owner",
                        message=(
                            f"'{name}' is the module's own database; the hub owns the "
                            "databases and a module owns no connection of its own (A-6)"
                        ),
                    )
                )
            if credential == "module-held":
                violations.append(
                    SpecViolation(
                        field=f"{field}.credential",
                        message=f"'{name}' is reached with a credential the module holds itself",
                    )
                )
            if owner == "hub" and credential != "forge-issued":
                violations.append(
                    SpecViolation(
                        field=f"{field}.credential",
                        expected="forge-issued",
                        actual=credential,
                        message=f"'{name}' is a hub database and takes a Forge-issued credential",
                    )
                )
            if owner == "third-party" and credential == "forge-issued":
                violations.append(
                    SpecViolation(
                        field=f"{field}.credential",
                        actual=credential,
                        message=(
                            f"'{name}' is a third-party database; Forge does not issue its "
                            "credentials"
                        ),
                    )
                )
        return self._verdict(
            "m8",
            "baseline/M-8",
            violations,
            f"{len(databases)} database(s) declared; none is the module's own.",
        )

    # ------------------------------------------------------------------
    # fmts:m9 — no user interface code; screens are FVTS specs
    # ------------------------------------------------------------------

    def _check_m9(self, spec: dict[str, Any], repo_root: Path) -> FxTSVerdict:
        interface = spec["user_interface"]
        identity = spec["module_identity"]
        is_display = identity["kind"] == "display"
        violations = []
        ui_files: list[str] = []
        for rel in identity["source_paths"]:
            root = repo_root / rel
            if not self._inside(repo_root, rel) or not root.exists():
                continue  # reported by fmts:source-paths
            ui_files.extend(
                str(path.relative_to(repo_root))
                for path in _walk(root)
                if path.suffix in UI_SUFFIXES
            )
        if not is_display:
            if interface["ships_ui_code"]:
                violations.append(
                    SpecViolation(
                        field="user_interface.ships_ui_code",
                        message=(
                            "the module declares that it ships user interface code; every "
                            "interface is rendered by forge-display (A-3)"
                        ),
                    )
                )
            if ui_files:
                violations.append(
                    SpecViolation(
                        field="module_identity.source_paths",
                        actual=ui_files[:5],
                        message=(
                            f"{len(ui_files)} user interface source file(s) in the module's "
                            f"source, the first: {ui_files[0]}"
                        ),
                    )
                )
        elif not interface["ships_ui_code"]:
            violations.append(
                SpecViolation(
                    field="user_interface.ships_ui_code",
                    message="the display module renders the interfaces and declares that it does",
                )
            )
        fvts_refs = spec["references"].get("fvts", [])
        if interface["screens"] and not fvts_refs:
            violations.append(
                SpecViolation(
                    field="references.fvts",
                    message="the module has screens but names no FVTS spec that describes them",
                )
            )
        facts_adapter = spec["references"]["facts"]["adapter_id"]
        for rel in fvts_refs:
            view, error = _load_json(repo_root / rel)
            if not isinstance(view, dict):
                violations.append(
                    SpecViolation(
                        field="references.fvts",
                        actual=rel,
                        message=f"FVTS spec {rel}: {error or 'not a JSON object'}",
                    )
                )
                continue
            owner = (view.get("view_identity") or {}).get("owner_module")
            if owner != facts_adapter:
                violations.append(
                    SpecViolation(
                        field="references.fvts",
                        expected=facts_adapter,
                        actual=owner,
                        message=f"FVTS spec {rel} belongs to '{owner}', not '{facts_adapter}'",
                    )
                )
        return self._verdict(
            "m9",
            "baseline/M-9",
            violations,
            "The display module renders the interfaces; M-9 does not bind it."
            if is_display
            else f"No user interface code; {len(fvts_refs)} FVTS spec(s) describe the screens.",
            evidence={"ui_files": len(ui_files), "fvts": list(fvts_refs)},
        )

    # ------------------------------------------------------------------
    # fmts:m10 — roles and scopes
    # ------------------------------------------------------------------

    def _check_m10(self, spec: dict[str, Any], repo_root: Path) -> FxTSVerdict:
        rel = spec["references"].get("roles")
        if rel is None:
            return self._verdict(
                "m10",
                "baseline/M-10",
                [
                    SpecViolation(
                        field="references.roles",
                        message="the module names no roles file; its roles ship as data (R-12)",
                    )
                ],
                "",
            )
        document, error = _load_json(repo_root / rel)
        roles = document.get("roles") if isinstance(document, dict) else None
        if not isinstance(roles, list) or not roles:
            reason = error or "it has no non-empty 'roles' list"
            return self._verdict(
                "m10",
                "baseline/M-10",
                [
                    SpecViolation(
                        field="references.roles", actual=rel, message=f"roles file {rel}: {reason}"
                    )
                ],
                "",
            )
        violations = []
        role_ids = [r.get("role_id") if isinstance(r, dict) else None for r in roles]
        for index, role in enumerate(roles):
            field = f"{rel}:roles[{index}]"
            if not isinstance(role, dict):
                violations.append(SpecViolation(field=field, message="a role is a JSON object"))
                continue
            role_id = role.get("role_id")
            if not isinstance(role_id, str) or not ROLE_ID_PATTERN.match(role_id):
                violations.append(
                    SpecViolation(
                        field=f"{field}.role_id",
                        actual=role_id,
                        message=f"role_id {role_id!r} is not a kebab-case id",
                    )
                )
            elif role_ids.count(role_id) > 1:
                violations.append(
                    SpecViolation(field=f"{field}.role_id", message=f"role '{role_id}' is repeated")
                )
            scopes = role.get("scopes")
            inherits = role.get("inherits", [])
            if not isinstance(scopes, list) or not isinstance(inherits, list):
                violations.append(
                    SpecViolation(field=field, message="'scopes' and 'inherits' are lists")
                )
                continue
            if not scopes and not inherits:
                violations.append(
                    SpecViolation(
                        field=field,
                        message=f"role '{role_id}' grants no scope and inherits none",
                    )
                )
            violations.extend(
                SpecViolation(
                    field=f"{field}.scopes",
                    actual=scope,
                    message=f"'{scope}' is not a scope (domain:resource:action)",
                )
                for scope in scopes
                if not isinstance(scope, str) or not SCOPE_PATTERN.match(scope)
            )
            violations.extend(
                SpecViolation(
                    field=f"{field}.inherits",
                    actual=parent,
                    message=f"role '{role_id}' inherits '{parent}', which the file does not define",
                )
                for parent in inherits
                if parent not in role_ids
            )
        return self._verdict(
            "m10",
            "baseline/M-10",
            violations,
            f"{len(roles)} role(s) declared with their scopes.",
            evidence={"roles": [r for r in role_ids if isinstance(r, str)]},
        )

    # ------------------------------------------------------------------
    # fmts:m11 — the module SDK template
    # ------------------------------------------------------------------

    def _check_m11(self, spec: dict[str, Any], repo_root: Path) -> FxTSVerdict:
        template = spec["scaffold"]["template"]
        identity = spec["module_identity"]
        language = identity["language"]
        violations = []
        expected = {"python-adapter": ("python", PYTHON_ADAPTER_FILES), "go-module": ("go", ())}
        if template == "none":
            violations.append(
                SpecViolation(
                    field="scaffold.template",
                    message="the module is not built from a module SDK template",
                )
            )
        else:
            wanted_language, files = expected[template]
            if language != wanted_language:
                violations.append(
                    SpecViolation(
                        field="scaffold.template",
                        expected=wanted_language,
                        actual=language,
                        message=f"template '{template}' is for {wanted_language}, not {language}",
                    )
                )
            wanted = files or GO_MODULE_PATHS
            roots = [
                repo_root / rel
                for rel in identity["source_paths"]
                if self._inside(repo_root, rel) and (repo_root / rel).is_dir()
            ]
            violations.extend(
                SpecViolation(
                    field="module_identity.source_paths",
                    actual=name,
                    message=f"'{name}' of the {template} layout is in none of the source paths",
                )
                for name in wanted
                if not any((root / name).exists() for root in roots)
            )
        return self._verdict(
            "m11",
            "baseline/M-11",
            violations,
            f"The module has the {template} layout.",
            evidence={"template": template},
        )

    # ------------------------------------------------------------------
    # fmts:metadata
    # ------------------------------------------------------------------

    def _check_metadata(self, spec: dict[str, Any]) -> FxTSVerdict:
        metadata = spec.get("metadata", {})
        return self._verdict(
            "metadata",
            "metadata",
            [],
            f"metadata carries {len(metadata)} informational key(s); not enforced.",
        )
