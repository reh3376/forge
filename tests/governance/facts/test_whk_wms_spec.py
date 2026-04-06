"""Tests for the whk-wms FACTS spec — validates the first Forge spoke adapter spec.

These tests verify that whk-wms.facts.json:
1. Conforms to facts.schema.json
2. Has a valid and reproducible integrity hash
3. Has complete context field coverage (no orphans, no unmapped)
4. Contains all expected WMS-specific data sources
5. Correctly frames WMS as a Forge spoke (INGESTION, read-only)
"""

import hashlib
import json
import re
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

_base = Path(__file__).resolve().parents[3]
SCHEMA_PATH = _base / "src" / "forge" / "governance" / "facts" / "schema" / "facts.schema.json"
SPEC_PATH = _base / "src" / "forge" / "governance" / "facts" / "specs" / "whk-wms.facts.json"


@pytest.fixture(scope="module")
def schema():
    with open(SCHEMA_PATH) as f:
        return json.load(f)


@pytest.fixture(scope="module")
def spec():
    with open(SPEC_PATH) as f:
        return json.load(f)


@pytest.fixture(scope="module")
def validator(schema):
    from jsonschema import Draft202012Validator
    return Draft202012Validator(schema)


# ---------------------------------------------------------------------------
# Schema Conformance
# ---------------------------------------------------------------------------

class TestSchemaConformance:
    """Spec validates against facts.schema.json."""

    def test_spec_validates_against_schema(self, validator, spec):
        errors = list(validator.iter_errors(spec))
        assert errors == [], f"Validation errors: {[e.message for e in errors]}"

    def test_spec_version_matches(self, spec):
        assert spec["spec_version"] == "0.1.0"

    def test_all_required_sections_present(self, spec):
        required = ["spec_version", "adapter_identity", "capabilities", "lifecycle",
                     "connection", "data_contract", "context_mapping", "error_handling"]
        for section in required:
            assert section in spec, f"Missing required section: {section}"


# ---------------------------------------------------------------------------
# Adapter Identity
# ---------------------------------------------------------------------------

class TestAdapterIdentity:
    """WMS adapter correctly identifies as a Forge spoke adapter."""

    def test_adapter_id(self, spec):
        assert spec["adapter_identity"]["adapter_id"] == "whk-wms"

    def test_adapter_id_is_kebab_case(self, spec):
        aid = spec["adapter_identity"]["adapter_id"]
        assert re.match(r"^[a-z][a-z0-9-]*$", aid)
        assert 3 <= len(aid) <= 64

    def test_type_is_ingestion(self, spec):
        """WMS spoke feeds data INTO the Forge hub — it's ingestion, not bidirectional."""
        assert spec["adapter_identity"]["type"] == "INGESTION"

    def test_tier_is_mes_mom(self, spec):
        """WMS operates at the MES/MOM tier in ISA-95."""
        assert spec["adapter_identity"]["tier"] == "MES_MOM"

    def test_protocol_includes_graphql_and_amqp(self, spec):
        protocol = spec["adapter_identity"]["protocol"]
        assert "graphql" in protocol
        assert "amqp" in protocol

    def test_version_is_semver(self, spec):
        assert re.match(r"^\d+\.\d+\.\d+", spec["adapter_identity"]["version"])


# ---------------------------------------------------------------------------
# Capabilities
# ---------------------------------------------------------------------------

class TestCapabilities:
    """WMS adapter capabilities match the spoke's data patterns."""

    def test_read_is_true(self, spec):
        assert spec["capabilities"]["read"] is True

    def test_write_is_false(self, spec):
        """Forge ingests from the WMS spoke — it doesn't write back (yet)."""
        assert spec["capabilities"]["write"] is False

    def test_subscribe_is_true(self, spec):
        """WMS has RabbitMQ exchanges and GraphQL subscriptions."""
        assert spec["capabilities"]["subscribe"] is True

    def test_backfill_is_true(self, spec):
        """WMS GraphQL API supports historical queries for backfill."""
        assert spec["capabilities"]["backfill"] is True

    def test_discover_is_true(self, spec):
        """WMS GraphQL introspection enables tag/entity discovery."""
        assert spec["capabilities"]["discover"] is True


# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------

class TestConnection:
    """Connection params cover all WMS system interfaces."""

    def test_has_graphql_url(self, spec):
        names = [p["name"] for p in spec["connection"]["params"]]
        assert "graphql_url" in names

    def test_has_rabbitmq_url(self, spec):
        names = [p["name"] for p in spec["connection"]["params"]]
        assert "rabbitmq_url" in names

    def test_has_azure_credentials(self, spec):
        names = [p["name"] for p in spec["connection"]["params"]]
        assert "azure_tenant_id" in names
        assert "azure_client_id" in names
        assert "azure_client_secret" in names

    def test_secrets_are_flagged(self, spec):
        """Params with sensitive data must be marked secret=true."""
        for param in spec["connection"]["params"]:
            if param["name"] in ("azure_client_secret", "api_key"):
                assert param.get("secret") is True, f"{param['name']} should be secret"

    def test_auth_methods_include_azure_entra(self, spec):
        assert "azure_entra_id" in spec["connection"]["auth_methods"]

    def test_auth_methods_include_bearer(self, spec):
        assert "bearer_token" in spec["connection"]["auth_methods"]

    def test_all_param_names_are_snake_case(self, spec):
        for param in spec["connection"]["params"]:
            assert re.match(r"^[a-z][a-z0-9_]*$", param["name"]), \
                f"Param name not snake_case: {param['name']}"


# ---------------------------------------------------------------------------
# Data Contract
# ---------------------------------------------------------------------------

class TestDataContract:
    """Data contract covers the WMS spoke's complete data surface."""

    def test_output_format_is_contextual_record(self, spec):
        assert spec["data_contract"]["output_format"] == "contextual_record"

    def test_has_minimum_required_context_fields(self, spec):
        cf = spec["data_contract"]["context_fields"]
        assert len(cf) >= 4, "Need at least 4 required context fields"
        assert "manufacturing_unit_id" in cf, "Barrel = manufacturing unit"
        assert "lot_id" in cf, "Lot traceability is core"
        assert "event_timestamp" in cf
        assert "event_type" in cf

    def test_has_graphql_data_sources(self, spec):
        types = [ds["source_type"] for ds in spec["data_contract"]["data_sources"]]
        assert "graphql_query" in types

    def test_has_rabbitmq_data_sources(self, spec):
        types = [ds["source_type"] for ds in spec["data_contract"]["data_sources"]]
        assert "rabbitmq" in types

    def test_has_graphql_subscription_source(self, spec):
        types = [ds["source_type"] for ds in spec["data_contract"]["data_sources"]]
        assert "graphql_subscription" in types

    def test_data_sources_have_entities(self, spec):
        for ds in spec["data_contract"]["data_sources"]:
            msg = f"Data source {ds.get('endpoint', '?')} has no entities"
            assert len(ds["entities"]) >= 1, msg

    def test_sample_record_has_required_context(self, spec):
        sample = spec["data_contract"]["sample_record"]
        assert "context" in sample
        for field in spec["data_contract"]["context_fields"]:
            assert field in sample["context"], f"Sample missing context field: {field}"

    def test_barrel_entity_in_data_sources(self, spec):
        """Barrel is the core WMS entity — must appear in data sources."""
        all_entities = []
        for ds in spec["data_contract"]["data_sources"]:
            all_entities.extend(ds["entities"])
        assert "Barrel" in all_entities

    def test_at_least_10_data_sources(self, spec):
        """WMS has GraphQL, RabbitMQ, subscriptions, REST — should have many sources."""
        assert len(spec["data_contract"]["data_sources"]) >= 10


# ---------------------------------------------------------------------------
# Context Mapping
# ---------------------------------------------------------------------------

