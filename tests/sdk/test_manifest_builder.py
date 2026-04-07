"""Tests for the ManifestBuilder — the fluent API for constructing adapter manifests.

Validates:
1. Basic manifest construction
2. Fluent chaining API
3. Validation rules (required fields, valid tiers, valid capabilities)
4. Connection param generation
5. JSON serialization and file writing
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pytest

from forge.sdk.module_builder.manifest_builder import ManifestBuilder


# ---------------------------------------------------------------------------
# Basic Construction
# ---------------------------------------------------------------------------


class TestManifestBuilderBasic:
    def test_minimal_manifest(self):
        """Minimal manifest: just adapter_id + read capability (default)."""
        manifest = ManifestBuilder("test-adapter").build()
        assert manifest["adapter_id"] == "test-adapter"
        assert manifest["capabilities"]["read"] is True
        assert manifest["version"] == "0.1.0"

    def test_adapter_id_stored(self):
        manifest = ManifestBuilder("whk-plc").build()
        assert manifest["adapter_id"] == "whk-plc"

    def test_default_tier_is_mes_mom(self):
        manifest = ManifestBuilder("test").build()
        assert manifest["tier"] == "MES_MOM"

    def test_default_protocol_is_rest(self):
        manifest = ManifestBuilder("test").build()
        assert manifest["protocol"] == "rest"

    def test_default_context_fields_populated(self):
        """If no context fields are added, defaults are applied."""
        manifest = ManifestBuilder("test").build()
        assert len(manifest["data_contract"]["context_fields"]) > 0

    def test_default_schema_ref(self):
        manifest = ManifestBuilder("acme-plc").build()
        assert manifest["data_contract"]["schema_ref"] == "forge://schemas/acme-plc/v0.1.0"


# ---------------------------------------------------------------------------
# Fluent API
# ---------------------------------------------------------------------------


class TestManifestBuilderFluent:
    def test_chaining(self):
        """Every setter returns self for chaining."""
        manifest = (
            ManifestBuilder("test")
            .name("Test Adapter")
            .version("1.0.0")
            .protocol("grpc")
            .tier("OT")
            .capability("subscribe", True)
            .connection_param("host", required=True, description="Server host")
            .context_field("equipment_id")
            .auth_method("api_key")
            .metadata("spoke", "test")
            .build()
        )
        assert manifest["name"] == "Test Adapter"
        assert manifest["version"] == "1.0.0"
        assert manifest["protocol"] == "grpc"
        assert manifest["tier"] == "OT"
        assert manifest["capabilities"]["subscribe"] is True
        assert len(manifest["connection_params"]) == 1
        assert "equipment_id" in manifest["data_contract"]["context_fields"]
        assert "api_key" in manifest["auth_methods"]
        assert manifest["metadata"]["spoke"] == "test"

    def test_version_updates_schema_ref(self):
        manifest = ManifestBuilder("test").version("2.0.0").build()
        assert manifest["data_contract"]["schema_ref"] == "forge://schemas/test/v2.0.0"

    def test_schema_ref_override(self):
        manifest = (
            ManifestBuilder("test")
            .schema_ref("forge://custom/schema")
            .build()
        )
        assert manifest["data_contract"]["schema_ref"] == "forge://custom/schema"


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


class TestManifestBuilderValidation:
    def test_invalid_adapter_id_raises(self):
        with pytest.raises(ValueError, match="Invalid adapter_id"):
            ManifestBuilder("")

    def test_invalid_adapter_id_special_chars(self):
        with pytest.raises(ValueError, match="Invalid adapter_id"):
            ManifestBuilder("test@adapter")

    def test_invalid_tier_raises(self):
        with pytest.raises(ValueError, match="Invalid tier"):
            ManifestBuilder("test").tier("INVALID")

    def test_invalid_capability_raises(self):
        with pytest.raises(ValueError, match="Invalid capability"):
            ManifestBuilder("test").capability("fly")

    def test_valid_tiers(self):
        for tier in ("OT", "MES_MOM", "ERP_BUSINESS", "HISTORIAN", "DOCUMENT"):
            manifest = ManifestBuilder("test").tier(tier).build()
            assert manifest["tier"] == tier

    def test_valid_capabilities(self):
        for cap in ("read", "write", "subscribe", "backfill", "discover"):
            manifest = ManifestBuilder("test").capability(cap, True).build()
            assert manifest["capabilities"][cap] is True

    def test_hyphenated_id_valid(self):
        manifest = ManifestBuilder("whk-wms-v2").build()
        assert manifest["adapter_id"] == "whk-wms-v2"

    def test_underscored_id_valid(self):
        manifest = ManifestBuilder("acme_plc").build()
        assert manifest["adapter_id"] == "acme_plc"


# ---------------------------------------------------------------------------
# Connection Params
# ---------------------------------------------------------------------------


class TestManifestBuilderParams:
    def test_required_param(self):
        manifest = (
            ManifestBuilder("test")
            .connection_param("host", required=True, description="Server host")
            .build()
        )
        params = manifest["connection_params"]
        assert len(params) == 1
        assert params[0]["name"] == "host"
        assert params[0]["required"] is True
        assert params[0]["secret"] is False

    def test_optional_param_with_default(self):
        manifest = (
            ManifestBuilder("test")
            .connection_param("port", required=False, default="8080", description="Port")
            .build()
        )
        params = manifest["connection_params"]
        assert params[0]["required"] is False
        assert params[0]["default"] == "8080"

    def test_secret_param(self):
        manifest = (
            ManifestBuilder("test")
            .connection_param("api_key", secret=True, description="API key")
            .build()
        )
        assert manifest["connection_params"][0]["secret"] is True

    def test_multiple_params(self):
        manifest = (
            ManifestBuilder("test")
            .connection_param("host", required=True)
            .connection_param("port", required=False, default="443")
            .connection_param("token", required=True, secret=True)
            .build()
        )
        assert len(manifest["connection_params"]) == 3

    def test_auth_method_replaces_none(self):
        manifest = ManifestBuilder("test").auth_method("bearer_token").build()
        assert "none" not in manifest["auth_methods"]
        assert "bearer_token" in manifest["auth_methods"]

    def test_no_duplicate_auth(self):
        manifest = (
            ManifestBuilder("test")
            .auth_method("api_key")
            .auth_method("api_key")
            .build()
        )
        assert manifest["auth_methods"].count("api_key") == 1

    def test_no_duplicate_context_field(self):
        manifest = (
            ManifestBuilder("test")
            .context_field("equipment_id")
            .context_field("equipment_id")
            .build()
        )
        assert manifest["data_contract"]["context_fields"].count("equipment_id") == 1


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------


class TestManifestBuilderSerialization:
    def test_build_json(self):
        builder = ManifestBuilder("test")
        json_str = builder.build_json()
        parsed = json.loads(json_str)
        assert parsed["adapter_id"] == "test"

    def test_write_to_file(self):
        builder = ManifestBuilder("test").name("Test Adapter")
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "manifest.json"
            result = builder.write(path)
            assert result == path
            assert path.exists()
            parsed = json.loads(path.read_text())
            assert parsed["name"] == "Test Adapter"
