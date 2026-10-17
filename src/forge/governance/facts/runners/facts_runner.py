"""FACTS runner — enforces adapter conformance against FACTS specs.

This runner validates that an adapter (or its spec file) conforms to the
FACTS schema. ``facts:schema-valid`` applies facts.schema.json itself (JSON
Schema 2020-12, one violation per offending path); the other checks add the
rules the schema cannot express (cross-field consistency, context coverage,
FHTS state). The closed value sets those checks use are read from the schema
at import (``VOCABULARY``) and per runner instance (``runner.vocabulary``),
so the runner cannot drift from the schema (BACKLOG FB-080). Schema-runner
parity of the top-level sections is verified by the base class.

Two modes:
  - **Static** (default): Validate spec structure, cross-field consistency,
    context mapping coverage, and integrity hash. No adapter instantiation.
  - **Live**: Instantiate the adapter, exercise its lifecycle, verify data
    output against the declared data contract. Requires adapter code.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, ClassVar

from forge.governance.shared.runner import (
    FxTSRunner,
    FxTSVerdict,
    SpecViolation,
    VerdictStatus,
    load_schema,
)

if TYPE_CHECKING:
    from jsonschema import Draft202012Validator


# ---------------------------------------------------------------------------
# Vocabulary — read from facts.schema.json, never hand-copied (BACKLOG FB-080)
# ---------------------------------------------------------------------------

PACKAGED_SCHEMA_PATH = Path(__file__).resolve().parents[1] / "schema" / "facts.schema.json"


def schema_enum(schema: dict[str, Any], *path: str) -> frozenset[str]:
    """Return the ``enum`` found at ``path`` inside a JSON schema.

    Each step is a property name; the step ``"[]"`` descends into ``items``.
    Raises ``KeyError`` when the path does not end at a non-empty enum, so a
    renamed schema field fails at import instead of silently accepting anything.
    """
    node: Any = schema
    for step in path:
        node = node["items"] if step == "[]" else node["properties"][step]
    values = node["enum"]
    if not values:
        msg = f"schema enum at /{'/'.join(path)} is empty"
        raise KeyError(msg)
    return frozenset(values)


@dataclass(frozen=True)
class FactsVocabulary:
    """The closed value sets of a FACTS schema, as the runner consumes them."""

    adapter_types: frozenset[str]
    tiers: frozenset[str]
    restart_policies: frozenset[str]
    lifecycle_states: frozenset[str]
    param_types: frozenset[str]
    auth_methods: frozenset[str]
    output_formats: frozenset[str]
    source_types: frozenset[str]
    collection_modes: frozenset[str]
    enrichment_rule_types: frozenset[str]
    backoff_strategies: frozenset[str]

    #: Attribute → path of its enum in the schema (also the parity test's table).
    PATHS: ClassVar[dict[str, tuple[str, ...]]] = {
        "adapter_types": ("adapter_identity", "type"),
        "tiers": ("adapter_identity", "tier"),
        "restart_policies": ("lifecycle", "restart_policy"),
        "lifecycle_states": ("lifecycle", "state_transitions", "[]", "from"),
        "param_types": ("connection", "params", "[]", "type"),
        "auth_methods": ("connection", "auth_methods", "[]"),
        "output_formats": ("data_contract", "output_format"),
        "source_types": ("data_contract", "data_sources", "[]", "source_type"),
        "collection_modes": ("data_contract", "data_sources", "[]", "collection_mode"),
        "enrichment_rule_types": ("context_mapping", "enrichment_rules", "[]", "rule_type"),
        "backoff_strategies": ("error_handling", "retry_policy", "backoff_strategy"),
    }

    @classmethod
    def from_schema(cls, schema: dict[str, Any]) -> FactsVocabulary:
        return cls(**{name: schema_enum(schema, *path) for name, path in cls.PATHS.items()})


VOCABULARY = FactsVocabulary.from_schema(load_schema(PACKAGED_SCHEMA_PATH))

# Module-level names kept for importers; every one is derived from the schema.
VALID_ADAPTER_TYPES = VOCABULARY.adapter_types
VALID_TIERS = VOCABULARY.tiers
VALID_RESTART_POLICIES = VOCABULARY.restart_policies
VALID_LIFECYCLE_STATES = VOCABULARY.lifecycle_states
VALID_PARAM_TYPES = VOCABULARY.param_types
VALID_AUTH_METHODS = VOCABULARY.auth_methods
VALID_OUTPUT_FORMATS = VOCABULARY.output_formats
VALID_SOURCE_TYPES = VOCABULARY.source_types
VALID_COLLECTION_MODES = VOCABULARY.collection_modes
VALID_ENRICHMENT_RULE_TYPES = VOCABULARY.enrichment_rule_types
VALID_BACKOFF_STRATEGIES = VOCABULARY.backoff_strategies

ADAPTER_ID_PATTERN = re.compile(r"^[a-z][a-z0-9-]*$")
SEMVER_PATTERN = re.compile(r"^\d+\.\d+\.\d+")
SNAKE_CASE_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")


def _short(value: Any, limit: int = 80) -> str:
    """Compact rendering of an offending value for a SpecViolation."""
    if isinstance(value, dict | list):
        return f"<{type(value).__name__} of {len(value)}>"
    text = repr(value)
    return text if len(text) <= limit else text[: limit - 3] + "..."


class FACTSRunner(FxTSRunner):
    """Adapter conformance runner for the FACTS framework.

    Usage:
        runner = FACTSRunner(
            schema_path="governance/facts/schema/facts.schema.json",
        )
        report = await runner.run(target="whk-wms", spec=spec_dict)
    """

    framework = "FACTS"
    version = "0.1.0"

    # All top-level schema fields this runner enforces.
    # Schema-runner parity: every field in facts.schema.json must appear here.
    _ENFORCED_FIELDS: ClassVar[set[str]] = {
        "spec_version",
        "adapter_identity",
        "capabilities",
        "lifecycle",
        "connection",
        "data_contract",
        "context_mapping",
        "error_handling",
        "metadata",
        "integrity",
    }

    def __init__(self, schema_path: Path | str | None = None) -> None:
        # The packaged schema is the default, so ``FACTSRunner()`` validates too.
        super().__init__(schema_path=schema_path or PACKAGED_SCHEMA_PATH)
        self._vocabulary: FactsVocabulary | None = None
        self._validator: Draft202012Validator | None = None

    @property
    def vocabulary(self) -> FactsVocabulary:
        """Closed value sets read from the schema this runner enforces."""
        if self._vocabulary is None:
            schema = self.schema
            self._vocabulary = (
                VOCABULARY if schema is None else FactsVocabulary.from_schema(schema)
            )
        return self._vocabulary

    def implemented_fields(self) -> set[str]:
        return self._ENFORCED_FIELDS

    async def _run_checks(
        self, target: str, **kwargs: Any,
    ) -> list[FxTSVerdict]:
        """Run all FACTS checks against an adapter spec.

        Args:
            target: adapter_id (e.g., "whk-wms")
            **kwargs:
                spec: dict — the parsed FACTS spec.
                live: bool — if True, instantiate and exercise the adapter.
        """
        spec: dict[str, Any] | None = kwargs.get("spec")
        live: bool = kwargs.get("live", False)

        if spec is None:
            return [
                FxTSVerdict(
                    check_id="facts:spec-load",
                    spec_ref="FACTS/spec-load",
                    status=VerdictStatus.ERROR,
                    message=f"No spec provided for adapter '{target}'.",
                ),
            ]

        verdicts: list[FxTSVerdict] = []

        # Static checks — always run; the schema first, so reports lead with it
        verdicts.append(self._check_schema_valid(spec))
        verdicts.append(self._check_spec_version(spec))
        verdicts.extend(self._check_identity(spec, target))
        verdicts.extend(self._check_capabilities(spec))
        verdicts.extend(self._check_lifecycle(spec))
        verdicts.extend(self._check_connection(spec))
        verdicts.extend(self._check_data_contract(spec))
        verdicts.extend(self._check_context_mapping(spec))
        verdicts.extend(self._check_error_handling(spec))
        verdicts.append(self._check_metadata(spec))
        verdicts.extend(self._check_integrity(spec))

        # Cross-field consistency (depends on multiple sections)
        verdicts.extend(self._check_cross_field_consistency(spec))

        # Live checks (only if adapter is instantiable)
        if live:
            live_verdicts = await self._live_checks(spec, target)
            verdicts.extend(live_verdicts)

        return verdicts

    # ------------------------------------------------------------------
    # facts:schema-valid — the schema itself, every keyword, every path
    # ------------------------------------------------------------------

    def _check_schema_valid(self, spec: dict[str, Any]) -> FxTSVerdict:
        """Validate the spec against facts.schema.json (JSON Schema 2020-12).

        One violation per error, keyed by the JSON pointer of the offending
        value, so an author can fix every path in one pass. The other checks
        are not a substitute: they add what the schema cannot express.
        """
        schema = self.schema
        if schema is None:
            return FxTSVerdict(
                check_id="facts:schema-valid",
                spec_ref="FACTS/schema",
                status=VerdictStatus.SKIP,
                message="No schema configured — schema validation skipped.",
            )
        if self._validator is None:
            from jsonschema import Draft202012Validator

            self._validator = Draft202012Validator(schema)
        errors = sorted(self._validator.iter_errors(spec), key=lambda e: list(e.absolute_path))
        if not errors:
            return FxTSVerdict(
                check_id="facts:schema-valid",
                spec_ref="FACTS/schema",
                status=VerdictStatus.PASS,
                message=f"Spec validates against {schema.get('$id', 'facts.schema.json')}.",
            )
        violations = [
            SpecViolation(
                field="/" + "/".join(str(step) for step in e.absolute_path),
                expected=e.validator,
                actual=_short(e.instance),
                message=e.message[:200],
            )
            for e in errors
        ]
        first = violations[0]
        return FxTSVerdict(
            check_id="facts:schema-valid",
            spec_ref="FACTS/schema",
            status=VerdictStatus.FAIL,
            message=f"{len(errors)} schema violation(s); first: {first.field}: {first.message}",
            violations=violations,
        )

    # ------------------------------------------------------------------
    # spec_version
    # ------------------------------------------------------------------

    def _check_spec_version(self, spec: dict[str, Any]) -> FxTSVerdict:
        version = spec.get("spec_version")
        if version == "0.1.0":
            return FxTSVerdict(
                check_id="facts:spec-version",
                spec_ref="FACTS/spec_version",
                status=VerdictStatus.PASS,
                message="Spec version is 0.1.0.",
            )
        return FxTSVerdict(
            check_id="facts:spec-version",
            spec_ref="FACTS/spec_version",
            status=VerdictStatus.FAIL,
            message=f"Expected spec_version '0.1.0', got '{version}'.",
            violations=[
                SpecViolation(
                    field="spec_version",
                    expected="0.1.0",
                    actual=version,
                    message="Unsupported spec version.",
                ),
            ],
        )

    # ------------------------------------------------------------------
    # adapter_identity
    # ------------------------------------------------------------------

    def _check_identity(
        self, spec: dict[str, Any], target: str,
    ) -> list[FxTSVerdict]:
        verdicts: list[FxTSVerdict] = []
        identity = spec.get("adapter_identity", {})
        vocab = self.vocabulary

        # adapter_id format
        aid = identity.get("adapter_id", "")
        if not ADAPTER_ID_PATTERN.match(aid) or not (3 <= len(aid) <= 64):
            verdicts.append(FxTSVerdict(
                check_id="facts:identity-id-format",
                spec_ref="FACTS/adapter_identity/adapter_id",
                status=VerdictStatus.FAIL,
                message=f"adapter_id '{aid}' must be kebab-case, 3-64 chars.",
                violations=[SpecViolation(
                    field="adapter_identity.adapter_id",
                    expected="kebab-case, 3-64 chars",
                    actual=aid,
                    message="Invalid adapter_id format.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="facts:identity-id-format",
                spec_ref="FACTS/adapter_identity/adapter_id",
                status=VerdictStatus.PASS,
                message=f"adapter_id '{aid}' is valid.",
            ))

        # adapter_id matches target
        if aid != target:
            verdicts.append(FxTSVerdict(
                check_id="facts:identity-id-match",
                spec_ref="FACTS/adapter_identity/adapter_id",
                status=VerdictStatus.FAIL,
                message=f"adapter_id '{aid}' does not match target '{target}'.",
                violations=[SpecViolation(
                    field="adapter_identity.adapter_id",
                    expected=target,
                    actual=aid,
                    message="adapter_id/target mismatch.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="facts:identity-id-match",
                spec_ref="FACTS/adapter_identity/adapter_id",
                status=VerdictStatus.PASS,
                message=f"adapter_id matches target '{target}'.",
            ))

        # name present
        name = identity.get("name", "")
        if not name or len(name) > 128:
            verdicts.append(FxTSVerdict(
                check_id="facts:identity-name",
                spec_ref="FACTS/adapter_identity/name",
                status=VerdictStatus.FAIL,
                message=f"name must be 1-128 chars, got '{name[:32]}...'.",
                violations=[SpecViolation(
                    field="adapter_identity.name", message="Invalid name.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="facts:identity-name",
                spec_ref="FACTS/adapter_identity/name",
                status=VerdictStatus.PASS,
                message=f"name '{name}' is valid.",
            ))

        # version is semver
        ver = identity.get("version", "")
        if not SEMVER_PATTERN.match(ver):
            verdicts.append(FxTSVerdict(
                check_id="facts:identity-version",
                spec_ref="FACTS/adapter_identity/version",
                status=VerdictStatus.FAIL,
                message=f"version '{ver}' is not semver.",
                violations=[SpecViolation(
                    field="adapter_identity.version",
                    expected="major.minor.patch",
                    actual=ver,
                    message="Not semver.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="facts:identity-version",
                spec_ref="FACTS/adapter_identity/version",
                status=VerdictStatus.PASS,
                message=f"version '{ver}' is valid semver.",
            ))

        # type enum
        atype = identity.get("type", "")
        if atype not in vocab.adapter_types:
            verdicts.append(FxTSVerdict(
                check_id="facts:identity-type",
                spec_ref="FACTS/adapter_identity/type",
                status=VerdictStatus.FAIL,
                message=f"type '{atype}' not in {sorted(vocab.adapter_types)}.",
                violations=[SpecViolation(
                    field="adapter_identity.type",
                    expected=str(sorted(vocab.adapter_types)),
                    actual=atype,
                    message="Invalid adapter type.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="facts:identity-type",
                spec_ref="FACTS/adapter_identity/type",
                status=VerdictStatus.PASS,
                message=f"type '{atype}' is valid.",
            ))

        # tier enum
        tier = identity.get("tier", "")
        if tier not in vocab.tiers:
            verdicts.append(FxTSVerdict(
                check_id="facts:identity-tier",
                spec_ref="FACTS/adapter_identity/tier",
                status=VerdictStatus.FAIL,
                message=f"tier '{tier}' not in {sorted(vocab.tiers)}.",
                violations=[SpecViolation(
                    field="adapter_identity.tier",
                    expected=str(sorted(vocab.tiers)),
                    actual=tier,
                    message="Invalid tier.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="facts:identity-tier",
                spec_ref="FACTS/adapter_identity/tier",
                status=VerdictStatus.PASS,
                message=f"tier '{tier}' is valid.",
            ))

        # protocol present
        protocol = identity.get("protocol", "")
        if not protocol:
            verdicts.append(FxTSVerdict(
                check_id="facts:identity-protocol",
                spec_ref="FACTS/adapter_identity/protocol",
                status=VerdictStatus.FAIL,
                message="protocol must be non-empty.",
                violations=[SpecViolation(
                    field="adapter_identity.protocol", message="Empty protocol.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="facts:identity-protocol",
                spec_ref="FACTS/adapter_identity/protocol",
                status=VerdictStatus.PASS,
                message=f"protocol '{protocol}' declared.",
            ))

        return verdicts

    # ------------------------------------------------------------------
    # capabilities
    # ------------------------------------------------------------------

    def _check_capabilities(self, spec: dict[str, Any]) -> list[FxTSVerdict]:
        verdicts: list[FxTSVerdict] = []
        caps = spec.get("capabilities", {})

        # read must be true (required by schema)
        read_val = caps.get("read")
        if read_val is not True:
            verdicts.append(FxTSVerdict(
                check_id="facts:capabilities-read",
                spec_ref="FACTS/capabilities/read",
                status=VerdictStatus.FAIL,
                message="capabilities.read must be true.",
                violations=[SpecViolation(
                    field="capabilities.read",
                    expected=True,
                    actual=read_val,
                    message="read capability is required.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="facts:capabilities-read",
                spec_ref="FACTS/capabilities/read",
                status=VerdictStatus.PASS,
                message="capabilities.read is true.",
            ))

        # all capabilities must be boolean
        for cap_name in ("read", "write", "subscribe", "backfill", "discover"):
            val = caps.get(cap_name)
            if val is not None and not isinstance(val, bool):
                verdicts.append(FxTSVerdict(
                    check_id=f"facts:capabilities-{cap_name}-type",
                    spec_ref=f"FACTS/capabilities/{cap_name}",
                    status=VerdictStatus.FAIL,
                    message=f"capabilities.{cap_name} must be boolean, got {type(val).__name__}.",
                    violations=[SpecViolation(
                        field=f"capabilities.{cap_name}",
                        expected="boolean",
                        actual=type(val).__name__,
                        message="Not boolean.",
                    )],
                ))

        # Summary verdict
        if not any(v.status == VerdictStatus.FAIL for v in verdicts):
            verdicts.append(FxTSVerdict(
                check_id="facts:capabilities-valid",
                spec_ref="FACTS/capabilities",
                status=VerdictStatus.PASS,
                message=f"Capabilities declared: {caps}.",
            ))

        return verdicts

    # ------------------------------------------------------------------
    # lifecycle
    # ------------------------------------------------------------------

    def _check_lifecycle(self, spec: dict[str, Any]) -> list[FxTSVerdict]:
        verdicts: list[FxTSVerdict] = []
        lc = spec.get("lifecycle", {})
        vocab = self.vocabulary

        # Timeout values
        for field, min_val, max_val in [
            ("startup_timeout_ms", 1000, 300000),
            ("shutdown_timeout_ms", 1000, 60000),
            ("health_check_interval_ms", 1000, 300000),
        ]:
            val = lc.get(field)
            if not isinstance(val, int) or val < min_val or val > max_val:
                verdicts.append(FxTSVerdict(
                    check_id=f"facts:lifecycle-{field}",
                    spec_ref=f"FACTS/lifecycle/{field}",
                    status=VerdictStatus.FAIL,
                    message=f"{field} must be integer {min_val}-{max_val}, got {val}.",
                    violations=[SpecViolation(
                        field=f"lifecycle.{field}",
                        expected=f"{min_val}-{max_val}",
                        actual=val,
                        message="Out of range.",
                    )],
                ))
            else:
                verdicts.append(FxTSVerdict(
                    check_id=f"facts:lifecycle-{field}",
                    spec_ref=f"FACTS/lifecycle/{field}",
                    status=VerdictStatus.PASS,
                    message=f"{field}={val}ms is valid.",
                ))

        # restart_policy enum
        policy = lc.get("restart_policy", "")
        if policy not in vocab.restart_policies:
            verdicts.append(FxTSVerdict(
                check_id="facts:lifecycle-restart-policy",
                spec_ref="FACTS/lifecycle/restart_policy",
                status=VerdictStatus.FAIL,
                message=f"restart_policy '{policy}' not in {sorted(vocab.restart_policies)}.",
                violations=[SpecViolation(
                    field="lifecycle.restart_policy",
                    expected=str(sorted(vocab.restart_policies)),
                    actual=policy,
                    message="Invalid restart policy.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="facts:lifecycle-restart-policy",
                spec_ref="FACTS/lifecycle/restart_policy",
                status=VerdictStatus.PASS,
                message=f"restart_policy '{policy}' is valid.",
            ))

        # state_transitions (optional but validated if present)
        transitions = lc.get("state_transitions", [])
        if transitions:
            invalid_states = []
            for t in transitions:
                for key in ("from", "to"):
                    state = t.get(key, "")
                    if state not in vocab.lifecycle_states:
                        invalid_states.append(f"{key}={state}")
            if invalid_states:
                verdicts.append(FxTSVerdict(
                    check_id="facts:lifecycle-state-transitions",
                    spec_ref="FACTS/lifecycle/state_transitions",
                    status=VerdictStatus.FAIL,
                    message=f"Invalid states in transitions: {invalid_states}.",
                    violations=[SpecViolation(
                        field="lifecycle.state_transitions",
                        expected=str(sorted(vocab.lifecycle_states)),
                        actual=str(invalid_states),
                        message="Invalid lifecycle state.",
                    )],
                ))
            else:
                verdicts.append(FxTSVerdict(
                    check_id="facts:lifecycle-state-transitions",
                    spec_ref="FACTS/lifecycle/state_transitions",
                    status=VerdictStatus.PASS,
                    message=f"{len(transitions)} state transitions defined with valid states.",
                ))

        return verdicts

    # ------------------------------------------------------------------
    # connection
    # ------------------------------------------------------------------

    def _check_connection(self, spec: dict[str, Any]) -> list[FxTSVerdict]:
        verdicts: list[FxTSVerdict] = []
        conn = spec.get("connection", {})
        vocab = self.vocabulary

        # params — at least 1 required
        params = conn.get("params", [])
        if not params:
            verdicts.append(FxTSVerdict(
                check_id="facts:connection-params-present",
                spec_ref="FACTS/connection/params",
                status=VerdictStatus.FAIL,
                message="At least one connection param required.",
                violations=[SpecViolation(
                    field="connection.params", message="Empty params.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="facts:connection-params-present",
                spec_ref="FACTS/connection/params",
                status=VerdictStatus.PASS,
                message=f"{len(params)} connection params declared.",
            ))

        # param validation
        param_violations: list[SpecViolation] = []
        for i, p in enumerate(params):
            name = p.get("name", "")
            if not SNAKE_CASE_PATTERN.match(name):
                param_violations.append(SpecViolation(
                    field=f"connection.params[{i}].name",
                    expected="snake_case",
                    actual=name,
                    message=f"Param name '{name}' is not snake_case.",
                ))
            ptype = p.get("type", "")
            if ptype not in vocab.param_types:
                param_violations.append(SpecViolation(
                    field=f"connection.params[{i}].type",
                    expected=str(sorted(vocab.param_types)),
                    actual=ptype,
                    message=f"Param type '{ptype}' is not valid.",
                ))
        if param_violations:
            verdicts.append(FxTSVerdict(
                check_id="facts:connection-params-valid",
                spec_ref="FACTS/connection/params",
                status=VerdictStatus.FAIL,
                message=f"{len(param_violations)} param validation errors.",
                violations=param_violations,
            ))
        elif params:
            verdicts.append(FxTSVerdict(
                check_id="facts:connection-params-valid",
                spec_ref="FACTS/connection/params",
                status=VerdictStatus.PASS,
                message="All params have valid names and types.",
            ))

        # auth_methods — at least 1 required
        auth = conn.get("auth_methods", [])
        if not auth:
            verdicts.append(FxTSVerdict(
                check_id="facts:connection-auth-methods",
                spec_ref="FACTS/connection/auth_methods",
                status=VerdictStatus.FAIL,
                message="At least one auth method required.",
                violations=[SpecViolation(
                    field="connection.auth_methods", message="Empty auth methods.",
                )],
            ))
        else:
            invalid_auth = [a for a in auth if a not in vocab.auth_methods]
            if invalid_auth:
                verdicts.append(FxTSVerdict(
                    check_id="facts:connection-auth-methods",
                    spec_ref="FACTS/connection/auth_methods",
                    status=VerdictStatus.FAIL,
                    message=f"Invalid auth methods: {invalid_auth}.",
                    violations=[SpecViolation(
                        field="connection.auth_methods",
                        expected=str(sorted(vocab.auth_methods)),
                        actual=str(invalid_auth),
                        message="Invalid auth method.",
                    )],
                ))
            else:
                verdicts.append(FxTSVerdict(
                    check_id="facts:connection-auth-methods",
                    spec_ref="FACTS/connection/auth_methods",
                    status=VerdictStatus.PASS,
                    message=f"Auth methods: {auth}.",
                ))

        return verdicts

    # ------------------------------------------------------------------
    # data_contract
    # ------------------------------------------------------------------

    def _check_data_contract(self, spec: dict[str, Any]) -> list[FxTSVerdict]:
        verdicts: list[FxTSVerdict] = []
        dc = spec.get("data_contract", {})
        vocab = self.vocabulary

        # schema_ref starts with forge://
        schema_ref = dc.get("schema_ref", "")
        if not schema_ref.startswith("forge://"):
            verdicts.append(FxTSVerdict(
                check_id="facts:data-contract-schema-ref",
                spec_ref="FACTS/data_contract/schema_ref",
                status=VerdictStatus.FAIL,
                message=f"schema_ref must start with 'forge://', got '{schema_ref}'.",
                violations=[SpecViolation(
                    field="data_contract.schema_ref",
                    expected="forge://...",
                    actual=schema_ref,
                    message="Invalid schema_ref.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="facts:data-contract-schema-ref",
                spec_ref="FACTS/data_contract/schema_ref",
                status=VerdictStatus.PASS,
                message=f"schema_ref '{schema_ref}' is valid.",
            ))

        # output_format enum
        fmt = dc.get("output_format", "")
        if fmt not in vocab.output_formats:
            verdicts.append(FxTSVerdict(
                check_id="facts:data-contract-output-format",
                spec_ref="FACTS/data_contract/output_format",
                status=VerdictStatus.FAIL,
                message=f"output_format '{fmt}' not in {sorted(vocab.output_formats)}.",
                violations=[SpecViolation(
                    field="data_contract.output_format",
                    expected=str(sorted(vocab.output_formats)),
                    actual=fmt,
                    message="Invalid output format.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="facts:data-contract-output-format",
                spec_ref="FACTS/data_contract/output_format",
                status=VerdictStatus.PASS,
                message=f"output_format '{fmt}' is valid.",
            ))

        # context_fields non-empty
        cf = dc.get("context_fields", [])
        if not cf:
            verdicts.append(FxTSVerdict(
                check_id="facts:data-contract-context-fields",
                spec_ref="FACTS/data_contract/context_fields",
                status=VerdictStatus.FAIL,
                message="context_fields must not be empty.",
                violations=[SpecViolation(
                    field="data_contract.context_fields", message="Empty context fields.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="facts:data-contract-context-fields",
                spec_ref="FACTS/data_contract/context_fields",
                status=VerdictStatus.PASS,
                message=f"{len(cf)} required context fields declared.",
            ))

        # data_sources validation (if present)
        sources = dc.get("data_sources", [])
        if sources:
            src_violations: list[SpecViolation] = []
            for i, src in enumerate(sources):
                st = src.get("source_type", "")
                if st not in vocab.source_types:
                    src_violations.append(SpecViolation(
                        field=f"data_contract.data_sources[{i}].source_type",
                        expected=str(sorted(vocab.source_types)),
                        actual=st,
                        message=f"Invalid source_type '{st}'.",
                    ))
                entities = src.get("entities", [])
                if not entities:
                    src_violations.append(SpecViolation(
                        field=f"data_contract.data_sources[{i}].entities",
                        message="Data source must have at least one entity.",
                    ))
                cm = src.get("collection_mode", "")
                if cm and cm not in vocab.collection_modes:
                    src_violations.append(SpecViolation(
                        field=f"data_contract.data_sources[{i}].collection_mode",
                        expected=str(sorted(vocab.collection_modes)),
                        actual=cm,
                        message=f"Invalid collection_mode '{cm}'.",
                    ))
            if src_violations:
                verdicts.append(FxTSVerdict(
                    check_id="facts:data-contract-sources-valid",
                    spec_ref="FACTS/data_contract/data_sources",
                    status=VerdictStatus.FAIL,
                    message=f"{len(src_violations)} data source errors.",
                    violations=src_violations,
                ))
            else:
                verdicts.append(FxTSVerdict(
                    check_id="facts:data-contract-sources-valid",
                    spec_ref="FACTS/data_contract/data_sources",
                    status=VerdictStatus.PASS,
                    message=f"{len(sources)} data sources validated.",
                ))

        # sample_record has required context fields
        sample = dc.get("sample_record")
        if sample and cf:
            sample_ctx = set((sample.get("context") or {}).keys())
            missing = set(cf) - sample_ctx
            if missing:
                verdicts.append(FxTSVerdict(
                    check_id="facts:data-contract-sample-coverage",
                    spec_ref="FACTS/data_contract/sample_record",
                    status=VerdictStatus.FAIL,
                    message=f"Sample record missing required context fields: {sorted(missing)}.",
                    violations=[SpecViolation(
                        field="data_contract.sample_record.context",
                        expected=str(cf),
                        actual=str(sorted(sample_ctx)),
                        message="Missing context fields in sample.",
                    )],
                ))
            else:
                verdicts.append(FxTSVerdict(
                    check_id="facts:data-contract-sample-coverage",
                    spec_ref="FACTS/data_contract/sample_record",
                    status=VerdictStatus.PASS,
                    message="Sample record covers all required context fields.",
                ))

        return verdicts

    # ------------------------------------------------------------------
    # context_mapping
    # ------------------------------------------------------------------

    def _check_context_mapping(self, spec: dict[str, Any]) -> list[FxTSVerdict]:
        verdicts: list[FxTSVerdict] = []
        cm = spec.get("context_mapping", {})
        vocab = self.vocabulary
        dc = spec.get("data_contract", {})

        mappings = cm.get("mappings", [])
        if not mappings:
            verdicts.append(FxTSVerdict(
                check_id="facts:context-mappings-present",
                spec_ref="FACTS/context_mapping/mappings",
                status=VerdictStatus.FAIL,
                message="At least one context mapping required.",
                violations=[SpecViolation(
                    field="context_mapping.mappings", message="No mappings.",
                )],
            ))
            return verdicts

        verdicts.append(FxTSVerdict(
            check_id="facts:context-mappings-present",
            spec_ref="FACTS/context_mapping/mappings",
            status=VerdictStatus.PASS,
            message=f"{len(mappings)} context mappings declared.",
        ))

        # Mapping coverage — all required context fields must have mappings or enrichment
        required_fields = set(dc.get("context_fields", []))
        mapped_fields = {m["context_field"] for m in mappings if "context_field" in m}
        enrichment_rules = cm.get("enrichment_rules", [])
        enriched_fields = {r["target_field"] for r in enrichment_rules if "target_field" in r}
        covered = mapped_fields | enriched_fields
        unmapped = required_fields - covered
        if unmapped:
            verdicts.append(FxTSVerdict(
                check_id="facts:context-mapping-coverage",
                spec_ref="FACTS/context_mapping",
                status=VerdictStatus.FAIL,
                message=f"Unmapped required context fields: {sorted(unmapped)}.",
                violations=[SpecViolation(
                    field="context_mapping",
                    expected=str(sorted(required_fields)),
                    actual=str(sorted(covered)),
                    message="Context field coverage gap.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="facts:context-mapping-coverage",
                spec_ref="FACTS/context_mapping",
                status=VerdictStatus.PASS,
                message=f"All {len(required_fields)} required context fields are covered.",
            ))

        # Orphan check — mappings should target declared fields
        all_fields = required_fields | set(dc.get("optional_context_fields", []))
        orphans = mapped_fields - all_fields
        if orphans:
            verdicts.append(FxTSVerdict(
                check_id="facts:context-mapping-no-orphans",
                spec_ref="FACTS/context_mapping",
                status=VerdictStatus.FAIL,
                message=f"Orphan mappings target undeclared fields: {sorted(orphans)}.",
                violations=[SpecViolation(
                    field="context_mapping.mappings",
                    expected="targets in context_fields or optional_context_fields",
                    actual=str(sorted(orphans)),
                    message="Orphan context mapping.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="facts:context-mapping-no-orphans",
                spec_ref="FACTS/context_mapping",
                status=VerdictStatus.PASS,
                message="No orphan mappings.",
            ))

        # Enrichment rules validation (if present)
        if enrichment_rules:
            rule_violations: list[SpecViolation] = []
            for i, rule in enumerate(enrichment_rules):
                rt = rule.get("rule_type", "")
                if rt not in vocab.enrichment_rule_types:
                    rule_violations.append(SpecViolation(
                        field=f"context_mapping.enrichment_rules[{i}].rule_type",
                        expected=str(sorted(vocab.enrichment_rule_types)),
                        actual=rt,
                        message=f"Invalid enrichment rule_type '{rt}'.",
                    ))
            if rule_violations:
                verdicts.append(FxTSVerdict(
                    check_id="facts:context-enrichment-valid",
                    spec_ref="FACTS/context_mapping/enrichment_rules",
                    status=VerdictStatus.FAIL,
                    message=f"{len(rule_violations)} enrichment rule errors.",
                    violations=rule_violations,
                ))
            else:
                verdicts.append(FxTSVerdict(
                    check_id="facts:context-enrichment-valid",
                    spec_ref="FACTS/context_mapping/enrichment_rules",
                    status=VerdictStatus.PASS,
                    message=f"{len(enrichment_rules)} enrichment rules validated.",
                ))

        return verdicts

    # ------------------------------------------------------------------
    # error_handling
    # ------------------------------------------------------------------

    def _check_error_handling(self, spec: dict[str, Any]) -> list[FxTSVerdict]:
        verdicts: list[FxTSVerdict] = []
        eh = spec.get("error_handling", {})
        vocab = self.vocabulary

        # retry_policy
        rp = eh.get("retry_policy", {})
        rp_violations: list[SpecViolation] = []

        max_retries = rp.get("max_retries")
        if not isinstance(max_retries, int) or max_retries < 0 or max_retries > 20:
            rp_violations.append(SpecViolation(
                field="error_handling.retry_policy.max_retries",
                expected="0-20",
                actual=max_retries,
                message="max_retries out of range.",
            ))
        delay = rp.get("initial_delay_ms")
        if not isinstance(delay, int) or delay < 100:
            rp_violations.append(SpecViolation(
                field="error_handling.retry_policy.initial_delay_ms",
                expected="≥100",
                actual=delay,
                message="initial_delay_ms too low.",
            ))
        strategy = rp.get("backoff_strategy", "")
        if strategy not in vocab.backoff_strategies:
            rp_violations.append(SpecViolation(
                field="error_handling.retry_policy.backoff_strategy",
                expected=str(sorted(vocab.backoff_strategies)),
                actual=strategy,
                message="Invalid backoff strategy.",
            ))

        if rp_violations:
            verdicts.append(FxTSVerdict(
                check_id="facts:error-retry-policy",
                spec_ref="FACTS/error_handling/retry_policy",
                status=VerdictStatus.FAIL,
                message=f"{len(rp_violations)} retry policy errors.",
                violations=rp_violations,
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="facts:error-retry-policy",
                spec_ref="FACTS/error_handling/retry_policy",
                status=VerdictStatus.PASS,
                message=f"Retry policy valid: max={max_retries}, strategy={strategy}.",
            ))

        # circuit_breaker
        cb = eh.get("circuit_breaker", {})
        cb_violations: list[SpecViolation] = []
        ft = cb.get("failure_threshold")
        if not isinstance(ft, int) or ft < 1:
            cb_violations.append(SpecViolation(
                field="error_handling.circuit_breaker.failure_threshold",
                expected="≥1",
                actual=ft,
                message="failure_threshold must be ≥1.",
            ))
        ho = cb.get("half_open_after_ms")
        if not isinstance(ho, int) or ho < 1000:
            cb_violations.append(SpecViolation(
                field="error_handling.circuit_breaker.half_open_after_ms",
                expected="≥1000",
                actual=ho,
                message="half_open_after_ms must be ≥1000.",
            ))
        if cb_violations:
            verdicts.append(FxTSVerdict(
                check_id="facts:error-circuit-breaker",
                spec_ref="FACTS/error_handling/circuit_breaker",
                status=VerdictStatus.FAIL,
                message=f"{len(cb_violations)} circuit breaker errors.",
                violations=cb_violations,
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="facts:error-circuit-breaker",
                spec_ref="FACTS/error_handling/circuit_breaker",
                status=VerdictStatus.PASS,
                message=f"Circuit breaker valid: threshold={ft}, half_open={ho}ms.",
            ))

        return verdicts

    # ------------------------------------------------------------------
    # metadata (free-form — always passes if present as dict)
    # ------------------------------------------------------------------

    def _check_metadata(self, spec: dict[str, Any]) -> FxTSVerdict:
        metadata = spec.get("metadata")
        if metadata is not None and not isinstance(metadata, dict):
            return FxTSVerdict(
                check_id="facts:metadata",
                spec_ref="FACTS/metadata",
                status=VerdictStatus.FAIL,
                message=f"metadata must be a dict, got {type(metadata).__name__}.",
                violations=[SpecViolation(
                    field="metadata", message="Not a dict.",
                )],
            )
        return FxTSVerdict(
            check_id="facts:metadata",
            spec_ref="FACTS/metadata",
            status=VerdictStatus.PASS,
            message="metadata is valid (free-form dict).",
        )

    # ------------------------------------------------------------------
    # integrity (FHTS governance)
    # ------------------------------------------------------------------

    def _check_integrity(self, spec: dict[str, Any]) -> list[FxTSVerdict]:
        """Check FHTS integrity block — hash present, verified, approved."""
        verdicts: list[FxTSVerdict] = []
        integrity = spec.get("integrity")

        if integrity is None:
            verdicts.append(FxTSVerdict(
                check_id="facts:integrity-present",
                spec_ref="FACTS/integrity",
                status=VerdictStatus.SKIP,
                message="No integrity block — FHTS checks skipped.",
            ))
            return verdicts

        verdicts.append(FxTSVerdict(
            check_id="facts:integrity-present",
            spec_ref="FACTS/integrity",
            status=VerdictStatus.PASS,
            message="Integrity block present.",
        ))

        # Hash present and valid format
        spec_hash = integrity.get("spec_hash")
        if not spec_hash or not re.match(r"^[a-f0-9]{64}$", str(spec_hash)):
            verdicts.append(FxTSVerdict(
                check_id="facts:integrity-hash-format",
                spec_ref="FACTS/integrity/spec_hash",
                status=VerdictStatus.FAIL,
                message=f"spec_hash must be 64-char hex, got '{spec_hash}'.",
                violations=[SpecViolation(
                    field="integrity.spec_hash", message="Invalid hash format.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="facts:integrity-hash-format",
                spec_ref="FACTS/integrity/spec_hash",
                status=VerdictStatus.PASS,
                message=f"spec_hash format valid: {spec_hash[:16]}...",
            ))

        # Hash state
        state = integrity.get("hash_state", "unknown")
        if state == "approved":
            verdicts.append(FxTSVerdict(
                check_id="facts:integrity-hash-state",
                spec_ref="FACTS/integrity/hash_state",
                status=VerdictStatus.PASS,
                message="hash_state is 'approved'.",
            ))
        elif state in ("modified", "pending_review"):
            verdicts.append(FxTSVerdict(
                check_id="facts:integrity-hash-state",
                spec_ref="FACTS/integrity/hash_state",
                status=VerdictStatus.FAIL,
                message=f"hash_state is '{state}' — requires approval before deployment.",
                violations=[SpecViolation(
                    field="integrity.hash_state",
                    expected="approved",
                    actual=state,
                    message="Unapproved hash state.",
                    severity="warning",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="facts:integrity-hash-state",
                spec_ref="FACTS/integrity/hash_state",
                status=VerdictStatus.PASS,
                message=f"hash_state is '{state}'.",
                evidence={"hash_state": state},
            ))

        return verdicts

    # ------------------------------------------------------------------
    # Cross-field consistency
    # ------------------------------------------------------------------

    def _check_cross_field_consistency(
        self, spec: dict[str, Any],
    ) -> list[FxTSVerdict]:
        """Validate cross-section constraints that span multiple fields."""
        verdicts: list[FxTSVerdict] = []
        caps = spec.get("capabilities", {})
        sources = spec.get("data_contract", {}).get("data_sources", [])

        # If write: true, must have at least one write data source
        if caps.get("write") is True:
            write_sources = [
                s for s in sources
                if s.get("collection_mode") == "write"
                or s.get("source_type") == "graphql_mutation"
            ]
            if not write_sources:
                verdicts.append(FxTSVerdict(
                    check_id="facts:cross-write-sources",
                    spec_ref="FACTS/capabilities+data_contract",
                    status=VerdictStatus.FAIL,
                    message="capabilities.write=true but no write data sources declared.",
                    violations=[SpecViolation(
                        field="capabilities.write + data_contract.data_sources",
                        expected="at least one write source",
                        actual="none",
                        message="Write capability without write sources.",
                    )],
                ))
            else:
                verdicts.append(FxTSVerdict(
                    check_id="facts:cross-write-sources",
                    spec_ref="FACTS/capabilities+data_contract",
                    status=VerdictStatus.PASS,
                    message=f"Write capability backed by {len(write_sources)} write source(s).",
                ))

        # If subscribe: true, must have at least one subscribe data source
        if caps.get("subscribe") is True:
            sub_sources = [
                s for s in sources if s.get("collection_mode") == "subscribe"
            ]
            if not sub_sources:
                verdicts.append(FxTSVerdict(
                    check_id="facts:cross-subscribe-sources",
                    spec_ref="FACTS/capabilities+data_contract",
                    status=VerdictStatus.FAIL,
                    message="capabilities.subscribe=true but no subscribe sources declared.",
                    violations=[SpecViolation(
                        field="capabilities.subscribe + data_contract.data_sources",
                        expected="at least one subscribe source",
                        actual="none",
                        message="Subscribe capability without subscribe sources.",
                    )],
                ))
            else:
                verdicts.append(FxTSVerdict(
                    check_id="facts:cross-subscribe-sources",
                    spec_ref="FACTS/capabilities+data_contract",
                    status=VerdictStatus.PASS,
                    message=f"Subscribe capability backed by {len(sub_sources)} source(s).",
                ))

        # INGESTION type must have read: true (already checked in capabilities, but cross-validate)
        adapter_type = spec.get("adapter_identity", {}).get("type", "")
        if adapter_type == "INGESTION" and caps.get("read") is not True:
            verdicts.append(FxTSVerdict(
                check_id="facts:cross-ingestion-read",
                spec_ref="FACTS/adapter_identity+capabilities",
                status=VerdictStatus.FAIL,
                message="INGESTION type requires capabilities.read=true.",
                violations=[SpecViolation(
                    field="adapter_identity.type + capabilities.read",
                    expected="read=true for INGESTION",
                    actual=str(caps.get("read")),
                    message="Type/capability mismatch.",
                )],
            ))

        return verdicts

    # ------------------------------------------------------------------
    # Live checks (adapter instantiation) — placeholder for Sprint 4.4
    # ------------------------------------------------------------------

    async def _live_checks(
        self, spec: dict[str, Any], target: str,
    ) -> list[FxTSVerdict]:
        """Exercise a live adapter instance against its spec.

        Not yet implemented — returns SKIP verdicts. Live checks require
        actual adapter code (Path 3 of the roadmap).
        """
        return [
            FxTSVerdict(
                check_id="facts:live-not-implemented",
                spec_ref="FACTS/live",
                status=VerdictStatus.SKIP,
                message="Live adapter checks not yet implemented (requires adapter code).",
            ),
        ]
