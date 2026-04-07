"""Tests for the code generators — verifying generated Python source is correct.

Validates:
1. generate_config — produces valid Pydantic model code
2. generate_adapter — produces correct inheritance chain
3. generate_context — includes field extraction patterns
4. generate_record_builder — includes timestamp/quality/lineage assembly
5. generate_init — exports adapter class
6. generate_facts_spec — produces valid JSON
7. generate_tests — includes test classes for all interfaces
"""

from __future__ import annotations

import json

import pytest

from forge.sdk.module_builder.generators import (
    generate_adapter,
    generate_config,
    generate_context,
    generate_facts_spec,
    generate_init,
    generate_record_builder,
    generate_tests,
)
from forge.sdk.module_builder.manifest_builder import ManifestBuilder


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def basic_manifest() -> dict:
    """A basic read-only adapter manifest."""
    return (
        ManifestBuilder("test-basic")
        .name("Test Basic Adapter")
        .protocol("rest")
        .tier("MES_MOM")
        .connection_param("api_url", required=True, description="REST API URL")
        .connection_param("api_key", required=True, secret=True, description="API key")
        .connection_param("timeout_ms", required=False, default="5000", description="Timeout")
        .context_field("equipment_id")
        .context_field("batch_id")
        .build()
    )


@pytest.fixture()
def full_manifest() -> dict:
    """A fully-featured adapter manifest with all capabilities."""
    return (
        ManifestBuilder("whk-fancy")
        .name("WHK Fancy Adapter")
        .protocol("graphql+amqp+mqtt")
        .tier("MES_MOM")
        .capability("read", True)
        .capability("write", True)
        .capability("subscribe", True)
        .capability("backfill", True)
        .capability("discover", True)
        .connection_param("graphql_url", required=True, description="GraphQL endpoint")
        .connection_param("rabbitmq_url", required=True, description="AMQP URL")
        .connection_param("mqtt_host", required=True, description="MQTT host")
        .connection_param("mqtt_port", required=False, default="1883", description="MQTT port")
        .context_field("equipment_id")
        .context_field("batch_id")
        .context_field("lot_id")
        .context_field("shift")
        .context_field("operator_id")
        .context_field("event_type")
        .auth_method("azure_entra_id")
        .build()
    )


# ---------------------------------------------------------------------------
# Config Generator
# ---------------------------------------------------------------------------


class TestGenerateConfig:
    def test_produces_valid_python(self, basic_manifest):
        code = generate_config(basic_manifest)
        compile(code, "config.py", "exec")  # Syntax check

    def test_class_name_pascal_case(self, basic_manifest):
        code = generate_config(basic_manifest)
        assert "class TestBasicConfig(BaseModel):" in code

    def test_required_fields_no_default(self, basic_manifest):
        code = generate_config(basic_manifest)
        # api_url is required — should have ... as default
        assert "api_url: str = Field(" in code

    def test_optional_field_with_default(self, basic_manifest):
        code = generate_config(basic_manifest)
        assert "timeout_ms" in code

    def test_secret_field_present(self, basic_manifest):
        code = generate_config(basic_manifest)
        assert "api_key" in code

    def test_frozen_config(self, basic_manifest):
        code = generate_config(basic_manifest)
        assert "model_config = ConfigDict(frozen=True)" in code

    def test_empty_params(self):
        manifest = ManifestBuilder("test").build()
        manifest["connection_params"] = []
        code = generate_config(manifest)
        assert "pass" in code  # No fields, just pass


# ---------------------------------------------------------------------------
# Adapter Generator
# ---------------------------------------------------------------------------


class TestGenerateAdapter:
    def test_produces_valid_python(self, basic_manifest):
        code = generate_adapter(basic_manifest)
        compile(code, "adapter.py", "exec")

    def test_class_inherits_adapter_base(self, basic_manifest):
        code = generate_adapter(basic_manifest)
        assert "class TestBasicAdapter(" in code
        assert "AdapterBase" in code

    def test_no_optional_mixins_for_read_only(self, basic_manifest):
        code = generate_adapter(basic_manifest)
        assert "SubscriptionProvider" not in code
        assert "WritableAdapter" not in code
        assert "BackfillProvider" not in code
        assert "DiscoveryProvider" not in code

    def test_all_mixins_for_full_manifest(self, full_manifest):
        code = generate_adapter(full_manifest)
        assert "SubscriptionProvider" in code
        assert "WritableAdapter" in code
        assert "BackfillProvider" in code
        assert "DiscoveryProvider" in code

    def test_manifest_loading_boilerplate(self, basic_manifest):
        code = generate_adapter(basic_manifest)
        assert "_MANIFEST_PATH" in code
        assert "_load_manifest" in code
        assert "manifest.json" in code

    def test_lifecycle_methods_present(self, basic_manifest):
        code = generate_adapter(basic_manifest)
        for method in ("configure", "start", "stop", "health", "collect"):
            assert f"async def {method}" in code

    def test_inject_records_present(self, basic_manifest):
        code = generate_adapter(basic_manifest)
        assert "inject_records" in code

    def test_subscribe_stubs_for_capable(self, full_manifest):
        code = generate_adapter(full_manifest)
        assert "async def subscribe" in code
        assert "async def unsubscribe" in code

    def test_write_stub_for_capable(self, full_manifest):
        code = generate_adapter(full_manifest)
        assert "async def write" in code

    def test_backfill_stubs_for_capable(self, full_manifest):
        code = generate_adapter(full_manifest)
        assert "async def backfill" in code
        assert "async def get_earliest_timestamp" in code

    def test_discover_stub_for_capable(self, full_manifest):
        code = generate_adapter(full_manifest)
        assert "async def discover" in code


