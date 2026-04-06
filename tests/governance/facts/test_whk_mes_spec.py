"""Tests for the whk-mes FACTS spec — validates the second Forge spoke adapter spec.

These tests verify that whk-mes.facts.json:
1. Conforms to facts.schema.json
2. Has a valid and reproducible integrity hash
3. Has complete context field coverage (no orphans, no unmapped)
4. Contains all expected MES-specific data sources (GraphQL, RabbitMQ, MQTT, WebSocket)
5. Correctly frames MES as a Forge spoke with write capability
6. Cross-references with WMS spec for shared field consistency
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
MES_SPEC_PATH = _base / "src" / "forge" / "governance" / "facts" / "specs" / "whk-mes.facts.json"
WMS_SPEC_PATH = _base / "src" / "forge" / "governance" / "facts" / "specs" / "whk-wms.facts.json"


@pytest.fixture(scope="module")
def schema():
    with open(SCHEMA_PATH) as f:
        return json.load(f)


@pytest.fixture(scope="module")
def spec():
    with open(MES_SPEC_PATH) as f:
        return json.load(f)


@pytest.fixture(scope="module")
def wms_spec():
    with open(WMS_SPEC_PATH) as f:
        return json.load(f)


@pytest.fixture(scope="module")
def validator(schema):
    from jsonschema import Draft202012Validator
    return Draft202012Validator(schema)


# ---------------------------------------------------------------------------
# Schema Conformance
# ---------------------------------------------------------------------------

class TestSchemaConformance:
    """MES spec validates against facts.schema.json."""

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
    """MES adapter correctly identifies as a Forge spoke adapter."""

    def test_adapter_id(self, spec):
        assert spec["adapter_identity"]["adapter_id"] == "whk-mes"

    def test_adapter_id_is_kebab_case(self, spec):
        aid = spec["adapter_identity"]["adapter_id"]
        assert re.match(r"^[a-z][a-z0-9-]*$", aid)
        assert 3 <= len(aid) <= 64

    def test_type_is_ingestion(self, spec):
        assert spec["adapter_identity"]["type"] == "INGESTION"

    def test_tier_is_mes_mom(self, spec):
        assert spec["adapter_identity"]["tier"] == "MES_MOM"

    def test_protocol_includes_graphql_amqp_mqtt(self, spec):
        protocol = spec["adapter_identity"]["protocol"]
        assert "graphql" in protocol
        assert "amqp" in protocol
        assert "mqtt" in protocol

    def test_version_is_semver(self, spec):
        assert re.match(r"^\d+\.\d+\.\d+", spec["adapter_identity"]["version"])


# ---------------------------------------------------------------------------
# Capabilities
# ---------------------------------------------------------------------------

class TestCapabilities:
    """MES adapter capabilities include write (unlike WMS)."""

    def test_read_is_true(self, spec):
        assert spec["capabilities"]["read"] is True

    def test_write_is_true(self, spec):
        """MES has write: true — Forge may push decisions back into production order lifecycle."""
        assert spec["capabilities"]["write"] is True

    def test_subscribe_is_true(self, spec):
        assert spec["capabilities"]["subscribe"] is True

    def test_backfill_is_true(self, spec):
        assert spec["capabilities"]["backfill"] is True

    def test_discover_is_true(self, spec):
        assert spec["capabilities"]["discover"] is True


# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------

class TestConnection:
    """Connection params cover GraphQL, RabbitMQ, MQTT, and Azure auth."""

    def test_has_graphql_url(self, spec):
        names = [p["name"] for p in spec["connection"]["params"]]
        assert "graphql_url" in names

    def test_has_rabbitmq_url(self, spec):
        names = [p["name"] for p in spec["connection"]["params"]]
        assert "rabbitmq_url" in names

    def test_has_mqtt_host(self, spec):
        names = [p["name"] for p in spec["connection"]["params"]]
        assert "mqtt_host" in names

    def test_has_mqtt_port(self, spec):
        names = [p["name"] for p in spec["connection"]["params"]]
        assert "mqtt_port" in names

    def test_has_mqtt_certificates(self, spec):
        """MQTT mTLS requires CA cert, client cert, and client key."""
        names = [p["name"] for p in spec["connection"]["params"]]
        assert "mqtt_ca_cert" in names
        assert "mqtt_client_cert" in names
        assert "mqtt_client_key" in names

    def test_has_mqtt_username_password(self, spec):
        names = [p["name"] for p in spec["connection"]["params"]]
        assert "mqtt_username" in names
        assert "mqtt_password" in names

    def test_has_azure_credentials(self, spec):
        names = [p["name"] for p in spec["connection"]["params"]]
        assert "azure_tenant_id" in names
        assert "azure_client_id" in names
        assert "azure_client_secret" in names

    def test_has_mqtt_buffer_config(self, spec):
        """MES-specific: MQTT message buffering during reconnection."""
        names = [p["name"] for p in spec["connection"]["params"]]
        assert "mqtt_buffer_max_seconds" in names

    def test_secrets_are_flagged(self, spec):
        secret_params = {"azure_client_secret", "mqtt_username", "mqtt_password",
                         "mqtt_ca_cert", "mqtt_client_cert", "mqtt_client_key"}
        for param in spec["connection"]["params"]:
            if param["name"] in secret_params:
                assert param.get("secret") is True, f"{param['name']} should be secret"

    def test_auth_methods_include_certificate(self, spec):
        """MES uses certificate auth for MQTT (not present in WMS)."""
        assert "certificate" in spec["connection"]["auth_methods"]

    def test_auth_methods_include_azure_entra(self, spec):
        assert "azure_entra_id" in spec["connection"]["auth_methods"]

    def test_all_param_names_are_snake_case(self, spec):
        for param in spec["connection"]["params"]:
            assert re.match(r"^[a-z][a-z0-9_]*$", param["name"]), \
                f"Param name not snake_case: {param['name']}"


# ---------------------------------------------------------------------------
# Data Contract
# ---------------------------------------------------------------------------

class TestDataContract:
    """Data contract covers the MES spoke's complete data surface including MQTT."""

    def test_output_format_is_contextual_record(self, spec):
        assert spec["data_contract"]["output_format"] == "contextual_record"

    def test_has_production_context_fields(self, spec):
        cf = spec["data_contract"]["context_fields"]
        assert "production_order_id" in cf
        assert "batch_id" in cf
        assert "recipe_id" in cf
        assert "equipment_id" in cf

    def test_has_graphql_data_sources(self, spec):
        types = [ds["source_type"] for ds in spec["data_contract"]["data_sources"]]
        assert "graphql_query" in types

    def test_has_graphql_mutation_data_source(self, spec):
        """MES has write capability — must declare mutation data sources."""
        types = [ds["source_type"] for ds in spec["data_contract"]["data_sources"]]
        assert "graphql_mutation" in types

    def test_has_rabbitmq_data_sources(self, spec):
        types = [ds["source_type"] for ds in spec["data_contract"]["data_sources"]]
        assert "rabbitmq" in types

    def test_has_mqtt_data_sources(self, spec):
        """MES-specific: MQTT equipment integration not present in WMS."""
        types = [ds["source_type"] for ds in spec["data_contract"]["data_sources"]]
        assert "mqtt" in types

    def test_has_websocket_data_source(self, spec):
        types = [ds["source_type"] for ds in spec["data_contract"]["data_sources"]]
        assert "websocket" in types

    def test_data_sources_have_entities(self, spec):
        for ds in spec["data_contract"]["data_sources"]:
            msg = f"Data source {ds.get('endpoint', '?')} has no entities"
            assert len(ds["entities"]) >= 1, msg

    def test_sample_record_has_required_context(self, spec):
        sample = spec["data_contract"]["sample_record"]
        assert "context" in sample
        for field in spec["data_contract"]["context_fields"]:
            assert field in sample["context"], f"Sample missing context field: {field}"

    def test_batch_entity_in_data_sources(self, spec):
        """Batch is the core MES entity (like Barrel is for WMS)."""
        all_entities = []
        for ds in spec["data_contract"]["data_sources"]:
            all_entities.extend(ds["entities"])
        assert "Batch" in all_entities

    def test_at_least_14_data_sources(self, spec):
        """MES has GraphQL, RabbitMQ, MQTT, WebSocket, REST — more diverse than WMS."""
        assert len(spec["data_contract"]["data_sources"]) >= 14


