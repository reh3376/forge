# ruff: noqa: E402, UP017, UP042
"""Tests for the FTTS runner — validates transport governance enforcement.

Covers:
  - Schema-runner parity (every schema field enforced)
  - Static checks (spec structure, enums, cross-field consistency)
  - Failure modes (missing fields, invalid values, broken cross-refs)
  - Conformance category sum validation
  - Integrity block checks
  - Cross-field consistency checks
"""

from __future__ import annotations

import datetime
import enum
import json
import sys
from pathlib import Path

# Python 3.10 compat patches
if not hasattr(datetime, "UTC"):
    datetime.UTC = datetime.timezone.utc

if not hasattr(enum, "StrEnum"):
    class StrEnum(str, enum.Enum):
        pass
    enum.StrEnum = StrEnum

# Ensure src/ is importable
_src = Path(__file__).resolve().parents[3] / "src"
if str(_src) not in sys.path:
    sys.path.insert(0, str(_src))

import pytest

from forge.governance.ftts.runners.ftts_runner import FTTSRunner
from forge.governance.shared.runner import VerdictStatus

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SPEC_PATH = Path(__file__).resolve().parents[3] / "specs" / "grpc-hardened-transport.ftts.json"
SCHEMA_PATH = (
    Path(__file__).resolve().parents[3]
    / "src" / "forge" / "governance" / "ftts" / "schema" / "ftts.schema.json"
)


@pytest.fixture()
def spec() -> dict:
    """Load the real FTTS spec."""
    with SPEC_PATH.open() as f:
        return json.load(f)


@pytest.fixture()
def runner() -> FTTSRunner:
    """Create a runner with the real schema."""
    return FTTSRunner(schema_path=SCHEMA_PATH)


@pytest.fixture()
def runner_no_schema() -> FTTSRunner:
    """Create a runner without schema (skips parity check)."""
    return FTTSRunner()


# ---------------------------------------------------------------------------
# Schema-runner parity
# ---------------------------------------------------------------------------

class TestSchemaRunnerParity:
    """Verify schema-runner parity — every schema field must be enforced."""

    def test_enforced_fields_cover_schema(self, runner: FTTSRunner) -> None:
        """Every top-level property in ftts.schema.json must be in _ENFORCED_FIELDS."""
        schema = runner.schema
        assert schema is not None
        schema_props = set(schema.get("properties", {}).keys())
        enforced = runner.implemented_fields()
        uncovered = schema_props - enforced
        assert not uncovered, f"Schema fields not covered by runner: {uncovered}"

    def test_no_extra_enforced_fields(self, runner: FTTSRunner) -> None:
        """Runner should not claim to enforce fields not in the schema."""
        schema = runner.schema
        assert schema is not None
        schema_props = set(schema.get("properties", {}).keys())
        enforced = runner.implemented_fields()
        extra = enforced - schema_props
        assert not extra, f"Runner claims to enforce non-schema fields: {extra}"


# ---------------------------------------------------------------------------
# Full spec passes
# ---------------------------------------------------------------------------

class TestFullSpecPasses:
    """The real grpc-hardened-transport.ftts.json spec should pass all checks."""

    async def test_full_spec_passes(
        self, runner: FTTSRunner, spec: dict,
    ) -> None:
        """Real FTTS spec passes all static checks."""
        report = await runner.run(
            target="grpc-hardened-transport", spec=spec,
        )
        failures = [
            v for v in report.verdicts
            if v.status not in (VerdictStatus.PASS, VerdictStatus.SKIP)
        ]
        assert not failures, (
            "Unexpected failures:\n"
            + "\n".join(f"  {v.check_id}: {v.message}" for v in failures)
        )

    async def test_report_metadata(
        self, runner: FTTSRunner, spec: dict,
    ) -> None:
        """Report has correct framework and target metadata."""
        report = await runner.run(
            target="grpc-hardened-transport", spec=spec,
        )
        assert report.framework == "FTTS"
        assert report.target == "grpc-hardened-transport"
        assert report.runner_version == "0.1.0"

    async def test_report_pass_count(
        self, runner: FTTSRunner, spec: dict,
    ) -> None:
        """Report should have a meaningful number of passing checks."""
        report = await runner.run(
            target="grpc-hardened-transport", spec=spec,
        )
        # We expect at least 20 checks (identity, proto, wire, bridge, etc.)
        assert report.pass_count >= 20, (
            f"Expected >= 20 passing checks, got {report.pass_count}"
        )


