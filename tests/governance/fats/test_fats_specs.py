"""Tests that all FATS spec files validate against the FATS schema."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

SPECS_DIR = Path("src/forge/governance/fats/specs")
SCHEMA_PATH = Path("src/forge/governance/fats/schema/fats.schema.json")

# Discover all spec files
SPEC_FILES = sorted(SPECS_DIR.glob("*.json"))
# Exclude __init__.py etc, only .json files
SPEC_FILES = [f for f in SPEC_FILES if f.name != "__init__.py"]


@pytest.fixture(scope="module")
def fats_schema() -> dict:
    """Load the FATS JSON schema."""
    return json.loads(SCHEMA_PATH.read_text())


@pytest.fixture(scope="module")
def validator(fats_schema):
    """Create a jsonschema validator for the FATS schema."""
    import jsonschema

    return jsonschema.Draft202012Validator(fats_schema)


class TestFatsSpecsExist:
    """Verify all 7 expected spec files exist."""

    EXPECTED_SPECS = [  # noqa: RUF012
        "healthz.json",
        "readyz.json",
        "v1_health.json",
        "v1_adapters_list.json",
        "v1_adapters_register.json",
        "v1_records_ingest.json",
        "v1_info.json",
        # F20 — Schema Registry
        "v1_registry_register.json",
        "v1_registry_list.json",
        "v1_registry_get.json",
        "v1_registry_delete.json",
        "v1_registry_add_version.json",
        "v1_registry_versions.json",
        "v1_registry_compatibility.json",
    ]

    def test_all_expected_specs_present(self):
        existing = {f.name for f in SPEC_FILES}
        for name in self.EXPECTED_SPECS:
            assert name in existing, f"Missing FATS spec: {name}"

    def test_spec_count(self):
        assert len(SPEC_FILES) >= 14


@pytest.mark.parametrize(
    "spec_file", SPEC_FILES, ids=[f.stem for f in SPEC_FILES]
)
class TestFatsSpecValidation:
    """Validate each spec file against the FATS JSON schema."""

    def test_valid_json(self, spec_file: Path):
        """Spec file must be valid JSON."""
        data = json.loads(spec_file.read_text())
        assert isinstance(data, dict)

    def test_validates_against_schema(self, spec_file: Path, validator):
        """Spec file must conform to fats.schema.json."""
        data = json.loads(spec_file.read_text())
        errors = list(validator.iter_errors(data))
        assert errors == [], (
            f"{spec_file.name} schema violations: "
            + "; ".join(e.message for e in errors)
        )

    def test_spec_version(self, spec_file: Path):
        """All specs must use version 0.1.0."""
        data = json.loads(spec_file.read_text())
        assert data["spec_version"] == "0.1.0"

    def test_endpoint_starts_with_slash(self, spec_file: Path):
        """Endpoint must start with /."""
        data = json.loads(spec_file.read_text())
        assert data["endpoint"].startswith("/")

    def test_has_error_format(self, spec_file: Path):
        """All responses must declare RFC 7807 error format."""
        data = json.loads(spec_file.read_text())
        assert data["response"]["error_format"]["type"] == "rfc7807"

    def test_has_rate_limit(self, spec_file: Path):
        """All specs must declare a rate limit."""
        data = json.loads(spec_file.read_text())
        assert "requests_per_minute" in data["rate_limit"]