# ---------------------------------------------------------------------------
# Context Mapping
# ---------------------------------------------------------------------------

class TestContextMapping:
    """Context mappings cover all declared fields."""

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
        assert orphans == set(), f"Orphan mappings: {orphans}"

    def test_production_order_mapping(self, spec):
        for m in spec["context_mapping"]["mappings"]:
            if m["context_field"] == "production_order_id":
                assert "productionOrder" in m["source_field"]
                return
        pytest.fail("No mapping for production_order_id")

    def test_has_enrichment_rules(self, spec):
        rules = spec["context_mapping"].get("enrichment_rules", [])
        assert len(rules) >= 1

    def test_shift_enrichment_exists(self, spec):
        rules = spec["context_mapping"].get("enrichment_rules", [])
        shift_rules = [r for r in rules if r["target_field"] == "shift_id"]
        assert len(shift_rules) == 1
        assert shift_rules[0]["rule_type"] == "timestamp_to_shift"

    def test_mqtt_topic_enrichment_exists(self, spec):
        """MES-specific: equipment_id extraction from MQTT topic path."""
        rules = spec["context_mapping"].get("enrichment_rules", [])
        mqtt_rules = [r for r in rules if "mqtt" in str(r.get("config", {})).lower()]
        assert len(mqtt_rules) >= 1


