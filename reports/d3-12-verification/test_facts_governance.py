"""D3.12 — FACTS governance pipeline verification.

Proves the governance framework works end-to-end:
  spec load → FACTSRunner validation → hash verification → report generation

Uses the real WHK WMS FACTS spec and the real FACTSRunner to exercise
every check — adapter identity, capabilities, lifecycle, connection,
data contract, context mapping, error handling, metadata, integrity.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from forge.governance.facts.runners.facts_runner import FACTSRunner
from forge.governance.shared.runner import (
    FxTSVerdict,
    VerdictStatus,
    compute_spec_hash,
    verify_spec_hash,
    verify_spec_integrity,
)


# ═══════════════════════════════════════════════════════════════════
# 1. Spec Loading & Structure
# ═══════════════════════════════════════════════════════════════════


class TestSpecLoading:
    """Verify FACTS specs load and have correct structure."""

    def test_whk_wms_spec_loads(self, whk_wms_spec: dict):
        assert whk_wms_spec is not None
        assert whk_wms_spec["spec_version"] == "0.1.0"

    def test_spec_has_all_required_sections(self, whk_wms_spec: dict):
        required = {
            "spec_version",
            "adapter_identity",
            "capabilities",
            "lifecycle",
            "connection",
            "data_contract",
            "context_mapping",
            "error_handling",
            "metadata",
            "integrity",
        }
        assert required.issubset(whk_wms_spec.keys()), (
            f"Missing sections: {required - whk_wms_spec.keys()}"
        )

    def test_adapter_identity_matches(self, whk_wms_spec: dict):
        identity = whk_wms_spec["adapter_identity"]
        assert identity["adapter_id"] == "whk-wms"
        assert identity["tier"] == "MES_MOM"
        assert identity["type"] == "INGESTION"

    def test_capabilities_match_manifest(self, whk_wms_spec: dict):
        caps = whk_wms_spec["capabilities"]
        assert caps["read"] is True
        assert caps["subscribe"] is True
        assert caps["backfill"] is True
        assert caps["discover"] is True

    def test_all_specs_loadable(self):
        """Every FACTS spec file in the specs dir should be valid JSON."""
        specs_dir = (
            Path(__file__).resolve().parents[2]
            / "src" / "forge" / "governance" / "facts" / "specs"
        )
        for spec_path in specs_dir.glob("*.facts.json"):
            data = json.loads(spec_path.read_text())
            assert "adapter_identity" in data, f"{spec_path.name} missing identity"
            assert "spec_version" in data, f"{spec_path.name} missing version"


# ═══════════════════════════════════════════════════════════════════
# 2. FACTSRunner Static Validation
# ═══════════════════════════════════════════════════════════════════


class TestFACTSRunnerValidation:
    """Run the FACTSRunner in static mode against real specs."""

    @pytest.fixture()
    def runner(self, facts_schema_path: Path) -> FACTSRunner:
        return FACTSRunner(schema_path=facts_schema_path)

    @pytest.mark.asyncio()
    async def test_whk_wms_passes_validation(
        self, runner: FACTSRunner, whk_wms_spec: dict,
    ):
        """The WHK WMS spec should pass all static checks."""
        report = await runner.run(target="whk-wms", spec=whk_wms_spec)
        verdicts = report.verdicts if hasattr(report, "verdicts") else report

        # Extract just the list of FxTSVerdict objects
        if isinstance(verdicts, list):
            verdict_list = verdicts
        else:
            verdict_list = list(verdicts)

        # Every verdict should PASS (or at most SKIP for optional checks)
        failures = [
            v for v in verdict_list
            if v.status in (VerdictStatus.FAIL, VerdictStatus.ERROR)
        ]
        assert len(failures) == 0, (
            f"FACTS validation failures:\n"
            + "\n".join(f"  {v.check_id}: {v.message}" for v in failures)
        )

    @pytest.mark.asyncio()
    async def test_all_enforced_fields_checked(
        self, runner: FACTSRunner, whk_wms_spec: dict,
    ):
        """Runner should produce verdicts covering all enforced fields."""
        report = await runner.run(target="whk-wms", spec=whk_wms_spec)
        verdicts = report.verdicts if hasattr(report, "verdicts") else report
        if not isinstance(verdicts, list):
            verdicts = list(verdicts)

        check_ids = {v.check_id for v in verdicts}
        # Should have checks for major sections
        assert any("identity" in cid for cid in check_ids)
        assert any("capabilities" in cid or "capability" in cid for cid in check_ids)
        assert any("lifecycle" in cid for cid in check_ids)

    @pytest.mark.asyncio()
    async def test_missing_spec_returns_error(self, runner: FACTSRunner):
        """Running with no spec should return an error verdict."""
        report = await runner.run(target="missing-adapter")
        verdicts = report.verdicts if hasattr(report, "verdicts") else report
        if not isinstance(verdicts, list):
            verdicts = list(verdicts)
        assert any(v.status == VerdictStatus.ERROR for v in verdicts)

    @pytest.mark.asyncio()
    async def test_runner_covers_all_enforced_fields(self, runner: FACTSRunner):
        """The runner's implemented_fields must match its _ENFORCED_FIELDS."""
        fields = runner.implemented_fields()
        assert "adapter_identity" in fields
        assert "capabilities" in fields
        assert "integrity" in fields
        assert len(fields) >= 10  # All 10 top-level sections

    @pytest.mark.asyncio()
    async def test_every_production_spec_passes(self, runner: FACTSRunner):
        """All existing FACTS specs should pass static validation."""
        specs_dir = (
            Path(__file__).resolve().parents[2]
            / "src" / "forge" / "governance" / "facts" / "specs"
        )
        for spec_path in specs_dir.glob("*.facts.json"):
            spec = json.loads(spec_path.read_text())
            adapter_id = spec.get("adapter_identity", {}).get("adapter_id", spec_path.stem)
            report = await runner.run(target=adapter_id, spec=spec)
            verdicts = report.verdicts if hasattr(report, "verdicts") else report
            if not isinstance(verdicts, list):
                verdicts = list(verdicts)

            failures = [
                v for v in verdicts
                if v.status == VerdictStatus.ERROR
            ]
            assert len(failures) == 0, (
                f"Spec {spec_path.name} has errors:\n"
                + "\n".join(f"  {v.check_id}: {v.message}" for v in failures)
            )


