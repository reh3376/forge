"""Tests for the FACTS runner — validates FACTSRunner static checks.

Test categories:
1. Unit tests for each _check_* method (pass and fail cases)
2. Integration tests: run against whk-wms.facts.json and whk-mes.facts.json
3. Schema-runner parity: implemented_fields() matches facts.schema.json
4. FHTS governance: integrity hash verification
5. Cross-field consistency: capability/data-source alignment
6. Edge cases: missing sections, empty values, boundary conditions
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

import pytest

# ---------------------------------------------------------------------------
# Path setup — runner lives under src/
# ---------------------------------------------------------------------------

SRC_ROOT = Path(__file__).resolve().parents[3] / "src"
SCHEMA_PATH = SRC_ROOT / "forge" / "governance" / "facts" / "schema" / "facts.schema.json"
WMS_SPEC_PATH = SRC_ROOT / "forge" / "governance" / "facts" / "specs" / "whk-wms.facts.json"
MES_SPEC_PATH = SRC_ROOT / "forge" / "governance" / "facts" / "specs" / "whk-mes.facts.json"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def schema() -> dict[str, Any]:
    with open(SCHEMA_PATH) as f:
        return json.load(f)


@pytest.fixture(scope="module")
def wms_spec() -> dict[str, Any]:
    with open(WMS_SPEC_PATH) as f:
        return json.load(f)


@pytest.fixture(scope="module")
def mes_spec() -> dict[str, Any]:
    with open(MES_SPEC_PATH) as f:
        return json.load(f)


@pytest.fixture(scope="module")
def runner():
    """Instantiate the FACTSRunner with schema loaded."""
    import sys
    sys.path.insert(0, str(SRC_ROOT))
    from forge.governance.facts.runners.facts_runner import FACTSRunner
    return FACTSRunner(schema_path=str(SCHEMA_PATH))


@pytest.fixture(scope="module")
def verdict_status():
    import sys
    sys.path.insert(0, str(SRC_ROOT))
    from forge.governance.shared.runner import VerdictStatus
    return VerdictStatus


def _run(coro):
    """Helper to run an async coroutine synchronously."""
    return asyncio.run(coro)


def _minimal_spec(**overrides: Any) -> dict[str, Any]:
    """Build a minimal valid FACTS spec for unit-test isolation.

    Each _check_* method only reads its own section, so a minimal spec
    contains just enough structure for targeted testing.
    """
    base: dict[str, Any] = {
        "spec_version": "0.1.0",
        "adapter_identity": {
            "adapter_id": "test-adapter",
            "name": "Test Adapter",
            "version": "1.0.0",
            "type": "INGESTION",
            "tier": "MES_MOM",
            "protocol": "graphql",
        },
        "capabilities": {
            "read": True,
            "write": False,
            "subscribe": False,
            "backfill": False,
            "discover": False,
        },
        "lifecycle": {
            "startup_timeout_ms": 30000,
            "shutdown_timeout_ms": 10000,
            "health_check_interval_ms": 15000,
            "restart_policy": "on_failure",
        },
        "connection": {
            "params": [
                {
                    "name": "api_url", "type": "url",
                    "description": "API endpoint",
                    "required": True, "secret": False,
                },
            ],
            "auth_methods": ["bearer_token"],
        },
        "data_contract": {
            "schema_ref": "forge://schemas/test-adapter/v1",
            "output_format": "contextual_record",
            "context_fields": ["event_timestamp", "event_type"],
            "optional_context_fields": [],
            "data_sources": [
                {
                    "source_type": "graphql_query",
                    "endpoint": "/graphql",
                    "description": "Main API",
                    "entities": ["Entity"],
                    "collection_mode": "poll",
                },
            ],
            "sample_record": {
                "adapter_id": "test-adapter",
                "source": "graphql",
                "timestamp": "2026-01-01T00:00:00Z",
                "context": {
                    "event_timestamp": "2026-01-01T00:00:00Z",
                    "event_type": "test_event",
                },
                "payload": {"key": "value"},
            },
        },
        "context_mapping": {
            "mappings": [
                {"source_field": "timestamp", "context_field": "event_timestamp"},
                {"source_field": "type", "context_field": "event_type"},
            ],
            "enrichment_rules": [],
        },
        "error_handling": {
            "retry_policy": {
                "max_retries": 3,
                "initial_delay_ms": 1000,
                "backoff_strategy": "exponential",
                "max_delay_ms": 30000,
            },
            "circuit_breaker": {
                "failure_threshold": 5,
                "half_open_after_ms": 30000,
                "success_threshold": 2,
            },
            "dead_letter": {
                "enabled": True,
                "topic": "forge.dead_letter.test-adapter",
                "max_age_hours": 72,
            },
            "health_degradation": {
                "degraded_after_failures": 3,
                "failed_after_failures": 10,
            },
        },
        "metadata": {"spoke": "test"},
        "integrity": {
            "hash_method": "sha256-c14n-v1",
            "spec_hash": "",
            "hash_state": "approved",
            "previous_hash": None,
            "approved_by": "test",
            "approved_at": "2026-01-01T00:00:00Z",
            "change_history": [
                {
                    "previous_hash": "0" * 64,
                    "new_hash": "",
                    "changed_at": "2026-01-01T00:00:00Z",
                    "source": "manual",
                    "changed_by": "test",
                    "change_type": "structural",
                    "reason": "Initial creation",
                },
            ],
        },
    }
    # Apply overrides (shallow merge at top level)
    for key, value in overrides.items():
        base[key] = value
    return base


# =========================================================================
# 1. Schema-Runner Parity
# =========================================================================


class TestSchemaRunnerParity:
    """Verify implemented_fields() covers every top-level schema property."""

    def test_implemented_fields_match_schema(self, runner, schema):
        schema_props = set(schema.get("properties", {}).keys())
        implemented = runner.implemented_fields()
        missing = schema_props - implemented
        extra = implemented - schema_props
        assert missing == set(), f"Runner missing schema fields: {missing}"
        assert extra == set(), f"Runner has extra fields not in schema: {extra}"

    def test_implemented_fields_count(self, runner):
        assert len(runner.implemented_fields()) == 10

    def test_framework_identity(self, runner):
        assert runner.framework == "FACTS"
        assert runner.version == "0.1.0"


# =========================================================================
# 2. Unit Tests — _check_spec_version
# =========================================================================


class TestCheckSpecVersion:
    """Unit tests for _check_spec_version."""

    def test_valid_version(self, runner, verdict_status):
        spec = _minimal_spec()
        v = runner._check_spec_version(spec)
        assert v.status == verdict_status.PASS
        assert v.check_id == "facts:spec-version"

    def test_wrong_version(self, runner, verdict_status):
        spec = _minimal_spec(spec_version="9.9.9")
        v = runner._check_spec_version(spec)
        assert v.status == verdict_status.FAIL

    def test_missing_version(self, runner, verdict_status):
        spec = _minimal_spec()
        del spec["spec_version"]
        v = runner._check_spec_version(spec)
        assert v.status == verdict_status.FAIL


# =========================================================================
# 3. Unit Tests — _check_identity
# =========================================================================


class TestCheckIdentity:
    """Unit tests for _check_identity — 8 sub-checks."""

    def test_valid_identity(self, runner, verdict_status):
        spec = _minimal_spec()
        verdicts = runner._check_identity(spec, "test-adapter")
        fails = [v for v in verdicts if v.status == verdict_status.FAIL]
        assert fails == [], f"Unexpected failures: {[v.message for v in fails]}"

    def test_id_format_invalid_uppercase(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["adapter_identity"]["adapter_id"] = "Test-Adapter"
        verdicts = runner._check_identity(spec, "Test-Adapter")
        id_format = [v for v in verdicts if v.check_id == "facts:identity-id-format"]
        assert any(v.status == verdict_status.FAIL for v in id_format)

    def test_id_too_short(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["adapter_identity"]["adapter_id"] = "ab"
        verdicts = runner._check_identity(spec, "ab")
        id_format = [v for v in verdicts if v.check_id == "facts:identity-id-format"]
        assert any(v.status == verdict_status.FAIL for v in id_format)

    def test_id_target_mismatch(self, runner, verdict_status):
        spec = _minimal_spec()
        verdicts = runner._check_identity(spec, "different-target")
        id_match = [v for v in verdicts if v.check_id == "facts:identity-id-match"]
        assert any(v.status == verdict_status.FAIL for v in id_match)

    def test_empty_name(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["adapter_identity"]["name"] = ""
        verdicts = runner._check_identity(spec, "test-adapter")
        name_check = [v for v in verdicts if v.check_id == "facts:identity-name"]
        assert any(v.status == verdict_status.FAIL for v in name_check)

    def test_invalid_version(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["adapter_identity"]["version"] = "not-semver"
        verdicts = runner._check_identity(spec, "test-adapter")
        ver_check = [v for v in verdicts if v.check_id == "facts:identity-version"]
        assert any(v.status == verdict_status.FAIL for v in ver_check)

    def test_invalid_type(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["adapter_identity"]["type"] = "INVALID_TYPE"
        verdicts = runner._check_identity(spec, "test-adapter")
        type_check = [v for v in verdicts if v.check_id == "facts:identity-type"]
        assert any(v.status == verdict_status.FAIL for v in type_check)

    def test_invalid_tier(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["adapter_identity"]["tier"] = "NONEXISTENT"
        verdicts = runner._check_identity(spec, "test-adapter")
        tier_check = [v for v in verdicts if v.check_id == "facts:identity-tier"]
        assert any(v.status == verdict_status.FAIL for v in tier_check)

    def test_empty_protocol(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["adapter_identity"]["protocol"] = ""
        verdicts = runner._check_identity(spec, "test-adapter")
        proto_check = [v for v in verdicts if v.check_id == "facts:identity-protocol"]
        assert any(v.status == verdict_status.FAIL for v in proto_check)


# =========================================================================
# 4. Unit Tests — _check_capabilities
# =========================================================================


class TestCheckCapabilities:
    """Unit tests for _check_capabilities."""

    def test_valid_capabilities(self, runner, verdict_status):
        spec = _minimal_spec()
        verdicts = runner._check_capabilities(spec)
        fails = [v for v in verdicts if v.status == verdict_status.FAIL]
        assert fails == []

    def test_read_false_fails(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["capabilities"]["read"] = False
        verdicts = runner._check_capabilities(spec)
        read_check = [v for v in verdicts if v.check_id == "facts:capabilities-read"]
        assert any(v.status == verdict_status.FAIL for v in read_check)

    def test_non_boolean_capability(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["capabilities"]["write"] = "yes"
        verdicts = runner._check_capabilities(spec)
        type_checks = [v for v in verdicts if "type" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in type_checks)


# =========================================================================
# 5. Unit Tests — _check_lifecycle
# =========================================================================


class TestCheckLifecycle:
    """Unit tests for _check_lifecycle."""

    def test_valid_lifecycle(self, runner, verdict_status):
        spec = _minimal_spec()
        verdicts = runner._check_lifecycle(spec)
        fails = [v for v in verdicts if v.status == verdict_status.FAIL]
        assert fails == []

    def test_startup_timeout_too_low(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["lifecycle"]["startup_timeout_ms"] = 500
        verdicts = runner._check_lifecycle(spec)
        timeout_checks = [v for v in verdicts if "startup_timeout_ms" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in timeout_checks)

    def test_startup_timeout_too_high(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["lifecycle"]["startup_timeout_ms"] = 999999
        verdicts = runner._check_lifecycle(spec)
        timeout_checks = [v for v in verdicts if "startup_timeout_ms" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in timeout_checks)

    def test_invalid_restart_policy(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["lifecycle"]["restart_policy"] = "maybe"
        verdicts = runner._check_lifecycle(spec)
        policy_checks = [v for v in verdicts if "restart-policy" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in policy_checks)

    def test_valid_state_transitions(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["lifecycle"]["state_transitions"] = [
            {"from": "REGISTERED", "to": "CONNECTING"},
            {"from": "CONNECTING", "to": "HEALTHY"},
        ]
        verdicts = runner._check_lifecycle(spec)
        trans_checks = [v for v in verdicts if "state-transitions" in v.check_id]
        assert all(v.status == verdict_status.PASS for v in trans_checks)

    def test_invalid_state_transition(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["lifecycle"]["state_transitions"] = [
            {"from": "REGISTERED", "to": "BOGUS_STATE"},
        ]
        verdicts = runner._check_lifecycle(spec)
        trans_checks = [v for v in verdicts if "state-transitions" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in trans_checks)


# =========================================================================
# 6. Unit Tests — _check_connection
# =========================================================================


class TestCheckConnection:
    """Unit tests for _check_connection."""

    def test_valid_connection(self, runner, verdict_status):
        spec = _minimal_spec()
        verdicts = runner._check_connection(spec)
        fails = [v for v in verdicts if v.status == verdict_status.FAIL]
        assert fails == []

    def test_no_params(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["connection"]["params"] = []
        verdicts = runner._check_connection(spec)
        present_check = [v for v in verdicts if "params-present" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in present_check)

    def test_non_snake_case_param(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["connection"]["params"] = [
            {
                "name": "apiUrl", "type": "url",
                "description": "bad", "required": True, "secret": False,
            },
        ]
        verdicts = runner._check_connection(spec)
        valid_check = [v for v in verdicts if "params-valid" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in valid_check)

    def test_invalid_param_type(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["connection"]["params"] = [
            {
                "name": "api_url", "type": "float",
                "description": "bad", "required": True, "secret": False,
            },
        ]
        verdicts = runner._check_connection(spec)
        valid_check = [v for v in verdicts if "params-valid" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in valid_check)

    def test_no_auth_methods(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["connection"]["auth_methods"] = []
        verdicts = runner._check_connection(spec)
        auth_check = [v for v in verdicts if "auth-methods" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in auth_check)

    def test_invalid_auth_method(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["connection"]["auth_methods"] = ["bearer_token", "kerberos"]
        verdicts = runner._check_connection(spec)
        auth_check = [v for v in verdicts if "auth-methods" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in auth_check)


# =========================================================================
# 7. Unit Tests — _check_data_contract
# =========================================================================


class TestCheckDataContract:
    """Unit tests for _check_data_contract."""

    def test_valid_data_contract(self, runner, verdict_status):
        spec = _minimal_spec()
        verdicts = runner._check_data_contract(spec)
        fails = [v for v in verdicts if v.status == verdict_status.FAIL]
        assert fails == []

    def test_invalid_schema_ref(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["data_contract"]["schema_ref"] = "https://example.com"
        verdicts = runner._check_data_contract(spec)
        ref_check = [v for v in verdicts if "schema-ref" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in ref_check)

    def test_invalid_output_format(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["data_contract"]["output_format"] = "csv"
        verdicts = runner._check_data_contract(spec)
        fmt_check = [v for v in verdicts if "output-format" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in fmt_check)

    def test_empty_context_fields(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["data_contract"]["context_fields"] = []
        verdicts = runner._check_data_contract(spec)
        cf_check = [v for v in verdicts if "context-fields" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in cf_check)

    def test_invalid_source_type(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["data_contract"]["data_sources"] = [
            {"source_type": "ftp", "endpoint": "/files", "description": "bad",
             "entities": ["File"], "collection_mode": "poll"},
        ]
        verdicts = runner._check_data_contract(spec)
        src_check = [v for v in verdicts if "sources-valid" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in src_check)

    def test_data_source_no_entities(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["data_contract"]["data_sources"] = [
            {"source_type": "graphql_query", "endpoint": "/gql", "description": "x",
             "entities": [], "collection_mode": "poll"},
        ]
        verdicts = runner._check_data_contract(spec)
        src_check = [v for v in verdicts if "sources-valid" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in src_check)

    def test_sample_record_missing_context_field(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["data_contract"]["sample_record"]["context"] = {
            "event_timestamp": "2026-01-01T00:00:00Z",
        }
        # Missing event_type in sample
        verdicts = runner._check_data_contract(spec)
        sample_check = [v for v in verdicts if "sample-coverage" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in sample_check)


# =========================================================================
# 8. Unit Tests — _check_context_mapping
# =========================================================================


class TestCheckContextMapping:
    """Unit tests for _check_context_mapping."""

    def test_valid_context_mapping(self, runner, verdict_status):
        spec = _minimal_spec()
        verdicts = runner._check_context_mapping(spec)
        fails = [v for v in verdicts if v.status == verdict_status.FAIL]
        assert fails == []

    def test_no_mappings(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["context_mapping"]["mappings"] = []
        verdicts = runner._check_context_mapping(spec)
        present_check = [v for v in verdicts if "mappings-present" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in present_check)

    def test_unmapped_required_field(self, runner, verdict_status):
        spec = _minimal_spec()
        # Add a required context field with no mapping
        spec["data_contract"]["context_fields"] = ["event_timestamp", "event_type", "batch_id"]
        verdicts = runner._check_context_mapping(spec)
        coverage_check = [v for v in verdicts if "mapping-coverage" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in coverage_check)

    def test_orphan_mapping(self, runner, verdict_status):
        spec = _minimal_spec()
        # Add a mapping that targets a field not in context_fields or optional
        spec["context_mapping"]["mappings"].append(
            {"source_field": "phantom", "context_field": "phantom_field"},
        )
        verdicts = runner._check_context_mapping(spec)
        orphan_check = [v for v in verdicts if "no-orphans" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in orphan_check)

    def test_enrichment_covers_required_field(self, runner, verdict_status):
        """A required field can be covered by enrichment instead of mapping."""
        spec = _minimal_spec()
        spec["data_contract"]["context_fields"] = ["event_timestamp", "event_type", "shift_id"]
        # Only map two fields, enrich shift_id
        spec["context_mapping"]["enrichment_rules"] = [
            {"target_field": "shift_id", "rule_type": "timestamp_to_shift",
             "config": {"timezone": "UTC"}},
        ]
        verdicts = runner._check_context_mapping(spec)
        coverage_check = [v for v in verdicts if "mapping-coverage" in v.check_id]
        assert all(v.status == verdict_status.PASS for v in coverage_check)

    def test_invalid_enrichment_rule_type(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["context_mapping"]["enrichment_rules"] = [
            {"target_field": "extra", "rule_type": "magic"},
        ]
        verdicts = runner._check_context_mapping(spec)
        enrichment_check = [v for v in verdicts if "enrichment-valid" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in enrichment_check)


# =========================================================================
# 9. Unit Tests — _check_error_handling
# =========================================================================


class TestCheckErrorHandling:
    """Unit tests for _check_error_handling."""

    def test_valid_error_handling(self, runner, verdict_status):
        spec = _minimal_spec()
        verdicts = runner._check_error_handling(spec)
        fails = [v for v in verdicts if v.status == verdict_status.FAIL]
        assert fails == []

    def test_max_retries_out_of_range(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["error_handling"]["retry_policy"]["max_retries"] = 50
        verdicts = runner._check_error_handling(spec)
        retry_check = [v for v in verdicts if "retry-policy" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in retry_check)

    def test_initial_delay_too_low(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["error_handling"]["retry_policy"]["initial_delay_ms"] = 10
        verdicts = runner._check_error_handling(spec)
        retry_check = [v for v in verdicts if "retry-policy" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in retry_check)

    def test_invalid_backoff_strategy(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["error_handling"]["retry_policy"]["backoff_strategy"] = "random"
        verdicts = runner._check_error_handling(spec)
        retry_check = [v for v in verdicts if "retry-policy" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in retry_check)

    def test_circuit_breaker_threshold_zero(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["error_handling"]["circuit_breaker"]["failure_threshold"] = 0
        verdicts = runner._check_error_handling(spec)
        cb_check = [v for v in verdicts if "circuit-breaker" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in cb_check)

    def test_half_open_too_low(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["error_handling"]["circuit_breaker"]["half_open_after_ms"] = 500
        verdicts = runner._check_error_handling(spec)
        cb_check = [v for v in verdicts if "circuit-breaker" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in cb_check)


# =========================================================================
# 10. Unit Tests — _check_metadata
# =========================================================================


class TestCheckMetadata:
    """Unit tests for _check_metadata."""

    def test_valid_metadata(self, runner, verdict_status):
        spec = _minimal_spec()
        v = runner._check_metadata(spec)
        assert v.status == verdict_status.PASS

    def test_metadata_not_dict(self, runner, verdict_status):
        spec = _minimal_spec(metadata="not a dict")
        v = runner._check_metadata(spec)
        assert v.status == verdict_status.FAIL

    def test_metadata_none_passes(self, runner, verdict_status):
        """None metadata is acceptable (field is optional)."""
        spec = _minimal_spec()
        spec["metadata"] = None
        v = runner._check_metadata(spec)
        assert v.status == verdict_status.PASS


# =========================================================================
# 11. Unit Tests — _check_integrity
# =========================================================================


class TestCheckIntegrity:
    """Unit tests for _check_integrity (FHTS governance)."""

    def test_valid_integrity(self, runner, verdict_status):
        spec = _minimal_spec()
        # Compute real hash for the spec
        import hashlib
        spec_for_hash = {k: v for k, v in spec.items() if k != "integrity"}
        canonical = json.dumps(spec_for_hash, sort_keys=True, separators=(",", ":"))
        real_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        spec["integrity"]["spec_hash"] = real_hash
        verdicts = runner._check_integrity(spec)
        fails = [v for v in verdicts if v.status == verdict_status.FAIL]
        assert fails == []

    def test_no_integrity_block(self, runner, verdict_status):
        spec = _minimal_spec()
        del spec["integrity"]
        verdicts = runner._check_integrity(spec)
        assert any(v.status == verdict_status.SKIP for v in verdicts)

    def test_invalid_hash_format(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["integrity"]["spec_hash"] = "not-a-hash"
        verdicts = runner._check_integrity(spec)
        hash_check = [v for v in verdicts if "hash-format" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in hash_check)

    def test_unapproved_hash_state(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["integrity"]["hash_state"] = "modified"
        spec["integrity"]["spec_hash"] = "a" * 64
        verdicts = runner._check_integrity(spec)
        state_check = [v for v in verdicts if "hash-state" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in state_check)


# =========================================================================
# 12. Unit Tests — _check_cross_field_consistency
# =========================================================================


class TestCheckCrossFieldConsistency:
    """Unit tests for cross-section validation."""

    def test_write_cap_without_write_sources(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["capabilities"]["write"] = True
        # No write data sources
        verdicts = runner._check_cross_field_consistency(spec)
        write_check = [v for v in verdicts if "cross-write" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in write_check)

    def test_write_cap_with_mutation_source(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["capabilities"]["write"] = True
        spec["data_contract"]["data_sources"].append({
            "source_type": "graphql_mutation",
            "endpoint": "/graphql",
            "description": "Write endpoint",
            "entities": ["Entity"],
            "collection_mode": "write",
        })
        verdicts = runner._check_cross_field_consistency(spec)
        write_check = [v for v in verdicts if "cross-write" in v.check_id]
        assert all(v.status == verdict_status.PASS for v in write_check)

    def test_subscribe_cap_without_subscribe_sources(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["capabilities"]["subscribe"] = True
        # Only poll sources in minimal spec
        verdicts = runner._check_cross_field_consistency(spec)
        sub_check = [v for v in verdicts if "cross-subscribe" in v.check_id]
        assert any(v.status == verdict_status.FAIL for v in sub_check)

    def test_subscribe_cap_with_subscribe_source(self, runner, verdict_status):
        spec = _minimal_spec()
        spec["capabilities"]["subscribe"] = True
        spec["data_contract"]["data_sources"].append({
            "source_type": "rabbitmq",
            "endpoint": "amqp://host",
            "description": "Events",
            "entities": ["Event"],
            "collection_mode": "subscribe",
        })
        verdicts = runner._check_cross_field_consistency(spec)
        sub_check = [v for v in verdicts if "cross-subscribe" in v.check_id]
        assert all(v.status == verdict_status.PASS for v in sub_check)


# =========================================================================
# 13. No-spec error case
# =========================================================================


class TestNoSpec:
    """Verify graceful handling when spec is missing."""

    def test_no_spec_returns_error(self, runner, verdict_status):
        verdicts = _run(runner._run_checks("test-adapter"))
        assert len(verdicts) == 1
        assert verdicts[0].status == verdict_status.ERROR
        assert "No spec provided" in verdicts[0].message


# =========================================================================
# 14. Live checks placeholder
# =========================================================================


class TestLiveChecks:
    """Verify live checks return SKIP (placeholder)."""

    def test_live_checks_return_skip(self, runner, verdict_status):
        spec = _minimal_spec()
        verdicts = _run(runner._live_checks(spec, "test-adapter"))
        assert len(verdicts) == 1
        assert verdicts[0].status == verdict_status.SKIP
        assert "not yet implemented" in verdicts[0].message.lower()


# =========================================================================
# 15. Integration Test — Full run against whk-wms.facts.json
# =========================================================================


class TestIntegrationWMS:
    """Run FACTSRunner against the real WMS spec — zero failures expected."""

    def test_wms_full_run(self, runner, wms_spec, verdict_status):
        report = _run(runner.run(target="whk-wms", spec=wms_spec))
        fails = [v for v in report.verdicts if v.status == verdict_status.FAIL]
        errors = [v for v in report.verdicts if v.status == verdict_status.ERROR]
        not_impl = [v for v in report.verdicts if v.status == verdict_status.NOT_IMPLEMENTED]
        assert not_impl == [], \
            f"NOT_IMPLEMENTED (parity violation): {[v.check_id for v in not_impl]}"
        assert errors == [], \
            f"ERROR verdicts: {[v.message for v in errors]}"
        assert fails == [], \
            f"FAIL verdicts: {[(v.check_id, v.message) for v in fails]}"
        assert report.passed is True

    def test_wms_hash_verified(self, runner, wms_spec):
        report = _run(runner.run(target="whk-wms", spec=wms_spec))
        assert report.hash_verified is True, f"Hash mismatch: {report.hash_message}"

    def test_wms_verdict_count(self, runner, wms_spec, verdict_status):
        """WMS should produce a reasonable number of verdicts (not empty, not truncated)."""
        report = _run(runner.run(target="whk-wms", spec=wms_spec))
        # At minimum: spec_version(1) + identity(8) + capabilities(2+) + lifecycle(4+)
        # + connection(3+) + data_contract(5+) + context_mapping(3+) + error_handling(2+)
        # + metadata(1) + integrity(3+) + cross-field(1+) = ~33+
        assert report.total >= 25, f"Expected ≥25 verdicts, got {report.total}"


# =========================================================================
# 16. Integration Test — Full run against whk-mes.facts.json
# =========================================================================


class TestIntegrationMES:
    """Run FACTSRunner against the real MES spec — zero failures expected."""

    def test_mes_full_run(self, runner, mes_spec, verdict_status):
        report = _run(runner.run(target="whk-mes", spec=mes_spec))
        fails = [v for v in report.verdicts if v.status == verdict_status.FAIL]
        errors = [v for v in report.verdicts if v.status == verdict_status.ERROR]
        not_impl = [v for v in report.verdicts if v.status == verdict_status.NOT_IMPLEMENTED]
        assert not_impl == [], \
            f"NOT_IMPLEMENTED (parity violation): {[v.check_id for v in not_impl]}"
        assert errors == [], \
            f"ERROR verdicts: {[v.message for v in errors]}"
        assert fails == [], \
            f"FAIL verdicts: {[(v.check_id, v.message) for v in fails]}"
        assert report.passed is True

    def test_mes_hash_verified(self, runner, mes_spec):
        report = _run(runner.run(target="whk-mes", spec=mes_spec))
        assert report.hash_verified is True, f"Hash mismatch: {report.hash_message}"

    def test_mes_has_write_cross_check(self, runner, mes_spec, verdict_status):
        """MES has write=true — cross-field check should validate write sources exist."""
        report = _run(runner.run(target="whk-mes", spec=mes_spec))
        write_checks = [v for v in report.verdicts if "cross-write" in v.check_id]
        assert len(write_checks) >= 1
        assert all(v.status == verdict_status.PASS for v in write_checks)

    def test_mes_verdict_count(self, runner, mes_spec):
        """MES should produce more verdicts than WMS (more capabilities, MQTT, etc.)."""
        report = _run(runner.run(target="whk-mes", spec=mes_spec))
        assert report.total >= 25


# =========================================================================
# 17. Integration — Both specs produce consistent results
# =========================================================================


class TestCrossSpecConsistency:
    """Verify cross-spec governance properties hold."""

    def test_both_specs_pass(self, runner, wms_spec, mes_spec):
        wms_report = _run(runner.run(target="whk-wms", spec=wms_spec))
        mes_report = _run(runner.run(target="whk-mes", spec=mes_spec))
        assert wms_report.passed is True
        assert mes_report.passed is True

    def test_both_hashes_verified(self, runner, wms_spec, mes_spec):
        wms_report = _run(runner.run(target="whk-wms", spec=wms_spec))
        mes_report = _run(runner.run(target="whk-mes", spec=mes_spec))
        assert wms_report.hash_verified is True
        assert mes_report.hash_verified is True

    def test_runner_version_consistent(self, runner, wms_spec, mes_spec):
        wms_report = _run(runner.run(target="whk-wms", spec=wms_spec))
        mes_report = _run(runner.run(target="whk-mes", spec=mes_spec))
        assert wms_report.runner_version == mes_report.runner_version == "0.1.0"
