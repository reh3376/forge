"""A run never passes unless every check ran and passed: every case, on the real code.

The law (D-14, F-7: "A check that was not run is reported as not run, never as passed";
BACKLOG FB-265). Until 2026-11-23 a skipped check counted as passed and a run with no
check at all passed, so a spec could be reported as met when nothing had looked at it.

What is enumerated, and why a pass here is a proof and not a sample:

- ``outcome_of`` reads only which statuses are present. That is checked, not assumed:
  every sequence of up to four verdicts over every status (1,555 sequences) gives the
  outcome of its set. So the 64 sets of statuses are every case there is.
- The report's own properties, its summary line and its JSON are checked on those same
  sequences, and the command line's exit code and closing line on all 64 sets.
- The enumeration is taken from ``VerdictStatus`` itself, so a status added later is in
  it, and ``test_every_status_is_classified_once`` fails until it is given a meaning.
- Each law is shown to be able to fail: four broken rules, among them the rule the code
  had before, must each be caught.

Skill: ``.claude/skills/verify-fxts-verdicts``.
"""

from __future__ import annotations

import itertools
import json
import re
from pathlib import Path
from typing import TYPE_CHECKING, Any

import pytest
from typer.testing import CliRunner

from forge_core.fxts.shared import runner as shared
from forge_core.fxts.shared.runner import (
    FAILING_STATUSES,
    UNOBSERVED_STATUSES,
    FxTSReport,
    FxTSRunner,
    FxTSVerdict,
    RunOutcome,
    VerdictStatus,
    outcome_of,
)
from forge_hub.cli import governance as governance_cli
from forge_hub.cli.main import app

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable

STATUSES = tuple(VerdictStatus)
ALL_SETS = [
    frozenset(combo)
    for n in range(len(STATUSES) + 1)
    for combo in itertools.combinations(STATUSES, n)
]
ALL_SEQUENCES = [seq for n in range(5) for seq in itertools.product(STATUSES, repeat=n)]
EXIT_CODE = {RunOutcome.PASS: 0, RunOutcome.FAIL: 1, RunOutcome.INCOMPLETE: 3}


def expected(present: Iterable[VerdictStatus]) -> RunOutcome:
    """The law, written a second time and a different way from the code."""
    present = set(present)
    if not present:
        return RunOutcome.FAIL
    for status in present:
        if status in (VerdictStatus.FAIL, VerdictStatus.ERROR, VerdictStatus.NOT_IMPLEMENTED):
            return RunOutcome.FAIL
    if present == {VerdictStatus.PASS}:
        return RunOutcome.PASS
    return RunOutcome.INCOMPLETE


def counterexample(rule: Callable[[Iterable[VerdictStatus]], RunOutcome]) -> str | None:
    """The first case in which ``rule`` breaks the law, in plain words, or None."""
    for seq in ALL_SEQUENCES:
        got, want = rule(seq), expected(seq)
        if got is not want:
            shown = ", ".join(seq) or "no verdict at all"
            return f"a run with the verdicts [{shown}] is reported as {got}; it is {want}"
    return None


def _report(statuses: Iterable[VerdictStatus]) -> FxTSReport:
    return FxTSReport(
        framework="FXTS",
        runner_version="0",
        target="t",
        verdicts=[
            FxTSVerdict(check_id=f"fxts:c{i}", spec_ref="FXTS/c", status=s, message=f"{s}")
            for i, s in enumerate(statuses)
        ],
    )


# -- the law -------------------------------------------------------------------------


def test_the_enumeration_is_whole() -> None:
    assert len(STATUSES) == 6 and len(ALL_SETS) == 2**6 == 64
    assert len(ALL_SEQUENCES) == sum(6**n for n in range(5)) == 1555


