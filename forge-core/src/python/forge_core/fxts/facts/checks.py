"""Every check the FACTS runner gives, declared as data (D-19, AE-2).

Each entry names a check id (or a form with ``{name}`` placeholders for an id built at
run time), the JSON pointers into a spec that the check looks at, and the kind of evidence
it reaches when it runs: ``SELF`` (the spec against itself or its schema), ``FILE``
(another file), ``ARTIFACT`` (the real thing), ``NONE`` (nothing of the spec). The runner
base gives each verdict the kind of its declaration, and an undeclared id is an error.
The shared checks (``hash-verified``, ``hash-approved``, ``schema-current``,
``runner-error``, ``parity:...``) are declared once, in ``fxts/shared/runner.py``.
"""

from __future__ import annotations

from forge_core.fxts.shared.runner import Check, EvidenceKind

SELF, FILE, ARTIFACT, NONE = (
    EvidenceKind.SELF,
    EvidenceKind.FILE,
    EvidenceKind.ARTIFACT,
    EvidenceKind.NONE,
)

CHECKS: tuple[Check, ...] = (
    Check("facts:capabilities-read", ("/capabilities/read",), SELF),
    Check("facts:capabilities-valid", ("/capabilities",), SELF),
    Check("facts:capabilities-{name}-type", ("/capabilities",), SELF),
    Check("facts:connection-auth-methods", ("/connection/auth_methods",), SELF),
    Check("facts:connection-params-present", ("/connection/params",), SELF),
    Check("facts:connection-params-valid", ("/connection/params",), SELF),
    Check("facts:context-enrichment-valid", ("/context_mapping/enrichment_rules",), SELF),
    Check("facts:context-mapping-coverage", ("/context_mapping",), SELF),
    Check("facts:context-mapping-no-orphans", ("/context_mapping",), SELF),
    Check("facts:context-mappings-present", ("/context_mapping/mappings",), SELF),
    Check("facts:cross-ingestion-read", ("/adapter_identity/type", "/capabilities/read"), SELF),
    Check(
        "facts:cross-subscribe-sources",
        ("/capabilities/subscribe", "/data_contract/data_sources"),
        SELF,
    ),
    Check(
        "facts:cross-write-sources", ("/capabilities/write", "/data_contract/data_sources"), SELF
    ),
    Check("facts:data-contract-context-fields", ("/data_contract/context_fields",), SELF),
    Check("facts:data-contract-output-format", ("/data_contract/output_format",), SELF),
    Check("facts:data-contract-sample-coverage", ("/data_contract/sample_record",), SELF),
    Check("facts:data-contract-schema-ref", ("/data_contract/schema_ref",), SELF),
    Check("facts:data-contract-sources-valid", ("/data_contract/data_sources",), SELF),
    Check("facts:error-circuit-breaker", ("/error_handling/circuit_breaker",), SELF),
    Check("facts:error-retry-policy", ("/error_handling/retry_policy",), SELF),
    Check("facts:identity-id-format", ("/adapter_identity/adapter_id",), SELF),
    Check("facts:identity-id-match", ("/adapter_identity/adapter_id",), SELF),
    Check("facts:identity-name", ("/adapter_identity/name",), SELF),
    Check("facts:identity-protocol", ("/adapter_identity/protocol",), SELF),
    Check("facts:identity-tier", ("/adapter_identity/tier",), SELF),
    Check("facts:identity-type", ("/adapter_identity/type",), SELF),
    Check("facts:identity-version", ("/adapter_identity/version",), SELF),
    Check("facts:integrity-hash-format", ("/integrity/spec_hash",), SELF),
    Check("facts:lifecycle-restart-policy", ("/lifecycle/restart_policy",), SELF),
    Check("facts:lifecycle-state-transitions", ("/lifecycle/state_transitions",), SELF),
    Check("facts:lifecycle-{field}", ("/lifecycle",), SELF),
    Check(
        "facts:live",
        ("/connection", "/capabilities", "/data_contract", "/lifecycle", "/error_handling"),
        NONE,
        (
            "not built: nothing compares an adapter spec with the module's code (FB-271); "
            "artifact once built"
        ),
    ),
    Check(
        "facts:metadata",
        ("/metadata",),
        NONE,
        "free text for people: read only to count its keys; decides nothing (D-19, AE-3)",
    ),
    Check("facts:schema-valid", ("",), SELF),
    Check("facts:spec-load", ("",), SELF),
    Check("facts:spec-version", ("/spec_version",), SELF),
    Check("facts:time-governed", ("/time_governance",), SELF),
)
