"""Tests for the OT module FACTS spec's integrity block (BACKLOG FB-073).

``ot-module.facts.json`` is written in an OPC-UA vocabulary that FACTS v0.1.0
does not have (BACKLOG FB-079), so this module does not assert full
conformance the way the WMS and MES spec tests do. It asserts what FB-073
delivered: an integrity block FHTS can verify, an honest hash state, and a
hub registration check that no longer reports the hash.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from forge.governance.facts import SCHEMA_PATH
from forge.governance.facts.runners.facts_runner import FACTSRunner
from forge.governance.shared.runner import (
    VerdictStatus,
    compute_spec_hash,
    verify_spec_hash,
    verify_spec_integrity,
)
from forge.ingest.facts_check import check_manifest_against_facts
from forge.modules.ot.adapter import OTModuleAdapter

SPEC_PATH = (
    Path(__file__).resolve().parents[3] / "src/forge/governance/facts/specs/ot-module.facts.json"
)
FHTS_STATES = frozenset({"approved", "modified", "pending_review", "reverted", "unknown"})

#: FACTS vocabulary the OT spec does not speak yet. Tracked by BACKLOG FB-079;
#: remove an id here when FB-079 brings that section into conformance.
#: ``facts:schema-valid`` (FB-080) fails for the same reason and leaves with them.
KNOWN_VOCABULARY_FAILURES = frozenset(
    {
        "facts:schema-valid",
        "facts:identity-tier",
        "facts:lifecycle-state-transitions",
        "facts:connection-params-valid",
        "facts:connection-auth-methods",
        "facts:data-contract-output-format",
        "facts:data-contract-sources-valid",
        "facts:context-enrichment-valid",
        "facts:cross-write-sources",
    }
)


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
    report = asyncio.run(runner.run("ot-module", spec=spec))
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
        assert history[0]["new_hash"] == integrity["spec_hash"]
        assert history[0]["previous_hash"] == integrity["previous_hash"]


class TestRunnerVerdicts:
    """The FACTS runner's view of the spec after FB-073."""

    def test_integrity_checks(self, spec: dict, verdicts: dict) -> None:
        assert verdicts["facts:integrity-present"].status is VerdictStatus.PASS
        assert verdicts["facts:integrity-hash-format"].status is VerdictStatus.PASS
        expected = (
            VerdictStatus.PASS
            if spec["integrity"]["hash_state"] == "approved"
            else VerdictStatus.FAIL
        )
        assert verdicts["facts:integrity-hash-state"].status is expected

    def test_only_known_vocabulary_gaps_fail(self, verdicts: dict) -> None:
        statuses = {v.status for v in verdicts.values()}
        assert VerdictStatus.ERROR not in statuses
        assert VerdictStatus.NOT_IMPLEMENTED not in statuses
        failed = {cid for cid, v in verdicts.items() if v.status is VerdictStatus.FAIL}
        unexpected = failed - KNOWN_VOCABULARY_FAILURES - {"facts:integrity-hash-state"}
        assert unexpected == set(), unexpected


class TestHubRegistrationCheck:
    """`forge.ingest.facts_check` is what the hub runs at Register."""

    def test_spec_hash_verifies_for_the_hub(self) -> None:
        # The adapter class still identifies as 'forge-ot-module' (BACKLOG FB-079);
        # the spec is filed under 'ot-module'.
        manifest = OTModuleAdapter.manifest.model_copy(update={"adapter_id": "ot-module"})
        result = check_manifest_against_facts(manifest)
        assert result.spec_found is True
        assert not [p for p in result.problems + result.warnings if "integrity" in p]