def test_every_status_is_classified_once() -> None:
    """A status is passed, failing or unobserved, and exactly one of them."""
    for status in STATUSES:
        kinds = [
            status is VerdictStatus.PASS,
            status in FAILING_STATUSES,
            status in UNOBSERVED_STATUSES,
        ]
        assert kinds.count(True) == 1, f"{status} has {kinds.count(True)} meanings"
    assert not hasattr(VerdictStatus, "SKIP"), "a status that can hide an unrun check is back"


def test_the_outcome_holds_for_every_sequence() -> None:
    assert counterexample(outcome_of) is None


def test_the_outcome_reads_only_which_statuses_are_present() -> None:
    for seq in ALL_SEQUENCES:
        assert outcome_of(seq) is outcome_of(frozenset(seq)), seq


def test_a_run_passes_only_when_every_check_ran_and_passed() -> None:
    passing = [present for present in ALL_SETS if outcome_of(present) is RunOutcome.PASS]
    assert passing == [frozenset({VerdictStatus.PASS})]


def test_the_report_agrees_with_the_rule_for_every_sequence() -> None:
    for seq in ALL_SEQUENCES:
        report = _report(seq)
        want = expected(seq)
        assert report.outcome is want, seq
        assert report.passed is (want is RunOutcome.PASS), seq
        assert report.failed is (want is RunOutcome.FAIL), seq
        # every verdict is counted once, as what it is
        assert report.pass_count + len(report.failures) + len(report.not_run) + len(
            report.waived
        ) == len(seq)
        assert len(report.not_run) == seq.count(VerdictStatus.NOT_RUN)
        assert len(report.waived) == seq.count(VerdictStatus.WAIVED)


def test_the_summary_line_never_hides_what_did_not_run() -> None:
    for seq in ALL_SEQUENCES:
        report = _report(seq)
        line = report.summary()
        assert line.startswith(f"[{expected(seq)}] "), (seq, line)
        assert ("not run" in line) is (VerdictStatus.NOT_RUN in seq), (seq, line)
        assert ("waived" in line) is (VerdictStatus.WAIVED in seq), (seq, line)
        assert ("failed" in line) is bool(set(seq) & FAILING_STATUSES), (seq, line)
        assert ("no check ran" in line) is (not seq), (seq, line)


def test_the_json_report_carries_the_outcome() -> None:
    for present in ALL_SETS:
        assert json.loads(_report(sorted(present)).to_json())["outcome"] == expected(present)


# -- the command line ------------------------------------------------------------------