class TestContextMapping:
    """Context mappings cover all declared fields with no orphans."""

    def test_all_required_context_fields_have_mappings(self, spec):
        required = set(spec["data_contract"]["context_fields"])
        mapped = set(m["context_field"] for m in spec["context_mapping"]["mappings"])
        enriched = set(
            r["target_field"]
            for r in spec["context_mapping"].get("enrichment_rules", [])
        )
        unmapped = required - (mapped | enriched)
        assert unmapped == set(), f"Unmapped required context fields: {unmapped}"

    def test_no_orphan_mappings(self, spec):
        all_fields = set(spec["data_contract"]["context_fields"]) | \
                     set(spec["data_contract"].get("optional_context_fields", []))
        mapped = set(m["context_field"] for m in spec["context_mapping"]["mappings"])
        orphans = mapped - all_fields
        assert orphans == set(), f"Orphan mappings (target undeclared fields): {orphans}"

    def test_manufacturing_unit_maps_to_barrel(self, spec):
        for m in spec["context_mapping"]["mappings"]:
            if m["context_field"] == "manufacturing_unit_id":
                assert "barrel" in m["source_field"].lower()
                return
        pytest.fail("No mapping for manufacturing_unit_id")

    def test_has_enrichment_rules(self, spec):
        rules = spec["context_mapping"].get("enrichment_rules", [])
        assert len(rules) >= 1, "WMS should have at least one enrichment rule"

    def test_shift_enrichment_exists(self, spec):
        """Shift derivation from timestamp is a key Forge hub enrichment."""
        rules = spec["context_mapping"].get("enrichment_rules", [])
        shift_rules = [r for r in rules if r["target_field"] == "shift_id"]
        assert len(shift_rules) == 1
        assert shift_rules[0]["rule_type"] == "timestamp_to_shift"


# ---------------------------------------------------------------------------
# Error Handling
# ---------------------------------------------------------------------------

class TestErrorHandling:
    """Error handling meets Forge adapter requirements."""

    def test_retry_policy_configured(self, spec):
        rp = spec["error_handling"]["retry_policy"]
        assert rp["max_retries"] >= 1
        assert rp["initial_delay_ms"] >= 100
        assert rp["backoff_strategy"] in ("constant", "linear", "exponential")

    def test_circuit_breaker_configured(self, spec):
        cb = spec["error_handling"]["circuit_breaker"]
        assert cb["failure_threshold"] >= 1
        assert cb["half_open_after_ms"] >= 1000

    def test_dead_letter_enabled(self, spec):
        dl = spec["error_handling"]["dead_letter"]
        assert dl["enabled"] is True
        assert "whk-wms" in dl["topic"]

    def test_health_degradation_configured(self, spec):
        hd = spec["error_handling"]["health_degradation"]
        assert hd["degraded_after_failures"] < hd["failed_after_failures"]


# ---------------------------------------------------------------------------
# Integrity (FHTS)
# ---------------------------------------------------------------------------

class TestIntegrity:
    """FHTS hash governance is correctly applied."""

    def test_hash_present(self, spec):
        assert spec["integrity"]["spec_hash"] is not None
        assert len(spec["integrity"]["spec_hash"]) == 64

    def test_hash_is_reproducible(self, spec):
        spec_for_hash = {k: v for k, v in spec.items() if k != "integrity"}
        canonical = json.dumps(spec_for_hash, sort_keys=True, separators=(",", ":"))
        computed = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        assert computed == spec["integrity"]["spec_hash"]

    def test_hash_state_is_approved(self, spec):
        assert spec["integrity"]["hash_state"] == "approved"

    def test_approved_by_is_set(self, spec):
        assert spec["integrity"]["approved_by"] is not None
        assert len(spec["integrity"]["approved_by"]) > 0

    def test_change_history_has_initial_entry(self, spec):
        ch = spec["integrity"]["change_history"]
        assert len(ch) >= 1
        assert ch[0]["source"] == "manual"
        assert ch[0]["change_type"] == "structural"

    def test_hash_method_is_normative(self, spec):
        assert spec["integrity"]["hash_method"] == "sha256-c14n-v1"


# ---------------------------------------------------------------------------
# Metadata (Forge topology)
# ---------------------------------------------------------------------------

class TestMetadata:
    """Metadata correctly identifies WMS as a Forge spoke."""

    def test_spoke_field(self, spec):
        assert spec["metadata"]["spoke"] == "wms"

    def test_hub_module_field(self, spec):
        assert spec["metadata"]["hub_module"] == "forge-adapters"

    def test_notes_mention_read_only(self, spec):
        assert "read-only" in spec["metadata"]["notes"].lower() or \
               "Read-only" in spec["metadata"]["notes"]
