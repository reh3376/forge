"""FVTS gate for the OT module's view contract.

This is the ``conformance_tests.suite_path`` of ``ot-module.fvts.json``. It runs the full
FVTSRunner over the reference spec with the real FACTS specs and the golden set under
``tests/governance/fvts/golden/ot-module/``. Every check must pass except
``fvts:hash-approved``: the reference spec stays ``pending_review`` until the owner approves it
under BACKLOG FB-078 (after the invented fermenter points are replaced by real OT tags). Nobody
writes that approval on the owner's behalf. Empty ``ALLOWED_FAILURES`` when it lands.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from forge.governance.fvts.renderer import load_golden_messages, render_golden_set
from forge.governance.shared.runner import VerdictStatus
from tests.governance.fvts.conftest import GOLDEN_DIR

if TYPE_CHECKING:
    from forge.governance.fvts.runners.fvts_runner import FVTSRunner

ALLOWED_FAILURES = frozenset({"fvts:hash-approved"})


async def test_reference_contract_passes_every_check(
    runner: FVTSRunner, reference_spec: dict[str, Any]
) -> None:
    report = await runner.run(target="ot-module-views", spec=reference_spec)
    by_status: dict[VerdictStatus, list[str]] = {}
    for verdict in report.verdicts:
        by_status.setdefault(verdict.status, []).append(verdict.check_id)
    assert by_status.get(VerdictStatus.NOT_IMPLEMENTED, []) == []  # schema-runner parity
    assert by_status.get(VerdictStatus.ERROR, []) == []
    failed = set(by_status.get(VerdictStatus.FAIL, []))
    assert failed <= ALLOWED_FAILURES, [
        (v.check_id, v.message) for v in report.verdicts if v.status is VerdictStatus.FAIL
    ]
    assert report.hash_verified is True, report.hash_message
    assert report.total == 19


def test_approval_state_is_honest(reference_spec: dict[str, Any]) -> None:
    integrity = reference_spec["integrity"]
    assert integrity["hash_state"] in ("pending_review", "approved")
    if integrity["hash_state"] == "approved":
        assert integrity["approved_by"], "an approved hash names its approver"
    else:
        assert not integrity["approved_by"], "pending_review carries no approver"


def test_every_renderer_under_test_renders_the_golden_set(reference_spec: dict[str, Any]) -> None:
    messages = load_golden_messages(GOLDEN_DIR)
    assert len(messages) >= 10
    for profile in reference_spec["conformance_tests"]["renderers_under_test"]:
        run = render_golden_set(reference_spec, profile, messages)
        assert run.errors == [], (profile, run.errors)
        assert run.rendered >= 10


def test_owner_is_the_ot_module_with_write_capability(
    facts_specs: dict[str, dict[str, Any]], reference_spec: dict[str, Any]
) -> None:
    owner = reference_spec["view_identity"]["owner_module"]
    facts = facts_specs[owner]
    assert facts["adapter_identity"]["adapter_id"] == "ot-module"
    assert facts["capabilities"]["write"] is True
    assert reference_spec["view_identity"]["facts_spec_ref"].endswith("ot-module.facts.json")
