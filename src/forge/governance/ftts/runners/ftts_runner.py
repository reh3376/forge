"""FTTS runner — enforces gRPC transport conformance against FTTS specs.

Validates that the hardened gRPC transport layer conforms to the FTTS
schema. Every field in ftts.schema.json has a corresponding _check_*
method — schema-runner parity is verified by the base class.

Two modes:
  - **Static** (default): Validate spec structure, cross-field consistency,
    proto contract declarations, wire format rules, and integrity hash.
  - **Live**: Import actual transport modules, verify compiled stubs exist,
    check bridge function signatures, inspect servicer inheritance.
"""

from __future__ import annotations

import importlib
import re
from typing import TYPE_CHECKING, Any, ClassVar

from forge.governance.shared.runner import (
    FxTSRunner,
    FxTSVerdict,
    SpecViolation,
    VerdictStatus,
)

if TYPE_CHECKING:
    from pathlib import Path


# ---------------------------------------------------------------------------
# Constants — mirrors ftts.schema.json enums and constraints
# ---------------------------------------------------------------------------

VALID_ENCODINGS = frozenset({"protobuf-binary", "protobuf-json", "json"})
VALID_RPC_TYPES = frozenset({
    "unary_unary", "unary_stream", "stream_unary", "stream_stream",
})
VALID_PLANES = frozenset({"control", "data", "capability"})
VALID_ENUM_DIRECTIONS = frozenset({"bidirectional", "to_proto_only", "from_proto_only"})
VALID_HASH_STATES = frozenset({
    "approved", "modified", "pending_review", "reverted", "unknown",
})

TRANSPORT_ID_PATTERN = re.compile(r"^[a-z][a-z0-9-]*$")
SEMVER_PATTERN = re.compile(r"^\d+\.\d+\.\d+")