# ---------------------------------------------------------------------------
# Context Generator
# ---------------------------------------------------------------------------


class TestGenerateContext:
    def test_produces_valid_python(self, basic_manifest):
        code = generate_context(basic_manifest)
        compile(code, "context.py", "exec")

    def test_build_record_context_function(self, basic_manifest):
        code = generate_context(basic_manifest)
        assert "def build_record_context(" in code

    def test_context_fields_extracted(self, basic_manifest):
        code = generate_context(basic_manifest)
        assert "equipment_id" in code
        assert "batch_id" in code

    def test_returns_record_context(self, basic_manifest):
        code = generate_context(basic_manifest)
        assert "return RecordContext(" in code

    def test_camelcase_fallback(self, basic_manifest):
        """Should include camelCase variants for field extraction."""
        code = generate_context(basic_manifest)
        assert "equipmentId" in code or "batchId" in code


# ---------------------------------------------------------------------------
# Record Builder Generator
# ---------------------------------------------------------------------------


class TestGenerateRecordBuilder:
    def test_produces_valid_python(self, basic_manifest):
        code = generate_record_builder(basic_manifest)
        compile(code, "record_builder.py", "exec")

    def test_build_function_present(self, basic_manifest):
        code = generate_record_builder(basic_manifest)
        assert "def build_contextual_record(" in code

    def test_timestamp_extraction(self, basic_manifest):
        code = generate_record_builder(basic_manifest)
        assert "_extract_source_time" in code
        assert "_extract_server_time" in code

    def test_quality_assessment(self, basic_manifest):
        code = generate_record_builder(basic_manifest)
        assert "_assess_quality" in code
        assert "QualityCode.GOOD" in code
        assert "QualityCode.BAD" in code

    def test_schema_ref_from_manifest(self, basic_manifest):
        code = generate_record_builder(basic_manifest)
        assert "forge://schemas/test-basic/v0.1.0" in code

    def test_tag_path_derivation(self, basic_manifest):
        code = generate_record_builder(basic_manifest)
        assert "_derive_tag_path" in code


# ---------------------------------------------------------------------------
# Init Generator
# ---------------------------------------------------------------------------


class TestGenerateInit:
    def test_exports_adapter_class(self, basic_manifest):
        code = generate_init(basic_manifest)
        assert "TestBasicAdapter" in code
        assert "__all__" in code

    def test_import_from_adapter_module(self, basic_manifest):
        code = generate_init(basic_manifest)
        assert "from forge.adapters.test_basic.adapter import" in code


# ---------------------------------------------------------------------------
# FACTS Spec Generator
# ---------------------------------------------------------------------------


class TestGenerateFactsSpec:
    def test_produces_valid_json(self, basic_manifest):
        spec_str = generate_facts_spec(basic_manifest)
        spec = json.loads(spec_str)
        assert spec["adapter_identity"]["adapter_id"] == "test-basic"

    def test_capabilities_match(self, full_manifest):
        spec = json.loads(generate_facts_spec(full_manifest))
        assert spec["capabilities"]["write"] is True
        assert spec["capabilities"]["subscribe"] is True

    def test_lifecycle_transitions(self, basic_manifest):
        spec = json.loads(generate_facts_spec(basic_manifest))
        transitions = spec["lifecycle"]["state_transitions"]
        assert len(transitions) >= 5
        froms = [t["from"] for t in transitions]
        assert "REGISTERED" in froms
        assert "CONNECTING" in froms

    def test_connection_params_in_spec(self, basic_manifest):
        spec = json.loads(generate_facts_spec(basic_manifest))
        params = spec["connection_params"]
        assert len(params) == 3
        assert params[0]["name"] == "api_url"
        assert params[1]["secret"] is True  # api_key

    def test_integrity_block_present(self, basic_manifest):
        spec = json.loads(generate_facts_spec(basic_manifest))
        assert spec["integrity"]["hash_state"] == "draft"
        assert spec["integrity"]["spec_hash"] == ""


# ---------------------------------------------------------------------------
# Test Generator
# ---------------------------------------------------------------------------


class TestGenerateTests:
    def test_produces_valid_python(self, basic_manifest):
        code = generate_tests(basic_manifest)
        compile(code, "test_module.py", "exec")

    def test_manifest_test_class(self, basic_manifest):
        code = generate_tests(basic_manifest)
        assert "class TestTestBasicManifest:" in code

    def test_config_test_class(self, basic_manifest):
        code = generate_tests(basic_manifest)
        assert "class TestTestBasicConfig:" in code

    def test_lifecycle_test_class(self, basic_manifest):
        code = generate_tests(basic_manifest)
        assert "class TestTestBasicLifecycle:" in code
        assert "test_configure" in code
        assert "test_start_stop" in code
        assert "test_start_without_configure_raises" in code
        assert "test_health" in code

    def test_collection_test_class(self, basic_manifest):
        code = generate_tests(basic_manifest)
        assert "class TestTestBasicCollection:" in code
        assert "test_collect_empty" in code
        assert "test_collect_with_injected_records" in code

    def test_context_builder_test(self, basic_manifest):
        code = generate_tests(basic_manifest)
        assert "class TestTestBasicContextBuilder:" in code

    def test_record_builder_test(self, basic_manifest):
        code = generate_tests(basic_manifest)
        assert "class TestTestBasicRecordBuilder:" in code

    def test_config_dict_has_url_placeholder(self, basic_manifest):
        code = generate_tests(basic_manifest)
        assert "http://localhost:9999" in code