# ---------------------------------------------------------------------------
# spec_version
# ---------------------------------------------------------------------------

class TestSpecVersion:
    """Tests for spec_version enforcement."""

    async def test_wrong_version_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        spec["spec_version"] = "9.9.9"
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        version_verdicts = [
            v for v in report.verdicts if v.check_id == "ftts:spec-version"
        ]
        assert len(version_verdicts) == 1
        assert version_verdicts[0].status == VerdictStatus.FAIL

    async def test_missing_version_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        del spec["spec_version"]
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        version_verdicts = [
            v for v in report.verdicts if v.check_id == "ftts:spec-version"
        ]
        assert version_verdicts[0].status == VerdictStatus.FAIL


# ---------------------------------------------------------------------------
# transport_identity
# ---------------------------------------------------------------------------

class TestTransportIdentity:
    """Tests for transport_identity enforcement."""

    async def test_invalid_transport_id_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        spec["transport_identity"]["transport_id"] = "X!"  # uppercase + special
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        id_verdicts = [
            v for v in report.verdicts if v.check_id == "ftts:identity-id-format"
        ]
        assert id_verdicts[0].status == VerdictStatus.FAIL

    async def test_target_mismatch_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        report = await runner_no_schema.run(
            target="wrong-target", spec=spec,
        )
        match_verdicts = [
            v for v in report.verdicts if v.check_id == "ftts:identity-target-match"
        ]
        assert match_verdicts[0].status == VerdictStatus.FAIL

    async def test_missing_name_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        spec["transport_identity"]["name"] = ""
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        name_verdicts = [
            v for v in report.verdicts if v.check_id == "ftts:identity-name"
        ]
        assert name_verdicts[0].status == VerdictStatus.FAIL

    async def test_invalid_version_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        spec["transport_identity"]["version"] = "not-semver"
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        ver_verdicts = [
            v for v in report.verdicts if v.check_id == "ftts:identity-version"
        ]
        assert ver_verdicts[0].status == VerdictStatus.FAIL


# ---------------------------------------------------------------------------
# wire_format
# ---------------------------------------------------------------------------

class TestWireFormat:
    """Tests for wire_format enforcement."""

    async def test_invalid_encoding_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        spec["wire_format"]["encoding"] = "xml"
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        enc_verdicts = [
            v for v in report.verdicts if v.check_id == "ftts:wire-encoding"
        ]
        assert enc_verdicts[0].status == VerdictStatus.FAIL

    async def test_compilation_not_required_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        spec["wire_format"]["compilation_required"] = False
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        comp_verdicts = [
            v for v in report.verdicts if v.check_id == "ftts:wire-compilation"
        ]
        assert comp_verdicts[0].status == VerdictStatus.FAIL

    async def test_json_allowed_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        spec["wire_format"]["json_forbidden"] = False
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        json_verdicts = [
            v for v in report.verdicts if v.check_id == "ftts:wire-json-forbidden"
        ]
        assert json_verdicts[0].status == VerdictStatus.FAIL


# ---------------------------------------------------------------------------
# serialization_bridge
# ---------------------------------------------------------------------------