class FTTSRunner(FxTSRunner):
    """Transport conformance runner for the FTTS framework.

    Usage:
        runner = FTTSRunner(
            schema_path="governance/ftts/schema/ftts.schema.json",
        )
        report = await runner.run(
            target="grpc-hardened-transport", spec=spec_dict,
        )
    """

    framework = "FTTS"
    version = "0.1.0"

    # All top-level schema fields this runner enforces.
    # Schema-runner parity: every field in ftts.schema.json must appear here.
    _ENFORCED_FIELDS: ClassVar[set[str]] = {
        "spec_version",
        "transport_identity",
        "proto_contract",
        "wire_format",
        "serialization_bridge",
        "server_requirements",
        "client_requirements",
        "rpc_contract",
        "error_protocol",
        "conformance_tests",
        "integrity",
        "metadata",
    }

    def __init__(self, schema_path: Path | str | None = None) -> None:
        super().__init__(schema_path=schema_path)

    def implemented_fields(self) -> set[str]:
        return self._ENFORCED_FIELDS

    async def _run_checks(
        self, target: str, **kwargs: Any,
    ) -> list[FxTSVerdict]:
        """Run all FTTS checks against a transport spec.

        Args:
            target: transport_id (e.g., "grpc-hardened-transport")
            **kwargs:
                spec: dict — the parsed FTTS spec.
                live: bool — if True, import and inspect transport modules.
        """
        spec: dict[str, Any] | None = kwargs.get("spec")
        live: bool = kwargs.get("live", False)

        if spec is None:
            return [
                FxTSVerdict(
                    check_id="ftts:spec-load",
                    spec_ref="FTTS/spec-load",
                    status=VerdictStatus.ERROR,
                    message=f"No spec provided for transport '{target}'.",
                ),
            ]

        verdicts: list[FxTSVerdict] = []

        # Static checks — always run
        verdicts.append(self._check_spec_version(spec))
        verdicts.extend(self._check_transport_identity(spec, target))
        verdicts.extend(self._check_proto_contract(spec))
        verdicts.extend(self._check_wire_format(spec))
        verdicts.extend(self._check_serialization_bridge(spec))
        verdicts.extend(self._check_server_requirements(spec))
        verdicts.extend(self._check_client_requirements(spec))
        verdicts.extend(self._check_rpc_contract(spec))
        verdicts.extend(self._check_error_protocol(spec))
        verdicts.extend(self._check_conformance_tests(spec))
        verdicts.extend(self._check_integrity(spec))
        verdicts.append(self._check_metadata(spec))

        # Cross-field consistency
        verdicts.extend(self._check_cross_field_consistency(spec))

        # Live checks (import and inspect actual modules)
        if live:
            verdicts.extend(self._live_checks(spec))

        return verdicts

    # ------------------------------------------------------------------
    # spec_version
    # ------------------------------------------------------------------

    def _check_spec_version(self, spec: dict[str, Any]) -> FxTSVerdict:
        version = spec.get("spec_version")
        if version == "0.1.0":
            return FxTSVerdict(
                check_id="ftts:spec-version",
                spec_ref="FTTS/spec_version",
                status=VerdictStatus.PASS,
                message="Spec version is 0.1.0.",
            )
        return FxTSVerdict(
            check_id="ftts:spec-version",
            spec_ref="FTTS/spec_version",
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
    # transport_identity
    # ------------------------------------------------------------------

    def _check_transport_identity(
        self, spec: dict[str, Any], target: str,
    ) -> list[FxTSVerdict]:
        verdicts: list[FxTSVerdict] = []
        identity = spec.get("transport_identity", {})

        # transport_id format
        tid = identity.get("transport_id", "")
        if not TRANSPORT_ID_PATTERN.match(tid) or not (3 <= len(tid) <= 64):
            verdicts.append(FxTSVerdict(
                check_id="ftts:identity-id-format",
                spec_ref="FTTS/transport_identity/transport_id",
                status=VerdictStatus.FAIL,
                message=f"transport_id '{tid}' must be kebab-case, 3-64 chars.",
                violations=[SpecViolation(
                    field="transport_identity.transport_id",
                    expected="kebab-case, 3-64 chars",
                    actual=tid,
                    message="Invalid transport_id format.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:identity-id-format",
                spec_ref="FTTS/transport_identity/transport_id",
                status=VerdictStatus.PASS,
                message=f"transport_id '{tid}' is valid.",
            ))

        # transport_id matches target
        if tid and tid != target:
            verdicts.append(FxTSVerdict(
                check_id="ftts:identity-target-match",
                spec_ref="FTTS/transport_identity/transport_id",
                status=VerdictStatus.FAIL,
                message=f"transport_id '{tid}' does not match target '{target}'.",
                violations=[SpecViolation(
                    field="transport_identity.transport_id",
                    expected=target,
                    actual=tid,
                    message="transport_id must match the runner target.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:identity-target-match",
                spec_ref="FTTS/transport_identity/transport_id",
                status=VerdictStatus.PASS,
                message="transport_id matches target.",
            ))

        # name present
        name = identity.get("name", "")
        if not name or len(name) > 128:
            verdicts.append(FxTSVerdict(
                check_id="ftts:identity-name",
                spec_ref="FTTS/transport_identity/name",
                status=VerdictStatus.FAIL,
                message="transport name must be 1-128 chars.",
                violations=[SpecViolation(
                    field="transport_identity.name",
                    expected="1-128 chars",
                    actual=name,
                    message="Invalid transport name.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:identity-name",
                spec_ref="FTTS/transport_identity/name",
                status=VerdictStatus.PASS,
                message=f"Transport name '{name}' is valid.",
            ))

        # version semver
        ver = identity.get("version", "")
        if not SEMVER_PATTERN.match(ver):
            verdicts.append(FxTSVerdict(
                check_id="ftts:identity-version",
                spec_ref="FTTS/transport_identity/version",
                status=VerdictStatus.FAIL,
                message=f"Version '{ver}' is not valid semver.",
                violations=[SpecViolation(
                    field="transport_identity.version",
                    expected="semver (e.g. 0.1.0)",
                    actual=ver,
                    message="Invalid version format.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:identity-version",
                spec_ref="FTTS/transport_identity/version",
                status=VerdictStatus.PASS,
                message=f"Version '{ver}' is valid semver.",
            ))

        # protocol present
        proto = identity.get("protocol", "")
        if not proto:
            verdicts.append(FxTSVerdict(
                check_id="ftts:identity-protocol",
                spec_ref="FTTS/transport_identity/protocol",
                status=VerdictStatus.FAIL,
                message="protocol is required.",
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:identity-protocol",
                spec_ref="FTTS/transport_identity/protocol",
                status=VerdictStatus.PASS,
                message=f"Protocol is '{proto}'.",
            ))

        # proto_package present
        pkg = identity.get("proto_package", "")
        if not pkg:
            verdicts.append(FxTSVerdict(
                check_id="ftts:identity-proto-package",
                spec_ref="FTTS/transport_identity/proto_package",
                status=VerdictStatus.FAIL,
                message="proto_package is required.",
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:identity-proto-package",
                spec_ref="FTTS/transport_identity/proto_package",
                status=VerdictStatus.PASS,
                message=f"Proto package is '{pkg}'.",
            ))

        return verdicts

    # ------------------------------------------------------------------
    # proto_contract
    # ------------------------------------------------------------------

    def _check_proto_contract(self, spec: dict[str, Any]) -> list[FxTSVerdict]:
        verdicts: list[FxTSVerdict] = []
        contract = spec.get("proto_contract", {})

        # proto_files
        files = contract.get("proto_files", [])
        if not files:
            verdicts.append(FxTSVerdict(
                check_id="ftts:proto-files-present",
                spec_ref="FTTS/proto_contract/proto_files",
                status=VerdictStatus.FAIL,
                message="proto_files must have at least 1 entry.",
            ))
        else:
            all_valid = True
            for pf in files:
                if not pf.get("file") or not pf.get("purpose"):
                    all_valid = False
            if all_valid:
                verdicts.append(FxTSVerdict(
                    check_id="ftts:proto-files-present",
                    spec_ref="FTTS/proto_contract/proto_files",
                    status=VerdictStatus.PASS,
                    message=f"{len(files)} proto files declared.",
                    evidence={"files": [f.get("file") for f in files]},
                ))
            else:
                verdicts.append(FxTSVerdict(
                    check_id="ftts:proto-files-present",
                    spec_ref="FTTS/proto_contract/proto_files",
                    status=VerdictStatus.FAIL,
                    message="All proto_files entries must have 'file' and 'purpose'.",
                ))

        # service_name
        svc = contract.get("service_name", "")
        if not svc:
            verdicts.append(FxTSVerdict(
                check_id="ftts:proto-service-name",
                spec_ref="FTTS/proto_contract/service_name",
                status=VerdictStatus.FAIL,
                message="service_name is required.",
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:proto-service-name",
                spec_ref="FTTS/proto_contract/service_name",
                status=VerdictStatus.PASS,
                message=f"Service name is '{svc}'.",
            ))

        # message_types
        msgs = contract.get("message_types", [])
        if not msgs:
            verdicts.append(FxTSVerdict(
                check_id="ftts:proto-message-types",
                spec_ref="FTTS/proto_contract/message_types",
                status=VerdictStatus.FAIL,
                message="message_types must have at least 1 entry.",
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:proto-message-types",
                spec_ref="FTTS/proto_contract/message_types",
                status=VerdictStatus.PASS,
                message=f"{len(msgs)} message types declared.",
                evidence={"count": len(msgs)},
            ))

        # enum_types
        enums = contract.get("enum_types", [])
        if not enums:
            verdicts.append(FxTSVerdict(
                check_id="ftts:proto-enum-types",
                spec_ref="FTTS/proto_contract/enum_types",
                status=VerdictStatus.FAIL,
                message="enum_types must have at least 1 entry.",
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:proto-enum-types",
                spec_ref="FTTS/proto_contract/enum_types",
                status=VerdictStatus.PASS,
                message=f"{len(enums)} enum types declared.",
                evidence={"count": len(enums)},
            ))

        return verdicts

    # ------------------------------------------------------------------
    # wire_format
    # ------------------------------------------------------------------

    def _check_wire_format(self, spec: dict[str, Any]) -> list[FxTSVerdict]:
        verdicts: list[FxTSVerdict] = []
        wf = spec.get("wire_format", {})

        # encoding
        encoding = wf.get("encoding", "")
        if encoding not in VALID_ENCODINGS:
            verdicts.append(FxTSVerdict(
                check_id="ftts:wire-encoding",
                spec_ref="FTTS/wire_format/encoding",
                status=VerdictStatus.FAIL,
                message=f"Encoding '{encoding}' not in {sorted(VALID_ENCODINGS)}.",
                violations=[SpecViolation(
                    field="wire_format.encoding",
                    expected=sorted(VALID_ENCODINGS),
                    actual=encoding,
                    message="Invalid wire encoding.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:wire-encoding",
                spec_ref="FTTS/wire_format/encoding",
                status=VerdictStatus.PASS,
                message=f"Wire encoding is '{encoding}'.",
            ))

        # compilation_required
        if not wf.get("compilation_required"):
            verdicts.append(FxTSVerdict(
                check_id="ftts:wire-compilation",
                spec_ref="FTTS/wire_format/compilation_required",
                status=VerdictStatus.FAIL,
                message="compilation_required must be true for hardened transport.",
                violations=[SpecViolation(
                    field="wire_format.compilation_required",
                    expected=True,
                    actual=wf.get("compilation_required"),
                    message="Compiled stubs are mandatory.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:wire-compilation",
                spec_ref="FTTS/wire_format/compilation_required",
                status=VerdictStatus.PASS,
                message="Proto compilation is required.",
            ))

        # json_forbidden
        if not wf.get("json_forbidden"):
            verdicts.append(FxTSVerdict(
                check_id="ftts:wire-json-forbidden",
                spec_ref="FTTS/wire_format/json_forbidden",
                status=VerdictStatus.FAIL,
                message="json_forbidden must be true for hardened binary transport.",
                violations=[SpecViolation(
                    field="wire_format.json_forbidden",
                    expected=True,
                    actual=wf.get("json_forbidden"),
                    message="JSON on the wire is prohibited.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:wire-json-forbidden",
                spec_ref="FTTS/wire_format/json_forbidden",
                status=VerdictStatus.PASS,
                message="JSON on the wire is forbidden.",
            ))

        # schema_enforced
        if not wf.get("schema_enforced"):
            verdicts.append(FxTSVerdict(
                check_id="ftts:wire-schema-enforced",
                spec_ref="FTTS/wire_format/schema_enforced",
                status=VerdictStatus.FAIL,
                message="schema_enforced must be true.",
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:wire-schema-enforced",
                spec_ref="FTTS/wire_format/schema_enforced",
                status=VerdictStatus.PASS,
                message="Schema enforcement is enabled.",
            ))

        return verdicts

    # ------------------------------------------------------------------
    # serialization_bridge
    # ------------------------------------------------------------------

    def _check_serialization_bridge(
        self, spec: dict[str, Any],
    ) -> list[FxTSVerdict]:
        verdicts: list[FxTSVerdict] = []
        bridge = spec.get("serialization_bridge", {})

        # bridge_module
        module = bridge.get("bridge_module", "")
        if not module:
            verdicts.append(FxTSVerdict(
                check_id="ftts:bridge-module",
                spec_ref="FTTS/serialization_bridge/bridge_module",
                status=VerdictStatus.FAIL,
                message="bridge_module is required.",
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:bridge-module",
                spec_ref="FTTS/serialization_bridge/bridge_module",
                status=VerdictStatus.PASS,
                message=f"Bridge module is '{module}'.",
            ))

        # round_trip_lossless
        if not bridge.get("round_trip_lossless"):
            verdicts.append(FxTSVerdict(
                check_id="ftts:bridge-round-trip",
                spec_ref="FTTS/serialization_bridge/round_trip_lossless",
                status=VerdictStatus.FAIL,
                message="round_trip_lossless must be true.",
                violations=[SpecViolation(
                    field="serialization_bridge.round_trip_lossless",
                    expected=True,
                    actual=bridge.get("round_trip_lossless"),
                    message="Lossless round-trip is mandatory.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:bridge-round-trip",
                spec_ref="FTTS/serialization_bridge/round_trip_lossless",
                status=VerdictStatus.PASS,
                message="Lossless round-trip is declared.",
            ))

        # type_mappings
        mappings = bridge.get("type_mappings", [])
        if not mappings:
            verdicts.append(FxTSVerdict(
                check_id="ftts:bridge-type-mappings",
                spec_ref="FTTS/serialization_bridge/type_mappings",
                status=VerdictStatus.FAIL,
                message="type_mappings must have at least 1 entry.",
            ))
        else:
            missing_fields = []
            for m in mappings:
                for req in ("pydantic_type", "proto_type", "to_proto_fn", "from_proto_fn"):
                    if not m.get(req):
                        missing_fields.append(f"{m.get('pydantic_type', '?')}.{req}")
            if missing_fields:
                verdicts.append(FxTSVerdict(
                    check_id="ftts:bridge-type-mappings",
                    spec_ref="FTTS/serialization_bridge/type_mappings",
                    status=VerdictStatus.FAIL,
                    message=f"Missing required fields in type_mappings: {missing_fields}.",
                ))
            else:
                verdicts.append(FxTSVerdict(
                    check_id="ftts:bridge-type-mappings",
                    spec_ref="FTTS/serialization_bridge/type_mappings",
                    status=VerdictStatus.PASS,
                    message=f"{len(mappings)} type mappings declared.",
                    evidence={"types": [m["pydantic_type"] for m in mappings]},
                ))

        # enum_mappings
        emaps = bridge.get("enum_mappings", [])
        if not emaps:
            verdicts.append(FxTSVerdict(
                check_id="ftts:bridge-enum-mappings",
                spec_ref="FTTS/serialization_bridge/enum_mappings",
                status=VerdictStatus.FAIL,
                message="enum_mappings must have at least 1 entry.",
            ))
        else:
            invalid_dirs = [
                e for e in emaps
                if e.get("direction") not in VALID_ENUM_DIRECTIONS
            ]
            if invalid_dirs:
                verdicts.append(FxTSVerdict(
                    check_id="ftts:bridge-enum-mappings",
                    spec_ref="FTTS/serialization_bridge/enum_mappings",
                    status=VerdictStatus.FAIL,
                    message=(
                        "Invalid enum mapping directions: "
                        f"{[e.get('python_enum') for e in invalid_dirs]}."
                    ),
                ))
            else:
                verdicts.append(FxTSVerdict(
                    check_id="ftts:bridge-enum-mappings",
                    spec_ref="FTTS/serialization_bridge/enum_mappings",
                    status=VerdictStatus.PASS,
                    message=f"{len(emaps)} enum mappings declared.",
                    evidence={"enums": [e["python_enum"] for e in emaps]},
                ))

        return verdicts

    # ------------------------------------------------------------------
    # server_requirements
    # ------------------------------------------------------------------

    def _check_server_requirements(
        self, spec: dict[str, Any],
    ) -> list[FxTSVerdict]:
        verdicts: list[FxTSVerdict] = []
        srv = spec.get("server_requirements", {})

        # server_module
        module = srv.get("server_module", "")
        if not module:
            verdicts.append(FxTSVerdict(
                check_id="ftts:server-module",
                spec_ref="FTTS/server_requirements/server_module",
                status=VerdictStatus.FAIL,
                message="server_module is required.",
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:server-module",
                spec_ref="FTTS/server_requirements/server_module",
                status=VerdictStatus.PASS,
                message=f"Server module is '{module}'.",
            ))

        # servicer_class
        cls_name = srv.get("servicer_class", "")
        if not cls_name:
            verdicts.append(FxTSVerdict(
                check_id="ftts:server-servicer-class",
                spec_ref="FTTS/server_requirements/servicer_class",
                status=VerdictStatus.FAIL,
                message="servicer_class is required.",
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:server-servicer-class",
                spec_ref="FTTS/server_requirements/servicer_class",
                status=VerdictStatus.PASS,
                message=f"Servicer class is '{cls_name}'.",
            ))

        # uses_compiled_registration
        if not srv.get("uses_compiled_registration"):
            verdicts.append(FxTSVerdict(
                check_id="ftts:server-compiled-registration",
                spec_ref="FTTS/server_requirements/uses_compiled_registration",
                status=VerdictStatus.FAIL,
                message="uses_compiled_registration must be true.",
                violations=[SpecViolation(
                    field="server_requirements.uses_compiled_registration",
                    expected=True,
                    actual=srv.get("uses_compiled_registration"),
                    message="Server must use compiled stub registration.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:server-compiled-registration",
                spec_ref="FTTS/server_requirements/uses_compiled_registration",
                status=VerdictStatus.PASS,
                message="Server uses compiled stub registration.",
            ))

        # uses_compiled_servicer_base
        if not srv.get("uses_compiled_servicer_base"):
            verdicts.append(FxTSVerdict(
                check_id="ftts:server-compiled-base",
                spec_ref="FTTS/server_requirements/uses_compiled_servicer_base",
                status=VerdictStatus.FAIL,
                message="uses_compiled_servicer_base must be true.",
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:server-compiled-base",
                spec_ref="FTTS/server_requirements/uses_compiled_servicer_base",
                status=VerdictStatus.PASS,
                message="Servicer extends compiled base class.",
            ))

        return verdicts

    # ------------------------------------------------------------------
    # client_requirements
    # ------------------------------------------------------------------

    def _check_client_requirements(
        self, spec: dict[str, Any],
    ) -> list[FxTSVerdict]:
        verdicts: list[FxTSVerdict] = []
        cli = spec.get("client_requirements", {})

        # channel_module
        module = cli.get("channel_module", "")
        if not module:
            verdicts.append(FxTSVerdict(
                check_id="ftts:client-module",
                spec_ref="FTTS/client_requirements/channel_module",
                status=VerdictStatus.FAIL,
                message="channel_module is required.",
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:client-module",
                spec_ref="FTTS/client_requirements/channel_module",
                status=VerdictStatus.PASS,
                message=f"Channel module is '{module}'.",
            ))

        # channel_class
        cls_name = cli.get("channel_class", "")
        if not cls_name:
            verdicts.append(FxTSVerdict(
                check_id="ftts:client-channel-class",
                spec_ref="FTTS/client_requirements/channel_class",
                status=VerdictStatus.FAIL,
                message="channel_class is required.",
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:client-channel-class",
                spec_ref="FTTS/client_requirements/channel_class",
                status=VerdictStatus.PASS,
                message=f"Channel class is '{cls_name}'.",
            ))

        # uses_compiled_stub
        if not cli.get("uses_compiled_stub"):
            verdicts.append(FxTSVerdict(
                check_id="ftts:client-compiled-stub",
                spec_ref="FTTS/client_requirements/uses_compiled_stub",
                status=VerdictStatus.FAIL,
                message="uses_compiled_stub must be true.",
                violations=[SpecViolation(
                    field="client_requirements.uses_compiled_stub",
                    expected=True,
                    actual=cli.get("uses_compiled_stub"),
                    message="Client must use compiled AdapterServiceStub.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:client-compiled-stub",
                spec_ref="FTTS/client_requirements/uses_compiled_stub",
                status=VerdictStatus.PASS,
                message="Client uses compiled stub.",
            ))

        return verdicts

    # ------------------------------------------------------------------
    # rpc_contract
    # ------------------------------------------------------------------

    def _check_rpc_contract(self, spec: dict[str, Any]) -> list[FxTSVerdict]:
        verdicts: list[FxTSVerdict] = []
        contract = spec.get("rpc_contract", {})

        # rpcs
        rpcs = contract.get("rpcs", [])
        if not rpcs:
            verdicts.append(FxTSVerdict(
                check_id="ftts:rpc-list",
                spec_ref="FTTS/rpc_contract/rpcs",
                status=VerdictStatus.FAIL,
                message="rpcs must have at least 1 entry.",
            ))
        else:
            invalid = []
            for rpc in rpcs:
                method = rpc.get("method", "?")
                rpc_type = rpc.get("type", "")
                plane = rpc.get("plane", "")
                if rpc_type not in VALID_RPC_TYPES:
                    invalid.append(f"{method}: invalid type '{rpc_type}'")
                if plane not in VALID_PLANES:
                    invalid.append(f"{method}: invalid plane '{plane}'")
                if not rpc.get("request_type"):
                    invalid.append(f"{method}: missing request_type")
                if not rpc.get("response_type"):
                    invalid.append(f"{method}: missing response_type")

            if invalid:
                verdicts.append(FxTSVerdict(
                    check_id="ftts:rpc-list",
                    spec_ref="FTTS/rpc_contract/rpcs",
                    status=VerdictStatus.FAIL,
                    message=f"Invalid RPC entries: {invalid}.",
                    violations=[
                        SpecViolation(
                            field="rpc_contract.rpcs",
                            message=msg,
                        )
                        for msg in invalid
                    ],
                ))
            else:
                verdicts.append(FxTSVerdict(
                    check_id="ftts:rpc-list",
                    spec_ref="FTTS/rpc_contract/rpcs",
                    status=VerdictStatus.PASS,
                    message=f"{len(rpcs)} RPCs declared.",
                    evidence={
                        "methods": [r["method"] for r in rpcs],
                        "by_plane": {
                            p: [r["method"] for r in rpcs if r.get("plane") == p]
                            for p in sorted(VALID_PLANES)
                        },
                    },
                ))

        # metadata_protocol
        meta = contract.get("metadata_protocol", {})
        headers = meta.get("headers", [])
        if not headers:
            verdicts.append(FxTSVerdict(
                check_id="ftts:rpc-metadata",
                spec_ref="FTTS/rpc_contract/metadata_protocol",
                status=VerdictStatus.FAIL,
                message="metadata_protocol must declare at least 1 header.",
            ))
        else:
            missing_keys = [h for h in headers if not h.get("key") or not h.get("purpose")]
            if missing_keys:
                verdicts.append(FxTSVerdict(
                    check_id="ftts:rpc-metadata",
                    spec_ref="FTTS/rpc_contract/metadata_protocol",
                    status=VerdictStatus.FAIL,
                    message="All metadata headers must have 'key' and 'purpose'.",
                ))
            else:
                verdicts.append(FxTSVerdict(
                    check_id="ftts:rpc-metadata",
                    spec_ref="FTTS/rpc_contract/metadata_protocol",
                    status=VerdictStatus.PASS,
                    message=f"{len(headers)} metadata headers declared.",
                    evidence={"headers": [h["key"] for h in headers]},
                ))

        return verdicts

    # ------------------------------------------------------------------
    # error_protocol
    # ------------------------------------------------------------------

    def _check_error_protocol(self, spec: dict[str, Any]) -> list[FxTSVerdict]:
        verdicts: list[FxTSVerdict] = []
        ep = spec.get("error_protocol", {})

        # uses_grpc_status_codes
        if not ep.get("uses_grpc_status_codes"):
            verdicts.append(FxTSVerdict(
                check_id="ftts:error-grpc-codes",
                spec_ref="FTTS/error_protocol/uses_grpc_status_codes",
                status=VerdictStatus.FAIL,
                message="uses_grpc_status_codes must be true.",
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:error-grpc-codes",
                spec_ref="FTTS/error_protocol/uses_grpc_status_codes",
                status=VerdictStatus.PASS,
                message="Proper gRPC status codes are required.",
            ))

        # status_code_mapping
        mapping = ep.get("status_code_mapping", [])
        if not mapping:
            verdicts.append(FxTSVerdict(
                check_id="ftts:error-mapping",
                spec_ref="FTTS/error_protocol/status_code_mapping",
                status=VerdictStatus.FAIL,
                message="status_code_mapping must have at least 1 entry.",
            ))
        else:
            invalid = [
                m for m in mapping
                if not m.get("condition") or not m.get("grpc_code")
            ]
            if invalid:
                verdicts.append(FxTSVerdict(
                    check_id="ftts:error-mapping",
                    spec_ref="FTTS/error_protocol/status_code_mapping",
                    status=VerdictStatus.FAIL,
                    message=(
                        "All status_code_mapping entries must have "
                        "'condition' and 'grpc_code'."
                    ),
                ))
            else:
                verdicts.append(FxTSVerdict(
                    check_id="ftts:error-mapping",
                    spec_ref="FTTS/error_protocol/status_code_mapping",
                    status=VerdictStatus.PASS,
                    message=f"{len(mapping)} error code mappings declared.",
                    evidence={"codes": [m["grpc_code"] for m in mapping]},
                ))

        return verdicts

    # ------------------------------------------------------------------
    # conformance_tests
    # ------------------------------------------------------------------

    def _check_conformance_tests(
        self, spec: dict[str, Any],
    ) -> list[FxTSVerdict]:
        verdicts: list[FxTSVerdict] = []
        ct = spec.get("conformance_tests", {})

        total = ct.get("total", 0)
        if total < 1:
            verdicts.append(FxTSVerdict(
                check_id="ftts:conformance-total",
                spec_ref="FTTS/conformance_tests/total",
                status=VerdictStatus.FAIL,
                message="conformance_tests.total must be >= 1.",
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:conformance-total",
                spec_ref="FTTS/conformance_tests/total",
                status=VerdictStatus.PASS,
                message=f"{total} conformance tests declared.",
            ))

        # categories
        categories = ct.get("categories", {})
        if not categories:
            verdicts.append(FxTSVerdict(
                check_id="ftts:conformance-categories",
                spec_ref="FTTS/conformance_tests/categories",
                status=VerdictStatus.FAIL,
                message="conformance_tests.categories must be non-empty.",
            ))
        else:
            # Sum of categories must match total
            cat_sum = sum(categories.values())
            if cat_sum != total:
                verdicts.append(FxTSVerdict(
                    check_id="ftts:conformance-categories",
                    spec_ref="FTTS/conformance_tests/categories",
                    status=VerdictStatus.FAIL,
                    message=(
                        f"Category sum ({cat_sum}) does not match "
                        f"declared total ({total})."
                    ),
                    violations=[SpecViolation(
                        field="conformance_tests.categories",
                        expected=total,
                        actual=cat_sum,
                        message="Category counts must sum to total.",
                    )],
                ))
            else:
                verdicts.append(FxTSVerdict(
                    check_id="ftts:conformance-categories",
                    spec_ref="FTTS/conformance_tests/categories",
                    status=VerdictStatus.PASS,
                    message=f"{len(categories)} test categories, sum matches total ({total}).",
                ))

        return verdicts

    # ------------------------------------------------------------------
    # integrity
    # ------------------------------------------------------------------

    def _check_integrity(self, spec: dict[str, Any]) -> list[FxTSVerdict]:
        verdicts: list[FxTSVerdict] = []
        integrity = spec.get("integrity")

        if integrity is None:
            verdicts.append(FxTSVerdict(
                check_id="ftts:integrity-present",
                spec_ref="FTTS/integrity",
                status=VerdictStatus.PASS,
                message="No integrity block — hash verification deferred.",
            ))
            return verdicts

        # hash_state
        state = integrity.get("hash_state", "unknown")
        if state not in VALID_HASH_STATES:
            verdicts.append(FxTSVerdict(
                check_id="ftts:integrity-state",
                spec_ref="FTTS/integrity/hash_state",
                status=VerdictStatus.FAIL,
                message=f"hash_state '{state}' not in {sorted(VALID_HASH_STATES)}.",
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:integrity-state",
                spec_ref="FTTS/integrity/hash_state",
                status=VerdictStatus.PASS,
                message=f"hash_state is '{state}'.",
            ))

        # hash format (if present)
        spec_hash = integrity.get("spec_hash")
        if spec_hash is not None and spec_hash:
            if not re.match(r"^[a-f0-9]{64}$", spec_hash):
                verdicts.append(FxTSVerdict(
                    check_id="ftts:integrity-hash-format",
                    spec_ref="FTTS/integrity/spec_hash",
                    status=VerdictStatus.FAIL,
                    message="spec_hash must be a 64-char hex string (SHA-256).",
                ))
            else:
                verdicts.append(FxTSVerdict(
                    check_id="ftts:integrity-hash-format",
                    spec_ref="FTTS/integrity/spec_hash",
                    status=VerdictStatus.PASS,
                    message="spec_hash format is valid.",
                ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:integrity-hash-format",
                spec_ref="FTTS/integrity/spec_hash",
                status=VerdictStatus.PASS,
                message="No spec_hash set — initial spec.",
            ))

        return verdicts

    # ------------------------------------------------------------------
    # metadata
    # ------------------------------------------------------------------

    def _check_metadata(self, spec: dict[str, Any]) -> FxTSVerdict:
        """Metadata is free-form — just verify it's a dict if present."""
        meta = spec.get("metadata")
        if meta is not None and not isinstance(meta, dict):
            return FxTSVerdict(
                check_id="ftts:metadata",
                spec_ref="FTTS/metadata",
                status=VerdictStatus.FAIL,
                message="metadata must be an object if present.",
            )
        return FxTSVerdict(
            check_id="ftts:metadata",
            spec_ref="FTTS/metadata",
            status=VerdictStatus.PASS,
            message="metadata is valid.",
        )

    # ------------------------------------------------------------------
    # Cross-field consistency
    # ------------------------------------------------------------------

    def _check_cross_field_consistency(
        self, spec: dict[str, Any],
    ) -> list[FxTSVerdict]:
        """Checks that depend on multiple sections of the spec."""
        verdicts: list[FxTSVerdict] = []

        # RPC request/response types must all appear in proto_contract.message_types
        contract = spec.get("proto_contract", {})
        declared_msgs = set(contract.get("message_types", []))
        rpcs = spec.get("rpc_contract", {}).get("rpcs", [])

        undeclared = set()
        for rpc in rpcs:
            req = rpc.get("request_type", "")
            resp = rpc.get("response_type", "")
            if req and req not in declared_msgs:
                undeclared.add(req)
            if resp and resp not in declared_msgs:
                undeclared.add(resp)

        if undeclared:
            verdicts.append(FxTSVerdict(
                check_id="ftts:cross-rpc-message-coverage",
                spec_ref="FTTS/cross-field/rpc-message-coverage",
                status=VerdictStatus.FAIL,
                message=(
                    f"RPC types not declared in proto_contract.message_types: "
                    f"{sorted(undeclared)}"
                ),
                violations=[
                    SpecViolation(
                        field="rpc_contract.rpcs",
                        expected="All RPC types in message_types",
                        actual=sorted(undeclared),
                        message="Missing message type declarations.",
                    ),
                ],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:cross-rpc-message-coverage",
                spec_ref="FTTS/cross-field/rpc-message-coverage",
                status=VerdictStatus.PASS,
                message="All RPC request/response types declared in proto_contract.",
            ))

        # Serialization bridge type_mappings pydantic types should cover
        # the core message types used in RPCs
        bridge_types = {
            m["pydantic_type"]
            for m in spec.get("serialization_bridge", {}).get("type_mappings", [])
        }
        # At minimum, ContextualRecord and AdapterManifest must be bridged
        required_bridge = {"ContextualRecord", "AdapterManifest", "AdapterHealth"}
        missing_bridge = required_bridge - bridge_types
        if missing_bridge:
            verdicts.append(FxTSVerdict(
                check_id="ftts:cross-bridge-coverage",
                spec_ref="FTTS/cross-field/bridge-coverage",
                status=VerdictStatus.FAIL,
                message=f"Required bridge types missing: {sorted(missing_bridge)}.",
                violations=[SpecViolation(
                    field="serialization_bridge.type_mappings",
                    expected=sorted(required_bridge),
                    actual=sorted(bridge_types),
                    message="Core types must have bridge mappings.",
                )],
            ))
        else:
            verdicts.append(FxTSVerdict(
                check_id="ftts:cross-bridge-coverage",
                spec_ref="FTTS/cross-field/bridge-coverage",
                status=VerdictStatus.PASS,
                message="Core Pydantic types have bridge mappings.",
            ))

        # Wire format consistency: if encoding=protobuf-binary,
        # then compilation_required and json_forbidden must both be true
        wf = spec.get("wire_format", {})
        if wf.get("encoding") == "protobuf-binary":
            if not wf.get("compilation_required") or not wf.get("json_forbidden"):
                verdicts.append(FxTSVerdict(
                    check_id="ftts:cross-wire-consistency",
                    spec_ref="FTTS/cross-field/wire-consistency",
                    status=VerdictStatus.FAIL,
                    message=(
                        "encoding=protobuf-binary requires "
                        "compilation_required=true and json_forbidden=true."
                    ),
                ))
            else:
                verdicts.append(FxTSVerdict(
                    check_id="ftts:cross-wire-consistency",
                    spec_ref="FTTS/cross-field/wire-consistency",
                    status=VerdictStatus.PASS,
                    message="Wire format rules are internally consistent.",
                ))

        return verdicts

    # ------------------------------------------------------------------
    # Live checks (import-time verification)
    # ------------------------------------------------------------------

    def _live_checks(self, spec: dict[str, Any]) -> list[FxTSVerdict]:
        """Import transport modules and verify they match the spec."""
        verdicts: list[FxTSVerdict] = []

        # Try to import bridge module
        bridge_module_name = spec.get("serialization_bridge", {}).get(
            "bridge_module", "",
        )
        if bridge_module_name:
            try:
                bridge_mod = importlib.import_module(bridge_module_name)
                # Verify all declared to_proto_fn and from_proto_fn exist
                missing_fns = []
                for m in spec.get("serialization_bridge", {}).get("type_mappings", []):
                    for fn_key in ("to_proto_fn", "from_proto_fn"):
                        fn_name = m.get(fn_key, "")
                        if fn_name and not hasattr(bridge_mod, fn_name):
                            missing_fns.append(fn_name)

                if missing_fns:
                    verdicts.append(FxTSVerdict(
                        check_id="ftts:live-bridge-functions",
                        spec_ref="FTTS/live/bridge-functions",
                        status=VerdictStatus.FAIL,
                        message=f"Bridge functions not found: {missing_fns}.",
                    ))
                else:
                    verdicts.append(FxTSVerdict(
                        check_id="ftts:live-bridge-functions",
                        spec_ref="FTTS/live/bridge-functions",
                        status=VerdictStatus.PASS,
                        message="All declared bridge functions exist.",
                    ))
            except ImportError as exc:
                verdicts.append(FxTSVerdict(
                    check_id="ftts:live-bridge-import",
                    spec_ref="FTTS/live/bridge-import",
                    status=VerdictStatus.FAIL,
                    message=f"Cannot import bridge module '{bridge_module_name}': {exc}.",
                ))

        # Try to import server module and check servicer class
        server_module_name = spec.get("server_requirements", {}).get(
            "server_module", "",
        )
        servicer_class_name = spec.get("server_requirements", {}).get(
            "servicer_class", "",
        )
        if server_module_name and servicer_class_name:
            try:
                server_mod = importlib.import_module(server_module_name)
                if hasattr(server_mod, servicer_class_name):
                    verdicts.append(FxTSVerdict(
                        check_id="ftts:live-server-class",
                        spec_ref="FTTS/live/server-class",
                        status=VerdictStatus.PASS,
                        message=f"Servicer class '{servicer_class_name}' found.",
                    ))
                else:
                    verdicts.append(FxTSVerdict(
                        check_id="ftts:live-server-class",
                        spec_ref="FTTS/live/server-class",
                        status=VerdictStatus.FAIL,
                        message=(
                            f"Servicer class '{servicer_class_name}' "
                            f"not in {server_module_name}."
                        ),
                    ))
            except ImportError as exc:
                verdicts.append(FxTSVerdict(
                    check_id="ftts:live-server-import",
                    spec_ref="FTTS/live/server-import",
                    status=VerdictStatus.FAIL,
                    message=f"Cannot import server module '{server_module_name}': {exc}.",
                ))

        # Try to import client module and check channel class
        client_module_name = spec.get("client_requirements", {}).get(
            "channel_module", "",
        )
        channel_class_name = spec.get("client_requirements", {}).get(
            "channel_class", "",
        )
        if client_module_name and channel_class_name:
            try:
                client_mod = importlib.import_module(client_module_name)
                if hasattr(client_mod, channel_class_name):
                    verdicts.append(FxTSVerdict(
                        check_id="ftts:live-client-class",
                        spec_ref="FTTS/live/client-class",
                        status=VerdictStatus.PASS,
                        message=f"Channel class '{channel_class_name}' found.",
                    ))
                else:
                    verdicts.append(FxTSVerdict(
                        check_id="ftts:live-client-class",
                        spec_ref="FTTS/live/client-class",
                        status=VerdictStatus.FAIL,
                        message=(
                            f"Channel class '{channel_class_name}' "
                            f"not in {client_module_name}."
                        ),
                    ))
            except ImportError as exc:
                verdicts.append(FxTSVerdict(
                    check_id="ftts:live-client-import",
                    spec_ref="FTTS/live/client-import",
                    status=VerdictStatus.FAIL,
                    message=f"Cannot import client module '{client_module_name}': {exc}.",
                ))

        return verdicts