# ---------------------------------------------------------------------------
# Error Handling
# ---------------------------------------------------------------------------

class TestErrorHandling:
    """Error handling meets Forge adapter requirements."""

    def test_retry_policy_configured(self, spec):
        rp = spec["error_handling"]["retry_policy"]
        assert rp["max_retries"] >= 1
        assert rp["backoff_strategy"] == "exponential"

    def test_circuit_breaker_configured(self, spec):
        cb = spec["error_handling"]["circuit_breaker"]
        assert cb["failure_threshold"] >= 1
        assert cb["half_open_after_ms"] >= 1000

    def test_dead_letter_enabled(self, spec):
        dl = spec["error_handling"]["dead_letter"]
        assert dl["enabled"] is True
        assert "whk-mes" in dl["topic"]

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

    def test_change_history_has_initial_entry(self, spec):
        ch = spec["integrity"]["change_history"]
        assert len(ch) >= 1
        assert ch[0]["source"] == "manual"

    def test_hash_method_is_normative(self, spec):
        assert spec["integrity"]["hash_method"] == "sha256-c14n-v1"


# ---------------------------------------------------------------------------
# Cross-Reference with WMS Spec
# ---------------------------------------------------------------------------

class TestCrossReference:
    """Shared fields between WMS and MES specs are consistent."""

    def test_spec_version_match(self, spec, wms_spec):
        assert spec["spec_version"] == wms_spec["spec_version"]

    def test_shared_context_fields_use_identical_names(self, spec, wms_spec):
        """Fields that appear in both specs must use the same name."""
        mes_fields = set(spec["data_contract"]["context_fields"]) | \
                     set(spec["data_contract"].get("optional_context_fields", []))
        wms_fields = set(wms_spec["data_contract"]["context_fields"]) | \
                     set(wms_spec["data_contract"].get("optional_context_fields", []))
        shared = mes_fields & wms_fields
        # Must have at least these shared fields for cross-spoke traceability
        assert "lot_id" in shared, "lot_id must be shared for cross-spoke traceability"
        assert "event_timestamp" in shared
        assert "event_type" in shared
        assert "shift_id" in shared
        assert "operator_id" in shared

    def test_shift_definitions_match(self, spec, wms_spec):
        """Shift enrichment must use same definitions for cross-spoke consistency."""
        mes_shift = next(
            r for r in spec["context_mapping"].get("enrichment_rules", [])
            if r["target_field"] == "shift_id"
        )
        wms_shift = next(
            r for r in wms_spec["context_mapping"].get("enrichment_rules", [])
            if r["target_field"] == "shift_id"
        )
        assert mes_shift["config"]["timezone"] == wms_shift["config"]["timezone"]
        assert mes_shift["config"]["shift_definitions"] == wms_shift["config"]["shift_definitions"]

    def test_isa95_tier_match(self, spec, wms_spec):
        assert spec["adapter_identity"]["tier"] == wms_spec["adapter_identity"]["tier"]

    def test_retry_strategy_match(self, spec, wms_spec):
        mes_strat = spec["error_handling"]["retry_policy"]["backoff_strategy"]
        wms_strat = wms_spec["error_handling"]["retry_policy"]["backoff_strategy"]
        assert mes_strat == wms_strat

    def test_both_have_approved_hashes(self, spec, wms_spec):
        assert spec["integrity"]["hash_state"] == "approved"
        assert wms_spec["integrity"]["hash_state"] == "approved"

    def test_shared_rabbitmq_exchange_topology(self, spec, wms_spec):
        """Both spokes use wh.whk01.distillery01.* exchange pattern."""
        mes_rmq = [ds["endpoint"] for ds in spec["data_contract"]["data_sources"]
                   if ds["source_type"] == "rabbitmq"]
        wms_rmq = [ds["endpoint"] for ds in wms_spec["data_contract"]["data_sources"]
                   if ds["source_type"] == "rabbitmq"]
        assert "wh.whk01.distillery01.*" in mes_rmq
        assert "wh.whk01.distillery01.*" in wms_rmq


# ---------------------------------------------------------------------------
# Metadata
# ---------------------------------------------------------------------------

class TestMetadata:
    """Metadata correctly identifies MES as a Forge spoke."""

    def test_spoke_field(self, spec):
        assert spec["metadata"]["spoke"] == "mes"

    def test_hub_module_field(self, spec):
        assert spec["metadata"]["hub_module"] == "forge-adapters"

    def test_cross_spoke_fields_documented(self, spec):
        csf = spec["metadata"].get("cross_spoke_fields", [])
        assert "lot_id" in csf
        assert "shift_id" in csf

    def test_mqtt_features_documented(self, spec):
        assert "multi-broker" in spec["metadata"].get("mqtt_features", "").lower() or \
               "Multi-broker" in spec["metadata"].get("mqtt_features", "")
