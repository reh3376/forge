"""FACTS conformance check applied at adapter registration."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from forge.core.models.adapter import AdapterManifest
from forge.ingest.facts_check import (
    DEFAULT_SPECS_DIR,
    check_manifest_against_facts,
    load_facts_spec,
)

MES_MANIFEST = Path(__file__).resolve().parents[2] / "src" / "forge" / "adapters"
MES_MANIFEST = MES_MANIFEST / "forge_mes" / "manifest.json"


@pytest.fixture()
def mes_manifest() -> AdapterManifest:
    return AdapterManifest.model_validate(json.loads(MES_MANIFEST.read_text()))


def test_load_spec_found_and_missing() -> None:
    spec, path = load_facts_spec("forge-mes")
    assert spec is not None and path is not None
    assert spec["adapter_identity"]["adapter_id"] == "forge-mes"
    assert load_facts_spec("no-such-adapter") == (None, None)
    assert DEFAULT_SPECS_DIR.is_dir()


def test_real_mes_manifest_conforms(mes_manifest: AdapterManifest) -> None:
    result = check_manifest_against_facts(mes_manifest)
    assert result.spec_found
    assert result.ok, result.problems
    assert result.spec_version == "0.1.0"
    # the approved spec hash verifies, so no integrity warning
    assert not any("integrity" in w for w in result.warnings), result.warnings
    assert "ok" in result.summary()


def test_capability_mismatch_is_a_problem(mes_manifest: AdapterManifest) -> None:
    tampered = mes_manifest.model_copy(deep=True)
    tampered.capabilities.write = False
    result = check_manifest_against_facts(tampered)
    assert not result.ok
    assert any("capabilities differ" in p and "write=False" in p for p in result.problems)
    assert "FACTS conformance failed" in result.summary()


def test_schema_ref_mismatch_is_a_problem(mes_manifest: AdapterManifest) -> None:
    tampered = mes_manifest.model_copy(deep=True)
    tampered.data_contract.schema_ref = "forge://schemas/forge-mes/v9.9.9"
    result = check_manifest_against_facts(tampered)
    assert not result.ok
    assert any("schema_ref" in p for p in result.problems)


def test_soft_differences_are_warnings(mes_manifest: AdapterManifest) -> None:
    changed = mes_manifest.model_copy(deep=True)
    changed.version = "0.2.0"
    changed.protocol = "grpc"
    changed.data_contract.context_fields = ["batch_id"]
    result = check_manifest_against_facts(changed)
    assert result.ok
    joined = " | ".join(result.warnings)
    assert "version" in joined and "protocol" in joined and "context_fields" in joined


def test_missing_spec_warns_unless_required(mes_manifest: AdapterManifest) -> None:
    unknown = mes_manifest.model_copy(deep=True)
    unknown.adapter_id = "mystery-spoke"
    lenient = check_manifest_against_facts(unknown)
    assert lenient.ok and not lenient.spec_found
    assert any("no FACTS spec" in w for w in lenient.warnings)
    strict = check_manifest_against_facts(unknown, require_spec=True)
    assert not strict.ok


def test_tampered_spec_file_fails_integrity(
    mes_manifest: AdapterManifest, tmp_path: Path
) -> None:
    spec, _ = load_facts_spec("forge-mes")
    assert spec is not None
    spec["capabilities"]["write"] = False  # edit without re-hashing
    (tmp_path / "forge-mes.facts.json").write_text(json.dumps(spec))
    result = check_manifest_against_facts(mes_manifest, specs_dir=tmp_path)
    assert not result.ok
    assert any("integrity" in p for p in result.problems)
    assert any("capabilities differ" in p for p in result.problems)
    assert result.to_dict()["spec_path"] == str(tmp_path / "forge-mes.facts.json")