@pytest.mark.parametrize("present", ALL_SETS, ids=lambda s: "+".join(sorted(s)) or "none")
def test_the_exit_code_and_the_closing_line_follow_the_outcome(
    present: frozenset[VerdictStatus], monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_run(name: str, target: str, **_: Any) -> FxTSReport:
        return _report(sorted(present))

    monkeypatch.setattr(governance_cli, "run_framework", fake_run)
    result = CliRunner().invoke(app, ["governance", "run", "facts", "anything"])
    want = expected(present)
    assert result.exit_code == EXIT_CODE[want], result.output
    assert ("All checks ran and passed." in result.output) is (want is RunOutcome.PASS)
    assert ("does not show that the spec is met" in result.output) is (
        want is RunOutcome.INCOMPLETE
    )
    for status in present - {VerdictStatus.PASS}:
        assert f"[{status}] fxts:" in result.output, f"a {status} verdict is not named"


# -- the runner base ---------------------------------------------------------------------


class _Runner(FxTSRunner):
    framework = "FXTS"

    def __init__(self, behaviour: Callable[[], list[FxTSVerdict]]) -> None:
        super().__init__()
        self._behaviour = behaviour

    def implemented_fields(self) -> set[str]:
        return set()

    async def _run_checks(self, target: str, **kwargs: Any) -> list[FxTSVerdict]:
        return self._behaviour()


async def test_a_runner_that_checks_nothing_fails() -> None:
    report = await _Runner(list).run(target="t")
    assert report.verdicts == [] and report.failed and "no check ran" in report.summary()


@pytest.mark.parametrize(
    "exc", [KeyError("capabilities"), TypeError("'int' is not iterable"), ValueError("x")]
)
async def test_a_runner_that_breaks_fails_with_its_cause(exc: Exception) -> None:
    def boom() -> list[FxTSVerdict]:
        raise exc

    report = await _Runner(boom).run(target="t")
    assert report.failed
    [verdict] = report.verdicts
    assert verdict.check_id == "fxts:runner-error" and verdict.status is VerdictStatus.ERROR
    assert type(exc).__name__ in verdict.message
    assert verdict.evidence["exception"] == type(exc).__name__
    assert verdict.evidence["at"].startswith("test_verdicts_exhaustive.py:")


# -- nothing in the frameworks can write a hidden skip ------------------------------------


def test_no_framework_code_names_a_status_that_does_not_exist() -> None:
    root = Path(shared.__file__).resolve().parents[1]  # forge_core/fxts
    hub = Path(governance_cli.__file__).resolve().parents[1]  # forge_hub
    named: dict[str, set[str]] = {}
    for file in [*root.rglob("*.py"), *hub.rglob("*.py")]:
        for name in re.findall(r"VerdictStatus\.([A-Z_]+)", file.read_text(encoding="utf-8")):
            named.setdefault(name, set()).add(file.name)
    assert set(named) <= {s.name for s in VerdictStatus}, {
        n: sorted(f) for n, f in named.items() if n not in VerdictStatus.__members__
    }
    # and every status that can stop a run from passing is in use, so none is decoration
    assert {"NOT_RUN", "WAIVED", "ERROR", "FAIL"} <= set(named)


# -- able to fail --------------------------------------------------------------------------


def _skip_counts_as_passed(statuses: Iterable[VerdictStatus]) -> RunOutcome:
    """The rule the code had until 2026-11-23: all PASS or skipped, and nothing is fine."""
    ok = (VerdictStatus.PASS, VerdictStatus.NOT_RUN, VerdictStatus.WAIVED)
    return RunOutcome.PASS if all(s in ok for s in statuses) else RunOutcome.FAIL


def _nothing_checked_is_fine(statuses: Iterable[VerdictStatus]) -> RunOutcome:
    statuses = list(statuses)
    return outcome_of(statuses) if statuses else RunOutcome.PASS


def _a_waiver_is_a_pass(statuses: Iterable[VerdictStatus]) -> RunOutcome:
    return outcome_of(VerdictStatus.PASS if s is VerdictStatus.WAIVED else s for s in statuses)


def _an_error_is_only_incomplete(statuses: Iterable[VerdictStatus]) -> RunOutcome:
    return outcome_of(VerdictStatus.NOT_RUN if s is VerdictStatus.ERROR else s for s in statuses)


@pytest.mark.parametrize(
    ("broken", "says"),
    [
        (
            _skip_counts_as_passed,
            "a run with the verdicts [no verdict at all] is reported as PASS; it is FAIL",
        ),
        (
            _nothing_checked_is_fine,
            "a run with the verdicts [no verdict at all] is reported as PASS; it is FAIL",
        ),
        (
            _a_waiver_is_a_pass,
            "a run with the verdicts [WAIVED] is reported as PASS; it is INCOMPLETE",
        ),
        (
            _an_error_is_only_incomplete,
            "a run with the verdicts [ERROR] is reported as INCOMPLETE; it is FAIL",
        ),
    ],
)
def test_a_broken_rule_is_caught(broken: Callable[..., RunOutcome], says: str) -> None:
    assert counterexample(broken) == says


def test_the_old_rule_is_caught_on_a_skipped_check_too() -> None:
    """Past the empty run, the rule the code had also passes a run whose only check did not run."""
    found = [
        seq for seq in ALL_SEQUENCES if seq and _skip_counts_as_passed(seq) is not expected(seq)
    ]
    assert found[0] == (VerdictStatus.NOT_RUN,)
