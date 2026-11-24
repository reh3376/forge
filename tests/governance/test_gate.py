"""The repository against its own gate, and the numbers the documents quote from it.

``forge governance check`` runs every framework over every governed spec and lets a check
that fails or did not run through only where an accepted gap says so: an entry of
``forge-core/fxts/accepted-gaps.json`` that the owner approved as it is now, whose backlog
item is open, and that covers something that was really found (BACKLOG FB-266). CI runs
the command as its own step; this test runs the same function, so ``pytest`` alone tells
a developer the gate's answer before a push.

When ``test_the_repository_passes_its_gate`` fails, its message lists what the gate
refused. The repair is never an entry written to make it green: an entry counts only when
the owner approves it (``forge governance gap-approve``). An entry the gate calls unused
means its gap is closed: remove the entry.

The rule itself, for every case, is ``forge-core/tests/fxts/test_gaps_exhaustive.py``.
"""

from __future__ import annotations

import asyncio
import functools
from collections import Counter

from forge_core.fxts.shared.runner import RunOutcome
from forge_hub.cli import governance as governance_cli


@functools.cache
def _runs() -> tuple[governance_cli.GateRun, ...]:
    """Every governed spec through its real runner, once for this module."""
    return tuple(asyncio.run(governance_cli.gate_runs()))


def test_the_repository_passes_its_gate() -> None:
    result = asyncio.run(governance_cli.gate(runs=list(_runs())))
    lines = [f"PROBLEM {p}" for p in result.problems]
    lines += [f"REFUSED {r.finding}: {r.why}" for r in result.refused]
    lines += [
        f"UNUSED  {g.id}: covers nothing; the gap is closed, remove it" for g in result.unused
    ]
    lines += [f"CLOSED  {g.id}: {g.backlog_item} is {state}" for g, state in result.closed]
    assert result.ok, "the gate refuses:\n" + "\n".join(lines)
    assert result.accepted, "a gate that accepted nothing ran nothing"


def test_every_check_that_did_not_run_names_its_backlog_item() -> None:
    """A reader of a run sees what closes the gap without opening the gaps file."""
    for run in _runs():
        for verdict in run.report.not_run:
            assert "FB-" in verdict.message, (
                f"{run.spec.name}: {verdict.check_id} did not run and names no backlog item"
            )


def test_the_numbers_the_documents_quote() -> None:
    """The state document and the tutorial quote how the runs end. The numbers are
    counted here from the real runs, never typed into a test (FB-277)."""
    seen = Counter(run.report.outcome for run in _runs())
    sentence = (
        f"{seen[RunOutcome.PASS]} runs pass, {seen[RunOutcome.INCOMPLETE]} are incomplete "
        f"and {seen[RunOutcome.FAIL]} fails"
    )
    if seen[RunOutcome.FAIL] != 1:
        sentence = sentence.removesuffix("fails") + "fail"
    for document in ("docs/WHERE-WE-ARE.md", "docs/tutorial.md"):
        text = (governance_cli.REPO_ROOT / document).read_text(encoding="utf-8")
        assert sentence in text, f"{document} does not say: {sentence}"
