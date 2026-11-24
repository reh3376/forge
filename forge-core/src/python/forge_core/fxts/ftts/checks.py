"""Every check the FTTS runner gives, declared as data (D-19, AE-2).

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
    Check("ftts:bridge-enum-mappings", ("/serialization_bridge/enum_mappings",), SELF),
    Check("ftts:bridge-module", ("/serialization_bridge/bridge_module",), SELF),
    Check("ftts:bridge-round-trip", ("/serialization_bridge/round_trip_lossless",), SELF),
    Check("ftts:bridge-type-mappings", ("/serialization_bridge/type_mappings",), SELF),
    Check("ftts:client-channel-class", ("/client_requirements/channel_class",), SELF),
    Check("ftts:client-compiled-stub", ("/client_requirements/uses_compiled_stub",), SELF),
    Check("ftts:client-module", ("/client_requirements/channel_module",), SELF),
    Check("ftts:conformance-categories", ("/conformance_tests/categories",), SELF),
    Check("ftts:conformance-total", ("/conformance_tests/total",), SELF),
    Check(
        "ftts:cross-bridge-coverage",
        ("/serialization_bridge/type_mappings", "/proto_contract/message_types"),
        SELF,
    ),
    Check(
        "ftts:cross-rpc-message-coverage",
        ("/rpc_contract/rpcs", "/proto_contract/message_types"),
        SELF,
    ),
    Check("ftts:cross-wire-consistency", ("/wire_format",), SELF),
    Check("ftts:error-grpc-codes", ("/error_protocol/uses_grpc_status_codes",), SELF),
    Check("ftts:error-mapping", ("/error_protocol/status_code_mapping",), SELF),
    Check("ftts:identity-id-format", ("/transport_identity/transport_id",), SELF),
    Check("ftts:identity-name", ("/transport_identity/name",), SELF),
    Check("ftts:identity-proto-package", ("/transport_identity/proto_package",), SELF),
    Check("ftts:identity-protocol", ("/transport_identity/protocol",), SELF),
    Check("ftts:identity-target-match", ("/transport_identity/transport_id",), SELF),
    Check("ftts:identity-version", ("/transport_identity/version",), SELF),
    Check("ftts:integrity-hash-format", ("/integrity/spec_hash",), SELF),
    Check("ftts:integrity-state", ("/integrity/hash_state",), SELF),
    Check(
        "ftts:live",
        ("/server_requirements", "/client_requirements", "/serialization_bridge"),
        ARTIFACT,
        "not run unless the run is asked for live checks (FB-270)",
    ),
    Check("ftts:live-bridge-functions", ("/serialization_bridge",), ARTIFACT),
    Check("ftts:live-bridge-import", ("/serialization_bridge/bridge_module",), ARTIFACT),
    Check("ftts:live-client-class", ("/client_requirements/channel_class",), ARTIFACT),
    Check("ftts:live-client-import", ("/client_requirements/channel_module",), ARTIFACT),
    Check("ftts:live-server-class", ("/server_requirements/servicer_class",), ARTIFACT),
    Check("ftts:live-server-import", ("/server_requirements/server_module",), ARTIFACT),
    Check("ftts:metadata", ("/metadata",), SELF),
    Check("ftts:proto-enum-types", ("/proto_contract/enum_types",), SELF),
    Check("ftts:proto-files-present", ("/proto_contract/proto_files",), SELF),
    Check("ftts:proto-message-types", ("/proto_contract/message_types",), SELF),
    Check("ftts:proto-service-name", ("/proto_contract/service_name",), SELF),
    Check("ftts:rpc-list", ("/rpc_contract/rpcs",), SELF),
    Check("ftts:rpc-metadata", ("/rpc_contract/metadata_protocol",), SELF),
    Check("ftts:server-compiled-base", ("/server_requirements/uses_compiled_servicer_base",), SELF),
    Check(
        "ftts:server-compiled-registration",
        ("/server_requirements/uses_compiled_registration",),
        SELF,
    ),
    Check("ftts:server-module", ("/server_requirements/server_module",), SELF),
    Check("ftts:server-servicer-class", ("/server_requirements/servicer_class",), SELF),
    Check("ftts:spec-load", ("",), SELF),
    Check("ftts:spec-version", ("/spec_version",), SELF),
    Check("ftts:wire-compilation", ("/wire_format/compilation_required",), SELF),
    Check("ftts:wire-encoding", ("/wire_format/encoding",), SELF),
    Check("ftts:wire-json-forbidden", ("/wire_format/json_forbidden",), SELF),
    Check("ftts:wire-schema-enforced", ("/wire_format/schema_enforced",), SELF),
)
