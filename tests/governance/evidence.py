"""What a run of a governed spec leaves not run since D-19 step 2, derived exactly.

A run now gives one ``<fw>:evidence-<section>`` verdict, not run, for each top-level section
holding a claim of the spec that no check of the real thing reached in that run (D-19,
AE-4; ``docs/decisions/approvals-and-evidence.md`` §12). The tests of each framework's
governed specs used to compare a run's not-run checks with the spec's accepted gaps; the
accepted gaps of the evidence findings cover every spec of a framework (``spec: "*"``),
while a spec gives only the findings of the claims it makes. So the exact expectation is
derived here from the marks in force, the spec and the run's own verdicts, and every
finding expected must itself be an accepted gap. The law itself is proved in
``tests/governance/test_evidence_claims.py``; this is its use by the per-framework tests.
"""

from __future__ import annotations

from typing import Any

from forge_core import contract
from forge_core.fxts.shared import schemas
from forge_core.fxts.shared.runner import EvidenceKind, FxTSReport
from forge_hub.cli import governance as governance_cli


def _units(framework: str) -> list[tuple[str, str]]:
    schema_dir = contract.schema_dir(framework)
    source = schemas.marks_version(schema_dir)
    if source is not None:
        return schemas.mark_units(source.load())
    head = schemas.latest(schema_dir)
    return schemas.mark_units(head.load(), honour_marks=False) if head else []


def _present(spec: dict[str, Any], pointer: str) -> bool:
    node: Any = spec
    for part in pointer.strip("/").split("/"):
        if not isinstance(node, dict) or part not in node:
            return False
        node = node[part]
    return node is not None


def expected_evidence(framework: str, spec: dict[str, Any], report: FxTSReport) -> set[str]:
    """The evidence findings this run must give: each section holding a claim the spec
    makes that no verdict of kind ``artifact`` in the run reached."""
    entry = governance_cli.FRAMEWORKS[framework]
    runner = entry.make_runner(entry.schema)
    covers = {
        pointer
        for verdict in report.verdicts
        if verdict.evidence_kind is EvidenceKind.ARTIFACT
        and (declared := runner.declaration_of(verdict.check_id)) is not None
        for pointer in declared.covers
    }
    return {
        f"{framework}:evidence-{schemas.section_id(pointer.split('/')[1])}"
        for pointer, mark in _units(framework)
        if mark == "claim"
        and _present(spec, pointer)
        and not any(c == "" or c == pointer or pointer.startswith(c + "/") for c in covers)
    }


def expected_not_run(
    framework: str, spec_name: str, spec: dict[str, Any], report: FxTSReport
) -> set[str]:
    """Exactly the checks a run of a governed spec may leave not run: its accepted gaps
    that are not evidence findings, and the evidence findings of this run, each of which
    must be an accepted gap."""
    accepted = governance_cli.accepted_checks(framework, spec_name, "NOT_RUN")
    evidence = expected_evidence(framework, spec, report)
    unaccepted = evidence - accepted
    assert not unaccepted, f"{spec_name}: evidence findings with no accepted gap: {unaccepted}"
    return {check for check in accepted if ":evidence-" not in check} | evidence
