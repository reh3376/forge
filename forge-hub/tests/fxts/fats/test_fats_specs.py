"""Tests that all FATS spec files validate against the FATS schema."""

from __future__ import annotations

import json
from pathlib import Path  # noqa: TC003 (pytest reads the annotation of a parametrized test)

import pytest

from forge_core import contract
from forge_core.fxts.fats.runners.fats_runner import FATSRunner
from forge_core.fxts.shared.runner import VerdictStatus
from forge_hub import fxts as hub_fxts

SPECS_DIR = hub_fxts.specs_dir("fats")  # the hub's own specs of its API
SCHEMA_PATH = contract.schema_path("fats")

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
    """Verify all 28 expected spec files exist (one per hub-served route, FB-001)."""

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
        "v1_registry_get_version.json",
        "v1_registry_diff.json",
        # F21 — Context Engine
        "v1_context_enrich.json",
        "v1_context_equipment_register.json",
        "v1_context_equipment_list.json",
        "v1_context_equipment_get.json",
        "v1_context_batches_active.json",
        "v1_context_modes_set.json",
        "v1_context_shifts_resolve.json",
        "v1_context_equipment_delete.json",
        "v1_context_equipment_children.json",
        "v1_context_batches_register.json",
        "v1_context_batches_complete.json",
        "v1_context_modes_get.json",
    ]

    def test_all_expected_specs_present(self):
        existing = {f.name for f in SPEC_FILES}
        for name in self.EXPECTED_SPECS:
            assert name in existing, f"Missing FATS spec: {name}"

    def test_spec_count(self):
        assert len(SPEC_FILES) >= 28


@pytest.mark.parametrize("spec_file", SPEC_FILES, ids=[f.stem for f in SPEC_FILES])
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
        assert errors == [], f"{spec_file.name} schema violations: " + "; ".join(
            e.message for e in errors
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


@pytest.mark.parametrize("path", sorted(SPECS_DIR.glob("*.json")), ids=lambda p: p.stem)
async def test_every_fats_spec_carries_a_hash_that_verifies(path: Path) -> None:
    """28 FATS specs had no hash before FB-160; the owner approved them on 2026-11-18."""
    spec = json.loads(path.read_text(encoding="utf-8"))
    integrity = spec["integrity"]
    assert integrity["spec_hash"] and integrity["hash_state"] == "approved"
    assert integrity["approved_by"] == "reh3376"
    runner = FATSRunner(schema_path=contract.schema_path("fats"))
    report = await runner.run(target=spec["endpoint"], spec=spec)
    statuses = {
        verdict.check_id: verdict.status
        for verdict in report.verdicts
        if verdict.check_id.startswith("fats:hash-")
    }
    assert statuses == {
        "fats:hash-verified": VerdictStatus.PASS,
        "fats:hash-approved": VerdictStatus.PASS,
    }
    assert report.hash_verified is True


def test_there_are_the_28_specs_of_the_api() -> None:
    assert len(SPEC_FILES) == 28