class TestSerializationBridge:
    """Tests for serialization_bridge enforcement."""

    async def test_missing_bridge_module_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        spec["serialization_bridge"]["bridge_module"] = ""
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        mod_verdicts = [
            v for v in report.verdicts if v.check_id == "ftts:bridge-module"
        ]
        assert mod_verdicts[0].status == VerdictStatus.FAIL

    async def test_round_trip_not_lossless_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        spec["serialization_bridge"]["round_trip_lossless"] = False
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        rt_verdicts = [
            v for v in report.verdicts if v.check_id == "ftts:bridge-round-trip"
        ]
        assert rt_verdicts[0].status == VerdictStatus.FAIL

    async def test_empty_type_mappings_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        spec["serialization_bridge"]["type_mappings"] = []
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        tm_verdicts = [
            v for v in report.verdicts if v.check_id == "ftts:bridge-type-mappings"
        ]
        assert tm_verdicts[0].status == VerdictStatus.FAIL

    async def test_invalid_enum_direction_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        spec["serialization_bridge"]["enum_mappings"][0]["direction"] = "invalid"
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        em_verdicts = [
            v for v in report.verdicts if v.check_id == "ftts:bridge-enum-mappings"
        ]
        assert em_verdicts[0].status == VerdictStatus.FAIL


# ---------------------------------------------------------------------------
# rpc_contract
# ---------------------------------------------------------------------------

class TestRpcContract:
    """Tests for rpc_contract enforcement."""

    async def test_invalid_rpc_type_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        spec["rpc_contract"]["rpcs"][0]["type"] = "bidi_magic"
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        rpc_verdicts = [
            v for v in report.verdicts if v.check_id == "ftts:rpc-list"
        ]
        assert rpc_verdicts[0].status == VerdictStatus.FAIL

    async def test_invalid_plane_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        spec["rpc_contract"]["rpcs"][0]["plane"] = "management"
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        rpc_verdicts = [
            v for v in report.verdicts if v.check_id == "ftts:rpc-list"
        ]
        assert rpc_verdicts[0].status == VerdictStatus.FAIL

    async def test_empty_metadata_headers_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        spec["rpc_contract"]["metadata_protocol"]["headers"] = []
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        meta_verdicts = [
            v for v in report.verdicts if v.check_id == "ftts:rpc-metadata"
        ]
        assert meta_verdicts[0].status == VerdictStatus.FAIL


# ---------------------------------------------------------------------------
# error_protocol
# ---------------------------------------------------------------------------

class TestErrorProtocol:
    """Tests for error_protocol enforcement."""

    async def test_grpc_codes_disabled_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        spec["error_protocol"]["uses_grpc_status_codes"] = False
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        code_verdicts = [
            v for v in report.verdicts if v.check_id == "ftts:error-grpc-codes"
        ]
        assert code_verdicts[0].status == VerdictStatus.FAIL

    async def test_empty_mapping_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        spec["error_protocol"]["status_code_mapping"] = []
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        map_verdicts = [
            v for v in report.verdicts if v.check_id == "ftts:error-mapping"
        ]
        assert map_verdicts[0].status == VerdictStatus.FAIL


# ---------------------------------------------------------------------------
# conformance_tests
# ---------------------------------------------------------------------------

class TestConformanceTests:
    """Tests for conformance_tests enforcement."""

    async def test_category_sum_mismatch_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        spec["conformance_tests"]["categories"]["extra_fake"] = 999
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        cat_verdicts = [
            v for v in report.verdicts if v.check_id == "ftts:conformance-categories"
        ]
        assert cat_verdicts[0].status == VerdictStatus.FAIL

    async def test_zero_total_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        spec["conformance_tests"]["total"] = 0
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        total_verdicts = [
            v for v in report.verdicts if v.check_id == "ftts:conformance-total"
        ]
        assert total_verdicts[0].status == VerdictStatus.FAIL


# ---------------------------------------------------------------------------
# Cross-field consistency
# ---------------------------------------------------------------------------

