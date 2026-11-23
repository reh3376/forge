"""D3.12 — FACTS governance pipeline verification.

Proves the governance framework works end-to-end:
  spec load → FACTSRunner validation → hash verification → report generation

Uses the real Forge WMS FACTS spec and the real FACTSRunner to exercise
every check — adapter identity, capabilities, lifecycle, connection,
data contract, context mapping, error handling, metadata, integrity.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

import pytest

from forge_core.fxts import locations
from forge_core.fxts.facts.runners.facts_runner import FACTSRunner
from forge_core.fxts.shared.runner import (
    VerdictStatus,
    compute_spec_hash,
    verify_spec_hash,
    verify_spec_integrity,
)

if TYPE_CHECKING:
    from pathlib import Path

# ═══════════════════════════════════════════════════════════════════
# 1. Spec Loading & Structure
# ═══════════════════════════════════════════════════════════════════


class TestSpecLoading:
    """Verify FACTS specs load and have correct structure."""

    def test_forge_wms_spec_loads(self, forge_wms_spec: dict):
        assert forge_wms_spec is not None
        assert forge_wms_spec["spec_version"] == "0.1.0"

    def test_spec_has_all_required_sections(self, forge_wms_spec: dict):
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
        assert required.issubset(forge_wms_spec.keys()), (
            f"Missing sections: {required - forge_wms_spec.keys()}"
        )

    def test_adapter_identity_matches(self, forge_wms_spec: dict):
        identity = forge_wms_spec["adapter_identity"]
        assert identity["adapter_id"] == "forge-wms"
        assert identity["tier"] == "MES_MOM"
        assert identity["type"] == "INGESTION"

    def test_capabilities_match_manifest(self, forge_wms_spec: dict):
        caps = forge_wms_spec["capabilities"]
        assert caps["read"] is True
        assert caps["subscribe"] is True
        assert caps["backfill"] is True
        assert caps["discover"] is True

    def test_all_specs_loadable(self):
        """Every FACTS spec file in the specs dir should be valid JSON."""
        for spec_path in locations.spec_files("facts", "*.facts.json"):
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
    async def test_forge_wms_passes_validation(
        self,
        runner: FACTSRunner,
        forge_wms_spec: dict,
    ):
        """The Forge WMS spec should pass all static checks."""
        report = await runner.run(target="forge-wms", spec=forge_wms_spec)
        verdicts = report.verdicts if hasattr(report, "verdicts") else report

        # Extract just the list of FxTSVerdict objects
        verdict_list = verdicts if isinstance(verdicts, list) else list(verdicts)

        # Every verdict should PASS (or at most SKIP for optional checks). The one
        # allowed failure is the hash state while the owner's approval of the newest
        # stamp is pending: only the owner approves (FB-021), never a test or an agent.
        pending = forge_wms_spec["integrity"]["hash_state"] != "approved"
        failures = [
            v
            for v in verdict_list
            if v.status in (VerdictStatus.FAIL, VerdictStatus.ERROR)
            and not (pending and v.check_id == "facts:hash-approved")
        ]
        assert len(failures) == 0, "FACTS validation failures:\n" + "\n".join(
            f"  {v.check_id}: {v.message}" for v in failures
        )

    @pytest.mark.asyncio()
    async def test_all_enforced_fields_checked(
        self,
        runner: FACTSRunner,
        forge_wms_spec: dict,
    ):
        """Runner should produce verdicts covering all enforced fields."""
        report = await runner.run(target="forge-wms", spec=forge_wms_spec)
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
        for spec_path in locations.spec_files("facts", "*.facts.json"):
            spec = json.loads(spec_path.read_text())
            adapter_id = spec.get("adapter_identity", {}).get("adapter_id", spec_path.stem)
            report = await runner.run(target=adapter_id, spec=spec)
            verdicts = report.verdicts if hasattr(report, "verdicts") else report
            if not isinstance(verdicts, list):
                verdicts = list(verdicts)

            failures = [v for v in verdicts if v.status == VerdictStatus.ERROR]
            assert len(failures) == 0, f"Spec {spec_path.name} has errors:\n" + "\n".join(
                f"  {v.check_id}: {v.message}" for v in failures
            )


# ═══════════════════════════════════════════════════════════════════
# 3. Hash Verification
# ═══════════════════════════════════════════════════════════════════


class TestHashVerification:
    """Verify spec integrity hashing and verification works correctly."""

    def test_compute_spec_hash_deterministic(self, forge_wms_spec: dict):
        """Same spec content should always produce the same hash."""
        h1 = compute_spec_hash(forge_wms_spec)
        h2 = compute_spec_hash(forge_wms_spec)
        assert h1 == h2
        assert len(h1) == 64  # SHA-256 hex digest

    def test_spec_hash_changes_with_content(self, forge_wms_spec: dict):
        """Modifying spec content should change the hash."""
        import copy

        original_hash = compute_spec_hash(forge_wms_spec)
        modified = copy.deepcopy(forge_wms_spec)
        modified["adapter_identity"]["version"] = "99.99.99"
        modified_hash = compute_spec_hash(modified)
        assert original_hash != modified_hash

    def test_hash_excludes_integrity_block(self, forge_wms_spec: dict):
        """Changing the integrity block should NOT change the hash."""
        import copy

        h1 = compute_spec_hash(forge_wms_spec)
        modified = copy.deepcopy(forge_wms_spec)
        modified["integrity"]["spec_hash"] = "deadbeef"
        h2 = compute_spec_hash(modified)
        assert h1 == h2

    def test_verify_spec_hash_with_correct_hash(self, forge_wms_spec: dict):
        """Spec with matching hash should verify True."""
        import copy

        spec = copy.deepcopy(forge_wms_spec)
        computed = compute_spec_hash(spec)
        spec["integrity"]["spec_hash"] = computed
        verified, msg = verify_spec_hash(spec)
        assert verified is True
        assert "verified" in msg.lower()

    def test_verify_spec_hash_with_wrong_hash(self, forge_wms_spec: dict):
        """Spec with mismatched hash should verify False."""
        import copy

        spec = copy.deepcopy(forge_wms_spec)
        spec["integrity"]["spec_hash"] = "0" * 64
        verified, msg = verify_spec_hash(spec)
        assert verified is False
        assert "mismatch" in msg.lower()

    def test_verify_spec_integrity_full(self, forge_wms_spec: dict):
        """Full integrity verification should return structured result."""
        result = verify_spec_integrity(forge_wms_spec)
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
        ids = []
        for spec_path in locations.spec_files("facts", "*.facts.json"):
            spec = json.loads(spec_path.read_text())
            ids.append(spec["adapter_identity"]["adapter_id"])
        assert len(ids) == len(set(ids)), f"Duplicate adapter IDs: {ids}"

    def test_every_spec_declares_a_released_version(self):
        """A spec is written against one released version of the schema and says which.

        The specs need not all be on the same one: a spec moves to a newer version when it
        needs what that version adds (forge-ot is on 0.2.0 for the OT words, FB-079).
        """
        from forge_core import contract
        from forge_core.fxts.shared import schemas

        released = {row.version for row in schemas.versions(contract.schema_dir("facts"))}
        declared = {
            spec_path.name: json.loads(spec_path.read_text())["spec_version"]
            for spec_path in locations.spec_files("facts", "*.facts.json")
        }
        assert set(declared.values()) <= released, declared
        assert declared["forge-ot.facts.json"] == "0.2.0"

    def test_all_specs_have_integrity_blocks(self):
        """Every spec must include an integrity block."""
        for spec_path in locations.spec_files("facts", "*.facts.json"):
            spec = json.loads(spec_path.read_text())
            assert "integrity" in spec, f"{spec_path.name} missing integrity block"
