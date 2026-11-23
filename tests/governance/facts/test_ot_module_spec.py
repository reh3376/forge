"""Tests for the OT module FACTS spec's integrity block (BACKLOG FB-073).

``forge-ot.facts.json`` is written in an OPC-UA vocabulary that FACTS v0.1.0
does not have (BACKLOG FB-079), so this module does not assert full
conformance the way the WMS and MES spec tests do. It asserts what FB-073
delivered: an integrity block FHTS can verify, an honest hash state, and a
hub registration check that no longer reports the hash.
"""

from __future__ import annotations

import json
from itertools import pairwise
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from forge.modules.ot.adapter import OTModuleAdapter
from forge_core.fxts.facts import SCHEMA_PATH
from forge_core.fxts.facts.runners.facts_runner import FACTSRunner
from forge_core.fxts.shared.runner import (
    VerdictStatus,
    compute_spec_hash,
    verify_spec_hash,
    verify_spec_integrity,
)
from forge_hub.ingest.facts_check import check_manifest_against_facts

SPEC_PATH = (
    Path(__file__).resolve().parents[3]
    / "forge-core/src/python/forge_core/fxts/facts/specs/forge-ot.facts.json"
)
MODULE_DIR = Path(__file__).resolve().parents[3] / "src" / "forge" / "modules" / "ot"
FHTS_STATES = frozenset({"approved", "modified", "pending_review", "reverted", "unknown"})

#: Checks the OT spec is allowed to fail. Empty since FACTS 0.2.0 (FB-079): the spec speaks
#: the schema's vocabulary. Only the owner's approval can be outstanding.
KNOWN_VOCABULARY_FAILURES: frozenset[str] = frozenset()


@pytest.fixture(scope="module")
def spec() -> dict:
    with SPEC_PATH.open(encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def schema() -> dict:
    with SCHEMA_PATH.open(encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def verdicts(spec: dict) -> dict[str, object]:
    import asyncio

    runner = FACTSRunner(schema_path=SCHEMA_PATH)
    report = asyncio.run(runner.run("forge-ot", spec=spec))
    return {v.check_id: v for v in report.verdicts}


class TestIntegrityBlock:
    """FB-073: the placeholder hash and the non-FHTS state are gone."""

    def test_integrity_block_validates_against_schema(self, spec: dict, schema: dict) -> None:
        errors = [
            e
            for e in Draft202012Validator(schema).iter_errors(spec)
            if list(e.absolute_path)[:1] == ["integrity"]
        ]
        assert errors == [], [e.message for e in errors]

    def test_hash_is_reproducible_and_verifies(self, spec: dict) -> None:
        integrity = spec["integrity"]
        assert integrity["hash_method"] == "sha256-c14n-v1"
        assert compute_spec_hash(spec) == integrity["spec_hash"]
        verified, message = verify_spec_hash(spec)
        assert verified is True, message

    def test_hash_state_is_an_fhts_state(self, spec: dict) -> None:
        state = spec["integrity"]["hash_state"]
        assert state in FHTS_STATES
        assert state != "draft"

    def test_approval_is_honest(self, spec: dict) -> None:
        integrity = spec["integrity"]
        if integrity["hash_state"] == "approved":
            assert integrity.get("approved_by"), "approved without an approver"
            assert integrity.get("approved_at")
        else:
            # The schema types approved_by/approved_at as strings: absent, never null.
            assert "approved_by" not in integrity
            assert "approved_at" not in integrity
            assert verify_spec_integrity(spec)["state_approved"] is False

    def test_change_history_chains_hex_hashes(self, spec: dict) -> None:
        integrity = spec["integrity"]
        history = integrity["change_history"]
        assert 1 <= len(history) <= 3
        for entry in history:
            assert len(entry["previous_hash"]) == 64
            assert len(entry["new_hash"]) == 64
            assert entry["change_type"] in {"structural", "content", "config", "revert"}
        # ``add_spec_hash`` inserts at index 0: the newest entry is first.
        assert history[0]["new_hash"] == integrity["spec_hash"]
        assert history[0]["previous_hash"] == integrity["previous_hash"]
        for newer, older in pairwise(history):
            assert newer["previous_hash"] == older["new_hash"]


class TestRunnerVerdicts:
    """The FACTS runner's view of the spec after FB-073."""

    def test_integrity_checks(self, spec: dict, verdicts: dict) -> None:
        assert verdicts["facts:hash-verified"].status is VerdictStatus.PASS
        assert verdicts["facts:integrity-hash-format"].status is VerdictStatus.PASS
        expected = (
            VerdictStatus.PASS
            if spec["integrity"]["hash_state"] == "approved"
            else VerdictStatus.FAIL
        )
        assert verdicts["facts:hash-approved"].status is expected

    def test_only_known_vocabulary_gaps_fail(self, verdicts: dict) -> None:
        statuses = {v.status for v in verdicts.values()}
        assert VerdictStatus.ERROR not in statuses
        assert VerdictStatus.NOT_IMPLEMENTED not in statuses
        failed = {cid for cid, v in verdicts.items() if v.status is VerdictStatus.FAIL}
        unexpected = failed - KNOWN_VOCABULARY_FAILURES - {"facts:hash-approved"}
        assert unexpected == set(), unexpected


class TestHubRegistrationCheck:
    """`forge_hub.ingest.facts_check` is what the hub runs at Register."""

    def test_spec_hash_verifies_for_the_hub(self) -> None:
        result = check_manifest_against_facts(OTModuleAdapter.manifest)
        assert result.spec_found is True
        assert not [p for p in result.problems + result.warnings if "integrity" in p]

    def test_the_running_adapter_and_its_spec_are_one_identity(self) -> None:
        """FB-079: the adapter's manifest, the module's manifest file and the spec agreed on
        nothing but the name. The hub's check at Register now finds no difference."""
        result = check_manifest_against_facts(OTModuleAdapter.manifest)
        assert result.problems == []
        differences = [w for w in result.warnings if "integrity" not in w and "approved" not in w]
        assert differences == [], differences

    def test_the_manifest_file_says_what_the_adapter_says(self, spec: dict) -> None:
        document = json.loads((MODULE_DIR / "manifest.json").read_text(encoding="utf-8"))
        manifest = OTModuleAdapter.manifest
        assert (
            document["adapter_id"] == manifest.adapter_id == spec["adapter_identity"]["adapter_id"]
        )
        assert document["version"] == manifest.version == spec["adapter_identity"]["version"]
        assert document["tier"] == manifest.tier.value == spec["adapter_identity"]["tier"]
        contract = document["data_contract"]
        assert contract["schema_ref"] == manifest.data_contract.schema_ref
        assert contract["output_format"] == manifest.data_contract.output_format
        assert contract["context_fields"] == list(manifest.data_contract.context_fields)
        assert contract == {key: spec["data_contract"][key] for key in contract}
