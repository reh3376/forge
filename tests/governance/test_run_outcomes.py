"""What every governed spec's run says today, held as a fact that changes only on purpose.

The audit of 2026-11-23 (``forge-core/docs/fxts/AUDIT-2026-11-23.md``) found that 63 of
64 runs were reported as passed when most had looked at nothing real. Since FB-265 a run
is PASS, FAIL or INCOMPLETE. This test runs every governed spec of every framework
through its real runner and holds the table of outcomes, and for each run that did not
pass, exactly which checks did not run.

Why a test and not a sentence in a document: the state document and the tutorial quote
these numbers, and a number typed into a document is right only on the day it is typed.

When this test fails, the state of the specs changed:

- a count moved towards PASS because a check now runs: lower the gap here, in the same
  change, and correct the numbers in ``docs/WHERE-WE-ARE.md`` and ``docs/tutorial.md``;
- a count moved away from PASS, or a new check id appears under "not run": that is a
  regression or a new gap. A new gap needs a backlog item named in the verdict's
  message; it is never added here to make the test green.

The module framework's own gaps (waivers, the conformance kit) are held per module in
``tests/governance/fmts/test_module_specs.py``; here FMTS is held by its outcomes.
"""

from __future__ import annotations

from collections import Counter

import pytest

from forge_core.fxts.shared.runner import RunOutcome
from forge_hub.cli import governance as governance_cli

PASSED, INCOMPLETE, FAILED = RunOutcome.PASS, RunOutcome.INCOMPLETE, RunOutcome.FAIL

#: framework -> outcome -> how many of its governed specs end that way.
OUTCOMES: dict[str, dict[RunOutcome, int]] = {
    "fats": {INCOMPLETE: 28},  # no run compares a spec with its route (FB-269)
    "facts": {INCOMPLETE: 9},  # no run compares a spec with its module's code (FB-271)
    "ftts": {INCOMPLETE: 1},  # no run compares the spec with the proto or the servicer (FB-270)
    "fmts": {
        INCOMPLETE: 8,
        FAILED: 1,
    },  # every module waives something; forge-mes is not approved (FB-155)
    "fvts": {PASSED: 1},
    "futs": {PASSED: 16},
}
#: framework -> the checks that did not run, the same in every spec of that framework.
NOT_RUN: dict[str, set[str]] = {
    "fats": {"fats:live"},
    "facts": {"facts:live"},
    "ftts": {"ftts:live"},
    "fvts": set(),
    "futs": set(),
}


def test_every_framework_on_the_command_line_is_held_here() -> None:
    assert set(OUTCOMES) == set(governance_cli.FRAMEWORKS)


@pytest.mark.parametrize("name", sorted(OUTCOMES))
async def test_the_outcome_of_every_governed_spec(name: str) -> None:
    framework = governance_cli.FRAMEWORKS[name]
    files = governance_cli.framework_specs(framework)
    seen: Counter[RunOutcome] = Counter()
    for file in files:
        report = await governance_cli.run_framework(name, str(file))
        seen[report.outcome] += 1
        assert not [v for v in report.failures if v.status != "FAIL"], (
            f"{file.name}: a check broke or has no implementation: "
            f"{[(v.check_id, v.status, v.message) for v in report.failures]}"
        )
        if name in NOT_RUN:
            assert {v.check_id for v in report.not_run} == NOT_RUN[name], file.name
            assert not report.waived, file.name
        for verdict in report.not_run:
            assert "FB-" in verdict.message, (
                f"{file.name}: {verdict.check_id} did not run and names no backlog item"
            )
    assert dict(seen) == OUTCOMES[name], f"{name}: the outcomes of its {len(files)} specs changed"


def test_the_numbers_the_documents_quote() -> None:
    """17 pass, 46 are incomplete, 1 fails: the sentence in the state document and the tutorial."""
    total: Counter[RunOutcome] = Counter()
    for outcomes in OUTCOMES.values():
        total.update(outcomes)
    assert dict(total) == {PASSED: 17, INCOMPLETE: 46, FAILED: 1}
    quoted = "17 pass, 46 are incomplete and 1 fails"
    for document in ("docs/WHERE-WE-ARE.md", "docs/tutorial.md"):
        text = (governance_cli.REPO_ROOT / document).read_text(encoding="utf-8")
        assert quoted in text or "17 runs pass, 46 are incomplete and 1 fails" in text, document