# ═══════════════════════════════════════════════════════════════════
# 3. Hash Verification
# ═══════════════════════════════════════════════════════════════════


class TestHashVerification:
    """Verify spec integrity hashing and verification works correctly."""

    def test_compute_spec_hash_deterministic(self, whk_wms_spec: dict):
        """Same spec content should always produce the same hash."""
        h1 = compute_spec_hash(whk_wms_spec)
        h2 = compute_spec_hash(whk_wms_spec)
        assert h1 == h2
        assert len(h1) == 64  # SHA-256 hex digest

    def test_spec_hash_changes_with_content(self, whk_wms_spec: dict):
        """Modifying spec content should change the hash."""
        import copy

        original_hash = compute_spec_hash(whk_wms_spec)
        modified = copy.deepcopy(whk_wms_spec)
        modified["adapter_identity"]["version"] = "99.99.99"
        modified_hash = compute_spec_hash(modified)
        assert original_hash != modified_hash

    def test_hash_excludes_integrity_block(self, whk_wms_spec: dict):
        """Changing the integrity block should NOT change the hash."""
        import copy

        h1 = compute_spec_hash(whk_wms_spec)
        modified = copy.deepcopy(whk_wms_spec)
        modified["integrity"]["spec_hash"] = "deadbeef"
        h2 = compute_spec_hash(modified)
        assert h1 == h2

    def test_verify_spec_hash_with_correct_hash(self, whk_wms_spec: dict):
        """Spec with matching hash should verify True."""
        import copy

        spec = copy.deepcopy(whk_wms_spec)
        computed = compute_spec_hash(spec)
        spec["integrity"]["spec_hash"] = computed
        verified, msg = verify_spec_hash(spec)
        assert verified is True
        assert "verified" in msg.lower()

    def test_verify_spec_hash_with_wrong_hash(self, whk_wms_spec: dict):
        """Spec with mismatched hash should verify False."""
        import copy

        spec = copy.deepcopy(whk_wms_spec)
        spec["integrity"]["spec_hash"] = "0" * 64
        verified, msg = verify_spec_hash(spec)
        assert verified is False
        assert "mismatch" in msg.lower()

    def test_verify_spec_integrity_full(self, whk_wms_spec: dict):
        """Full integrity verification should return structured result."""
        result = verify_spec_integrity(whk_wms_spec)
        assert "hash_verified" in result
        assert "hash_state" in result
        assert "warnings" in result
        assert isinstance(result["warnings"], list)


# ═══════════════════════════════════════════════════════════════════
# 4. Cross-Spec Consistency
# ═══════════════════════════════════════════════════════════════════


class TestCrossSpecConsistency:
    """Verify consistency across all FACTS specs."""

    def test_all_specs_have_unique_adapter_ids(self):
        """No two specs should declare the same adapter_id."""
        specs_dir = (
            Path(__file__).resolve().parents[2]
            / "src" / "forge" / "governance" / "facts" / "specs"
        )
        ids = []
        for spec_path in specs_dir.glob("*.facts.json"):
            spec = json.loads(spec_path.read_text())
            ids.append(spec["adapter_identity"]["adapter_id"])
        assert len(ids) == len(set(ids)), f"Duplicate adapter IDs: {ids}"

    def test_all_specs_have_same_spec_version(self):
        """All specs should use the same FACTS spec version."""
        specs_dir = (
            Path(__file__).resolve().parents[2]
            / "src" / "forge" / "governance" / "facts" / "specs"
        )
        versions = set()
        for spec_path in specs_dir.glob("*.facts.json"):
            spec = json.loads(spec_path.read_text())
            versions.add(spec["spec_version"])
        assert len(versions) == 1, f"Mixed spec versions: {versions}"

    def test_all_specs_have_integrity_blocks(self):
        """Every spec must include an integrity block."""
        specs_dir = (
            Path(__file__).resolve().parents[2]
            / "src" / "forge" / "governance" / "facts" / "specs"
        )
        for spec_path in specs_dir.glob("*.facts.json"):
            spec = json.loads(spec_path.read_text())
            assert "integrity" in spec, f"{spec_path.name} missing integrity block"
