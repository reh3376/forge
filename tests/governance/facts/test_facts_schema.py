"""Tests for the FACTS (Forge Adapter Conformance Test Specification) schema.

Sprint 1, Task S1.4 — validates:
  - Schema self-validates against JSON Schema draft 2020-12 meta-schema
  - Minimal valid spec passes validation
  - Missing required fields are caught
  - Invalid enum values are caught
  - Nested object validation works (connection params, context mappings)
  - Integrity block validation (hash format, method enum, change_history)
  - FHTS governance: hash state, approval, agent-sourced changes
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# The jsonschema ≥4.18 is a project dependency (Python 3.12+ target).
# In this sandbox (3.10), the test runner must find it on sys.path —
# CI uses the project's virtual environment where it's always available.
# ---------------------------------------------------------------------------
try:
    from jsonschema import Draft202012Validator, ValidationError
except ImportError:
    import sys
    sys.path.insert(0, str(Path.home() / ".local/lib/python3.10/site-packages"))
    from jsonschema import Draft202012Validator, ValidationError


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SCHEMA_PATH = (
    Path(__file__).resolve().parents[3]
    / "src" / "forge" / "governance" / "facts" / "schema" / "facts.schema.json"
)


@pytest.fixture(scope="module")
def schema() -> dict:
    """Load the FACTS schema once per module."""
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def validator(schema: dict) -> Draft202012Validator:
    """Create a reusable validator from the schema."""
    return Draft202012Validator(schema)


def _minimal_valid_spec() -> dict:
    """Return the smallest spec that passes validation."""
    return {
        "spec_version": "0.1.0",
        "adapter_identity": {
            "adapter_id": "test-adapter",
            "name": "Test Adapter",
            "version": "0.1.0",
            "type": "INGESTION",
            "tier": "MES_MOM",
            "protocol": "graphql",
        },
        "capabilities": {
            "read": True,
        },
        "lifecycle": {
            "startup_timeout_ms": 10000,
            "shutdown_timeout_ms": 5000,
            "health_check_interval_ms": 5000,
            "restart_policy": "on_failure",
        },
        "connection": {
            "params": [
                {
                    "name": "api_url",
                    "type": "url",
                    "required": True,
                    "secret": False,
                    "description": "API endpoint URL",
                }
            ],
            "auth_methods": ["bearer_token"],
        },
        "data_contract": {
            "schema_ref": "forge://schemas/test-adapter/v1",
            "output_format": "contextual_record",
            "context_fields": ["equipment_id", "batch_id"],
        },
        "context_mapping": {
            "mappings": [
                {
                    "source_field": "device.id",
                    "context_field": "equipment_id",
                },
                {
                    "source_field": "batch.number",
                    "context_field": "batch_id",
                },
            ],
        },
        "error_handling": {
            "retry_policy": {
                "max_retries": 3,
                "initial_delay_ms": 1000,
                "backoff_strategy": "exponential",
            },
            "circuit_breaker": {
                "failure_threshold": 3,
                "half_open_after_ms": 30000,
            },
        },
    }


@pytest.fixture()
def minimal_spec() -> dict:
    """Fresh copy of minimal valid spec for each test."""
    return _minimal_valid_spec()


# ---------------------------------------------------------------------------
# 1. Meta-schema validation
# ---------------------------------------------------------------------------


class TestMetaSchemaValidation:
    """Verify the FACTS schema itself is valid JSON Schema."""

    def test_schema_is_valid_draft_2020_12(self, schema: dict):
        """facts.schema.json must validate against JSON Schema draft 2020-12."""
        Draft202012Validator.check_schema(schema)

    def test_schema_has_id(self, schema: dict):
        assert schema["$id"] == "forge://fxts/facts/v0.1.0"

    def test_schema_has_title(self, schema: dict):
        assert "FACTS" in schema["title"]

    def test_schema_has_8_required_fields(self, schema: dict):
        assert len(schema["required"]) == 8

    def test_schema_has_10_properties(self, schema: dict):
        # 8 required + metadata + integrity
        assert len(schema["properties"]) == 10


# ---------------------------------------------------------------------------
# 2. Minimal valid spec
# ---------------------------------------------------------------------------


class TestMinimalValidSpec:
    """Verify the minimal spec fixture passes validation."""

    def test_minimal_spec_is_valid(self, validator: Draft202012Validator, minimal_spec: dict):
        validator.validate(minimal_spec)

    def test_minimal_spec_with_all_optional_fields(


        self, validator: Draft202012Validator, minimal_spec: dict,


    ):
        """Spec with all optional fields populated should still be valid."""
        minimal_spec["metadata"] = {"author": "test", "notes": "full spec"}
        minimal_spec["integrity"] = {
            "hash_method": "sha256-c14n-v1",
            "spec_hash": "a" * 64,
            "hash_state": "approved",
            "previous_hash": "b" * 64,
            "approved_by": "reh3376",
            "approved_at": "2026-04-06T12:00:00Z",
            "change_history": [
                {
                    "previous_hash": "b" * 64,
                    "new_hash": "a" * 64,
                    "changed_at": "2026-04-06T11:55:00Z",
                    "source": "agent",
                    "changed_by": "claude-opus-4-6",
                    "change_type": "content",
                    "reason": "Updated lifecycle timeouts",
                }
            ],
        }
        minimal_spec["capabilities"]["write"] = False
        minimal_spec["capabilities"]["subscribe"] = True
        minimal_spec["capabilities"]["backfill"] = True
        minimal_spec["capabilities"]["discover"] = False
        minimal_spec["data_contract"]["optional_context_fields"] = ["shift", "operator_id"]
        minimal_spec["data_contract"]["data_sources"] = [
            {
                "source_type": "graphql_query",
                "endpoint": "/graphql",
                "description": "Primary data source",
                "entities": ["Barrel", "Lot"],
                "collection_mode": "poll",
            }
        ]
        minimal_spec["error_handling"]["dead_letter"] = {
            "enabled": True,
            "topic": "forge.dead-letter.test",
            "max_age_hours": 72,
        }
        minimal_spec["error_handling"]["health_degradation"] = {
            "degraded_after_failures": 2,
            "failed_after_failures": 5,
        }
        validator.validate(minimal_spec)


# ---------------------------------------------------------------------------
# 3. Missing required fields
# ---------------------------------------------------------------------------


class TestMissingRequiredFields:
    """Every required top-level field must be enforced."""

    @pytest.mark.parametrize("field", [
        "spec_version",
        "adapter_identity",
        "capabilities",
        "lifecycle",
        "connection",
        "data_contract",
        "context_mapping",
        "error_handling",
    ])
    def test_missing_required_top_level_field(

        self, validator: Draft202012Validator, minimal_spec: dict, field: str,

    ):
        del minimal_spec[field]
        with pytest.raises(ValidationError, match=field):
            validator.validate(minimal_spec)

    def test_missing_adapter_id(self, validator: Draft202012Validator, minimal_spec: dict):
        del minimal_spec["adapter_identity"]["adapter_id"]
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_missing_capabilities_read(self, validator: Draft202012Validator, minimal_spec: dict):
        del minimal_spec["capabilities"]["read"]
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_missing_connection_params(self, validator: Draft202012Validator, minimal_spec: dict):
        del minimal_spec["connection"]["params"]
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_missing_data_contract_schema_ref(


        self, validator: Draft202012Validator, minimal_spec: dict,


    ):
        del minimal_spec["data_contract"]["schema_ref"]
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_missing_context_mappings(self, validator: Draft202012Validator, minimal_spec: dict):
        del minimal_spec["context_mapping"]["mappings"]
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_missing_retry_policy(self, validator: Draft202012Validator, minimal_spec: dict):
        del minimal_spec["error_handling"]["retry_policy"]
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_missing_circuit_breaker(self, validator: Draft202012Validator, minimal_spec: dict):
        del minimal_spec["error_handling"]["circuit_breaker"]
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)


# ---------------------------------------------------------------------------
# 4. Invalid enum values
# ---------------------------------------------------------------------------


class TestInvalidEnums:
    """Every enum field must reject invalid values."""

    def test_invalid_spec_version(self, validator: Draft202012Validator, minimal_spec: dict):
        minimal_spec["spec_version"] = "99.0.0"
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_invalid_adapter_type(self, validator: Draft202012Validator, minimal_spec: dict):
        minimal_spec["adapter_identity"]["type"] = "MAGIC"
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_invalid_tier(self, validator: Draft202012Validator, minimal_spec: dict):
        minimal_spec["adapter_identity"]["tier"] = "TIER_99"
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_invalid_auth_method(self, validator: Draft202012Validator, minimal_spec: dict):
        minimal_spec["connection"]["auth_methods"] = ["kerberos"]
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_invalid_restart_policy(self, validator: Draft202012Validator, minimal_spec: dict):
        minimal_spec["lifecycle"]["restart_policy"] = "maybe"
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_invalid_output_format(self, validator: Draft202012Validator, minimal_spec: dict):
        minimal_spec["data_contract"]["output_format"] = "csv"
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_invalid_backoff_strategy(self, validator: Draft202012Validator, minimal_spec: dict):
        minimal_spec["error_handling"]["retry_policy"]["backoff_strategy"] = "random"
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_invalid_hash_method(self, validator: Draft202012Validator, minimal_spec: dict):
        minimal_spec["integrity"] = {
            "hash_method": "md5",
            "spec_hash": "a" * 64,
        }
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_invalid_hash_state(self, validator: Draft202012Validator, minimal_spec: dict):
        minimal_spec["integrity"] = {
            "hash_method": "sha256-c14n-v1",
            "spec_hash": "a" * 64,
            "hash_state": "corrupted",
        }
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_invalid_change_history_source(


        self, validator: Draft202012Validator, minimal_spec: dict,


    ):
        minimal_spec["integrity"] = {
            "hash_method": "sha256-c14n-v1",
            "spec_hash": "a" * 64,
            "change_history": [
                {
                    "previous_hash": "b" * 64,
                    "new_hash": "a" * 64,
                    "changed_at": "2026-04-06T12:00:00Z",
                    "source": "hacker",
                }
            ],
        }
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)


# ---------------------------------------------------------------------------
# 5. Pattern and format validation
# ---------------------------------------------------------------------------


class TestPatternValidation:
    """Regex patterns and format constraints are enforced."""

    def test_adapter_id_must_be_kebab_case(


        self, validator: Draft202012Validator, minimal_spec: dict,


    ):
        minimal_spec["adapter_identity"]["adapter_id"] = "WhkWMS"
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_adapter_id_cannot_start_with_number(


        self, validator: Draft202012Validator, minimal_spec: dict,


    ):
        minimal_spec["adapter_identity"]["adapter_id"] = "1-bad"
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_adapter_id_too_short(self, validator: Draft202012Validator, minimal_spec: dict):
        minimal_spec["adapter_identity"]["adapter_id"] = "ab"
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_version_must_be_semver(self, validator: Draft202012Validator, minimal_spec: dict):
        minimal_spec["adapter_identity"]["version"] = "v1"
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_schema_ref_must_start_with_forge(


        self, validator: Draft202012Validator, minimal_spec: dict,


    ):
        minimal_spec["data_contract"]["schema_ref"] = "http://example.com/schema"
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_connection_param_name_snake_case(


        self, validator: Draft202012Validator, minimal_spec: dict,


    ):
        minimal_spec["connection"]["params"][0]["name"] = "apiUrl"
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_spec_hash_must_be_64_hex_chars(


        self, validator: Draft202012Validator, minimal_spec: dict,


    ):
        minimal_spec["integrity"] = {
            "hash_method": "sha256-c14n-v1",
            "spec_hash": "tooshort",
        }
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)


# ---------------------------------------------------------------------------
# 6. Nested object validation
# ---------------------------------------------------------------------------


class TestNestedObjectValidation:
    """Complex nested structures are validated correctly."""

    def test_connection_params_min_items(


        self, validator: Draft202012Validator, minimal_spec: dict,


    ):
        """At least one connection param required."""
        minimal_spec["connection"]["params"] = []
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_auth_methods_min_items(self, validator: Draft202012Validator, minimal_spec: dict):
        """At least one auth method required."""
        minimal_spec["connection"]["auth_methods"] = []
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_context_fields_min_items(self, validator: Draft202012Validator, minimal_spec: dict):
        """At least one context field required."""
        minimal_spec["data_contract"]["context_fields"] = []
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_mappings_min_items(self, validator: Draft202012Validator, minimal_spec: dict):
        """At least one context mapping required."""
        minimal_spec["context_mapping"]["mappings"] = []
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_lifecycle_timeout_minimum(self, validator: Draft202012Validator, minimal_spec: dict):
        """Timeouts must be >= 1000ms."""
        minimal_spec["lifecycle"]["startup_timeout_ms"] = 500
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_lifecycle_timeout_maximum(self, validator: Draft202012Validator, minimal_spec: dict):
        """Startup timeout must be <= 300000ms."""
        minimal_spec["lifecycle"]["startup_timeout_ms"] = 999999
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_retry_max_retries_minimum(self, validator: Draft202012Validator, minimal_spec: dict):
        """max_retries must be >= 0."""
        minimal_spec["error_handling"]["retry_policy"]["max_retries"] = -1
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_retry_max_retries_maximum(self, validator: Draft202012Validator, minimal_spec: dict):
        """max_retries must be <= 20."""
        minimal_spec["error_handling"]["retry_policy"]["max_retries"] = 100
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_data_sources_valid(self, validator: Draft202012Validator, minimal_spec: dict):
        """Data sources must have correct structure."""
        minimal_spec["data_contract"]["data_sources"] = [
            {
                "source_type": "graphql_query",
                "endpoint": "/graphql",
                "description": "Primary API",
                "entities": ["Barrel"],
                "collection_mode": "poll",
            }
        ]
        validator.validate(minimal_spec)

    def test_data_sources_invalid_source_type(


        self, validator: Draft202012Validator, minimal_spec: dict,


    ):
        minimal_spec["data_contract"]["data_sources"] = [
            {
                "source_type": "telepathy",
                "description": "Magic",
                "entities": ["Unicorn"],
            }
        ]
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_enrichment_rules_valid(self, validator: Draft202012Validator, minimal_spec: dict):
        minimal_spec["context_mapping"]["enrichment_rules"] = [
            {
                "target_field": "shift",
                "rule_type": "timestamp_to_shift",
                "description": "Derive shift from event timestamp",
                "config": {"shift_schedule": "whk-standard"},
            }
        ]
        validator.validate(minimal_spec)

    def test_change_history_max_items(self, validator: Draft202012Validator, minimal_spec: dict):
        """Change history capped at 3 entries."""
        minimal_spec["integrity"] = {
            "hash_method": "sha256-c14n-v1",
            "spec_hash": "a" * 64,
            "change_history": [
                {
                    "previous_hash": "b" * 64,
                    "new_hash": "a" * 64,
                    "changed_at": "2026-04-06T12:00:00Z",
                    "source": "manual",
                },
                {
                    "previous_hash": "c" * 64,
                    "new_hash": "b" * 64,
                    "changed_at": "2026-04-05T12:00:00Z",
                    "source": "ci",
                },
                {
                    "previous_hash": "d" * 64,
                    "new_hash": "c" * 64,
                    "changed_at": "2026-04-04T12:00:00Z",
                    "source": "agent",
                },
                {
                    "previous_hash": "e" * 64,
                    "new_hash": "d" * 64,
                    "changed_at": "2026-04-03T12:00:00Z",
                    "source": "manual",
                },
            ],
        }
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)


# ---------------------------------------------------------------------------
# 7. Additional properties rejected
# ---------------------------------------------------------------------------


class TestAdditionalProperties:
    """No unknown fields allowed (additionalProperties: false)."""

    def test_unknown_top_level_field(self, validator: Draft202012Validator, minimal_spec: dict):
        minimal_spec["unknown_field"] = "surprise"
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_unknown_adapter_identity_field(


        self, validator: Draft202012Validator, minimal_spec: dict,


    ):
        minimal_spec["adapter_identity"]["vendor"] = "Acme Inc"
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_unknown_lifecycle_field(self, validator: Draft202012Validator, minimal_spec: dict):
        minimal_spec["lifecycle"]["magic_timeout_ms"] = 9999
        with pytest.raises(ValidationError):
            validator.validate(minimal_spec)

    def test_metadata_allows_additional_properties(


        self, validator: Draft202012Validator, minimal_spec: dict,


    ):
        """metadata is the exception — free-form is allowed."""
        minimal_spec["metadata"] = {"anything": "goes", "nested": {"deep": True}}
        validator.validate(minimal_spec)


# ---------------------------------------------------------------------------
# 8. Integrity block (FHTS Layer 1)
# ---------------------------------------------------------------------------


class TestIntegrityBlock:
    """FHTS governance fields in the integrity block."""

    def test_integrity_with_approved_state(


        self, validator: Draft202012Validator, minimal_spec: dict,


    ):
        minimal_spec["integrity"] = {
            "hash_method": "sha256-c14n-v1",
            "spec_hash": "a" * 64,
            "hash_state": "approved",
            "approved_by": "reh3376",
            "approved_at": "2026-04-06T12:00:00Z",
        }
        validator.validate(minimal_spec)

    def test_integrity_with_reverted_state(


        self, validator: Draft202012Validator, minimal_spec: dict,


    ):
        minimal_spec["integrity"] = {
            "hash_method": "sha256-c14n-v1",
            "spec_hash": "a" * 64,
            "hash_state": "reverted",
            "previous_hash": "b" * 64,
        }
        validator.validate(minimal_spec)

    def test_integrity_with_null_previous_hash(


        self, validator: Draft202012Validator, minimal_spec: dict,


    ):
        """previous_hash accepts null (initial spec has no previous)."""
        minimal_spec["integrity"] = {
            "hash_method": "sha256-c14n-v1",
            "spec_hash": "a" * 64,
            "previous_hash": None,
        }
        validator.validate(minimal_spec)

    def test_integrity_agent_change_history(


        self, validator: Draft202012Validator, minimal_spec: dict,


    ):
        """Agent-sourced change with full metadata."""
        minimal_spec["integrity"] = {
            "hash_method": "sha256-c14n-v1",
            "spec_hash": "a" * 64,
            "hash_state": "modified",
            "change_history": [
                {
                    "previous_hash": "b" * 64,
                    "new_hash": "a" * 64,
                    "changed_at": "2026-04-06T11:55:00Z",
                    "source": "agent",
                    "changed_by": "claude-opus-4-6",
                    "change_type": "content",
                    "reason": "Updated lifecycle timeouts per sprint plan S1.4",
                }
            ],
        }
        validator.validate(minimal_spec)

    def test_jcs_hash_method_accepted(self, validator: Draft202012Validator, minimal_spec: dict):
        """Legacy sha256-jcs alias is still accepted."""
        minimal_spec["integrity"] = {
            "hash_method": "sha256-jcs",
            "spec_hash": "a" * 64,
        }
        validator.validate(minimal_spec)