class TestCrossFieldConsistency:
    """Tests for cross-field consistency checks."""

    async def test_undeclared_rpc_message_type_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        """RPC referencing a message type not in proto_contract.message_types."""
        spec["rpc_contract"]["rpcs"].append({
            "method": "FakeRpc",
            "type": "unary_unary",
            "request_type": "FakeRequest",
            "response_type": "FakeResponse",
            "plane": "control",
        })
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        coverage_verdicts = [
            v for v in report.verdicts
            if v.check_id == "ftts:cross-rpc-message-coverage"
        ]
        assert coverage_verdicts[0].status == VerdictStatus.FAIL

    async def test_missing_core_bridge_type_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        """Removing ContextualRecord from bridge mappings fails."""
        spec["serialization_bridge"]["type_mappings"] = [
            m for m in spec["serialization_bridge"]["type_mappings"]
            if m["pydantic_type"] != "ContextualRecord"
        ]
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        bridge_verdicts = [
            v for v in report.verdicts
            if v.check_id == "ftts:cross-bridge-coverage"
        ]
        assert bridge_verdicts[0].status == VerdictStatus.FAIL

    async def test_wire_consistency_fails_if_json_allowed_with_binary(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        """protobuf-binary encoding with json_forbidden=False is inconsistent."""
        spec["wire_format"]["encoding"] = "protobuf-binary"
        spec["wire_format"]["json_forbidden"] = False
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        wire_verdicts = [
            v for v in report.verdicts
            if v.check_id == "ftts:cross-wire-consistency"
        ]
        assert wire_verdicts[0].status == VerdictStatus.FAIL


# ---------------------------------------------------------------------------
# No spec provided
# ---------------------------------------------------------------------------

class TestNoSpec:
    """Edge case: runner called without a spec."""

    async def test_no_spec_returns_error(
        self, runner_no_schema: FTTSRunner,
    ) -> None:
        report = await runner_no_schema.run(
            target="grpc-hardened-transport",
        )
        assert report.verdicts[0].status == VerdictStatus.ERROR
        assert "No spec provided" in report.verdicts[0].message


# ---------------------------------------------------------------------------
# integrity
# ---------------------------------------------------------------------------

class TestIntegrity:
    """Tests for the integrity block checks."""

    async def test_no_integrity_block_passes(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        """Spec with no integrity block should pass (hash deferred)."""
        del spec["integrity"]
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        integrity_verdicts = [
            v for v in report.verdicts if "integrity" in v.check_id
        ]
        assert all(v.status == VerdictStatus.PASS for v in integrity_verdicts)

    async def test_invalid_hash_state_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        spec["integrity"]["hash_state"] = "banana"
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        state_verdicts = [
            v for v in report.verdicts if v.check_id == "ftts:integrity-state"
        ]
        assert state_verdicts[0].status == VerdictStatus.FAIL

    async def test_invalid_hash_format_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        spec["integrity"]["spec_hash"] = "not-a-valid-hex"
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        hash_verdicts = [
            v for v in report.verdicts if v.check_id == "ftts:integrity-hash-format"
        ]
        assert hash_verdicts[0].status == VerdictStatus.FAIL


# ---------------------------------------------------------------------------
# server_requirements
# ---------------------------------------------------------------------------

class TestServerRequirements:
    """Tests for server_requirements enforcement."""

    async def test_missing_server_module_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        spec["server_requirements"]["server_module"] = ""
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        mod_verdicts = [
            v for v in report.verdicts if v.check_id == "ftts:server-module"
        ]
        assert mod_verdicts[0].status == VerdictStatus.FAIL

    async def test_compiled_registration_false_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        spec["server_requirements"]["uses_compiled_registration"] = False
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        reg_verdicts = [
            v for v in report.verdicts
            if v.check_id == "ftts:server-compiled-registration"
        ]
        assert reg_verdicts[0].status == VerdictStatus.FAIL


# ---------------------------------------------------------------------------
# client_requirements
# ---------------------------------------------------------------------------

class TestClientRequirements:
    """Tests for client_requirements enforcement."""

    async def test_compiled_stub_false_fails(
        self, runner_no_schema: FTTSRunner, spec: dict,
    ) -> None:
        spec["client_requirements"]["uses_compiled_stub"] = False
        report = await runner_no_schema.run(
            target="grpc-hardened-transport", spec=spec,
        )
        stub_verdicts = [
            v for v in report.verdicts if v.check_id == "ftts:client-compiled-stub"
        ]
        assert stub_verdicts[0].status == VerdictStatus.FAIL
