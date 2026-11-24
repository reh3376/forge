"""The gate lets a finding through only by an approved, open, matching entry: every case.

The law (BACKLOG FB-266): the gate passes exactly when nothing is wrong outside the specs,
every finding is a check that failed or did not run and is covered by an accepted gap the
owner approved as it is now and whose backlog item is open, and every accepted gap covers
something that was found and names an open item. And: an entry changed in any way the
owner did not approve accepts nothing, so the file only grows on the owner's word.

What is enumerated, and why it is every case:

- ``judge`` decides each finding from the entries that cover it, and an entry covers only
  findings of its own framework, check and status, of its spec or of every spec
  (``test_an_entry_covers_nothing_else``, over every field that could differ). So one
  framework and one check lose nothing, and two specs with a named entry on one and the
  wildcard entry on both give every relation a finding can have to the entries.
- Findings: every subset of two specs times three statuses (NOT_RUN, FAIL and ERROR; ERROR
  stands for every status that is never accepted, and the others are checked to be
  treated alike): 64.
- Entries: for each of the three possible keys (the named spec failing or not run, every
  spec not run), absent or present, approved or not, with its item open, closed or not in
  the backlog: 7 x 7 x 7 = 343.
- Each of the 21,952 cases is decided by ``judge`` and by the law written a second time
  below, independently of the code; and the decision is checked to be whole (every
  finding accepted or refused, once).
- Able to fail: five broken gates, each a plausible mistake, must each be caught with a
  counterexample in words.

Skill: ``.claude/skills/verify-fxts-gate``.
"""

from __future__ import annotations

import itertools
import json
from typing import TYPE_CHECKING, Any

import pytest
from pydantic import ValidationError

from forge_core.fxts.shared import gaps as g
from forge_core.fxts.shared.gaps import AcceptedGap, Finding, GateResult, judge

if TYPE_CHECKING:
    from collections.abc import Callable, Mapping
    from pathlib import Path

FW, CHECK = "fa", "fa:c"
S1, S2 = "s1.json", "s2.json"
STATUSES = ("NOT_RUN", "FAIL", "ERROR")
ALL_FINDINGS = [Finding(FW, spec, CHECK, status) for spec in (S1, S2) for status in STATUSES]
FINDING_SETS = [
    combo for n in range(len(ALL_FINDINGS) + 1) for combo in itertools.combinations(ALL_FINDINGS, n)
]
KEYS = [(S1, "NOT_RUN"), (S1, "FAIL"), (g.EVERY_SPEC, "NOT_RUN")]
ITEMS = {"open": "FB-901", "closed": "FB-902", "unknown": "FB-903"}
BACKLOG: dict[str, bool] = {"FB-901": True, "FB-902": False}  # FB-903 is in neither file


def gap(spec: str, status: str, *, approved: bool = True, item: str = "open") -> AcceptedGap:
    entry = AcceptedGap(
        id=f"g-{'all' if spec == g.EVERY_SPEC else spec.split('.')[0]}-{status.lower()[:3]}",
        framework=FW,
        spec=spec,
        check=CHECK,
        status=status,  # type: ignore[arg-type]
        backlog_item=ITEMS[item],
        reason="a reason long enough to be a reason",
    )
    return entry.approved_by("owner", "2026-11-26T00:00:00Z") if approved else entry


VARIANTS: list[AcceptedGap | None] = [None]
VARIANTS_BY_KEY = {
    key: [None]
    + [gap(*key, approved=a, item=i) for a in (True, False) for i in ("open", "closed", "unknown")]
    for key in KEYS
}
ENTRY_SETS = [
    tuple(e for e in combo if e is not None)
    for combo in itertools.product(*(VARIANTS_BY_KEY[key] for key in KEYS))
]


# -- the law, written a second time ---------------------------------------------------


def _covers(entry: AcceptedGap, finding: Finding) -> bool:
    return (entry.framework, entry.check, entry.status) == (
        finding.framework,
        finding.check,
        finding.status,
    ) and entry.spec in (g.EVERY_SPEC, finding.spec)


def _usable(entry: AcceptedGap, backlog: Mapping[str, bool]) -> bool:
    signed = entry.approval.by != "" and entry.approval.hash == g.sha256_hex_obj(
        {k: v for k, v in entry.model_dump().items() if k != "approval"}
    )
    return signed and backlog.get(entry.backlog_item, False) is True


def lawful(
    findings: tuple[Finding, ...],
    entries: tuple[AcceptedGap, ...],
    backlog: Mapping[str, bool],
    problems: tuple[str, ...] = (),
) -> bool:
    if problems:
        return False
    for finding in findings:
        if finding.status not in ("NOT_RUN", "FAIL"):
            return False
        if not any(_covers(e, finding) and _usable(e, backlog) for e in entries):
            return False
    for entry in entries:
        if backlog.get(entry.backlog_item, False) is not True:
            return False
        if not any(_covers(entry, f) for f in findings):
            return False
    return True


def _describe(findings: tuple[Finding, ...], entries: tuple[AcceptedGap, ...]) -> str:
    found = ", ".join(f"{f.spec} {f.status}" for f in findings) or "nothing"
    listed = (
        ", ".join(
            f"{e.spec} {e.status} ({'approved' if e.approved else 'not approved'}, "
            f"{next(k for k, v in ITEMS.items() if v == e.backlog_item)} item)"
            for e in entries
        )
        or "no entry"
    )
    return f"found [{found}] with [{listed}]"


def counterexample(
    gate: Callable[..., GateResult], backlog: Mapping[str, bool] = BACKLOG
) -> str | None:
    for findings in FINDING_SETS:
        for entries in ENTRY_SETS:
            got = gate(findings, entries, backlog).ok
            want = lawful(findings, entries, backlog)
            if got != want:
                return (
                    f"{_describe(findings, entries)}: the gate says "
                    f"{'pass' if got else 'fail'}; it must {'pass' if want else 'fail'}"
                )
    return None


# -- the law ---------------------------------------------------------------------------


def test_the_enumeration_is_whole() -> None:
    assert len(FINDING_SETS) == 2**6 == 64
    assert len(ENTRY_SETS) == 7**3 == 343


def test_the_gate_holds_for_every_case() -> None:
    assert counterexample(judge) is None


def test_the_decision_is_whole_for_every_case() -> None:
    for findings in FINDING_SETS:
        for entries in ENTRY_SETS:
            result = judge(findings, entries, BACKLOG)
            accepted = [f for f, _ in result.accepted]
            refused = [r.finding for r in result.refused]
            assert sorted(map(str, accepted + refused)) == sorted(map(str, findings))
            for finding, entry in result.accepted:
                assert _covers(entry, finding) and _usable(entry, BACKLOG)
            assert set(result.unused) == {
                e for e in entries if not any(_covers(e, f) for f in findings)
            }


def test_a_problem_is_never_let_through() -> None:
    for findings in FINDING_SETS:
        for entries in ENTRY_SETS:
            assert not judge(findings, entries, BACKLOG, ["a list is not approved"]).ok


@pytest.mark.parametrize("status", ["ERROR", "NOT_IMPLEMENTED", g.NO_VERDICT, "PASS", "WAIVED"])
def test_no_other_status_is_ever_accepted(status: str) -> None:
    """ERROR stands for these in the enumeration: none of them is accepted by anything."""
    finding = Finding(FW, S1, CHECK, status)
    for entries in ENTRY_SETS:
        result = judge([finding], entries, BACKLOG)
        assert [r.finding for r in result.refused] == [finding] and not result.ok


def test_an_entry_covers_nothing_else() -> None:
    entry = gap(S1, "FAIL")
    for framework, spec, check, status in itertools.product(
        (FW, "fb"), (S1, S2), (CHECK, "fa:d", "fb:c"), ("FAIL", "NOT_RUN")
    ):
        finding = Finding(framework, spec, check, status)
        same = (framework, spec, check, status) == (FW, S1, CHECK, "FAIL")
        assert entry.covers(finding) is same, finding
    every = gap(g.EVERY_SPEC, "NOT_RUN")
    assert every.covers(Finding(FW, "any.json", CHECK, "NOT_RUN"))
    assert not every.covers(Finding(FW, "any.json", CHECK, "FAIL"))


# -- an entry is bound to what the owner approved ------------------------------------------

CHANGES: dict[str, Any] = {
    "id": "another-id",
    "spec": S2,
    "check": "fa:other",
    "status": "NOT_RUN",
    "backlog_item": "FB-999",
    "reason": "a different reason, also long enough",
}


def test_every_field_is_covered_by_the_approval() -> None:
    approved = gap(S1, "FAIL")
    assert approved.approved
    fields = set(AcceptedGap.model_fields) - {"approval"}
    assert set(CHANGES) | {"framework"} == fields, "a field the test does not change"
    for name, value in CHANGES.items():
        changed = approved.model_copy(update={name: value})
        assert not changed.approved, f"changing {name} kept the approval"
    moved = approved.model_copy(update={"framework": "fb", "check": "fb:c"})
    assert not moved.approved


def test_an_approval_with_no_name_or_another_hash_is_none() -> None:
    approved = gap(S1, "FAIL")
    for approval in (
        approved.approval.model_copy(update={"by": ""}),
        approved.approval.model_copy(update={"by": "   "}),
        approved.approval.model_copy(update={"hash": "0" * 64}),
        g.Approval(),
    ):
        assert not approved.model_copy(update={"approval": approval}).approved


def test_an_unapproved_entry_accepts_nothing_whatever_it_says() -> None:
    for findings in FINDING_SETS:
        for entries in ENTRY_SETS:
            stripped = tuple(e.model_copy(update={"approval": g.Approval()}) for e in entries)
            assert judge(findings, stripped, BACKLOG).accepted == ()


# -- what an entry may say -------------------------------------------------------------------


def _raw(**changes: Any) -> dict[str, Any]:
    entry = {
        "id": "x",
        "framework": FW,
        "spec": S1,
        "check": CHECK,
        "status": "FAIL",
        "backlog_item": "FB-901",
        "reason": "a reason long enough to be a reason",
    }
    return {**entry, **changes}


@pytest.mark.parametrize(
    "changes",
    [
        {"spec": g.EVERY_SPEC},  # a failure for every spec
        {"check": "fb:c"},  # another framework's check
        {"spec": "s1"},  # not a spec's file name
        {"status": "ERROR"},
        {"status": "NOT_IMPLEMENTED"},
        {"status": "PASS"},
        {"backlog_item": "nothing"},
        {"reason": "short"},
        {"surprise": True},
        {"id": "Not An Id"},
    ],
)
def test_an_entry_that_could_hide_a_fault_cannot_be_written(changes: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        AcceptedGap.model_validate(_raw(**changes))


def _file(tmp_path: Path, entries: list[dict[str, Any]], text: str | None = None) -> Path:
    path = tmp_path / g.FILE_NAME
    document = {"title": "t", "description": "d", "gaps": entries}
    path.write_text(text if text is not None else json.dumps(document), encoding="utf-8")
    return path


def test_two_entries_that_cover_the_same_findings_are_refused(tmp_path: Path) -> None:
    keys = [(S1, "NOT_RUN"), (S2, "NOT_RUN"), (g.EVERY_SPEC, "NOT_RUN"), (S1, "FAIL")]
    for (spec_a, status_a), (spec_b, status_b) in itertools.combinations_with_replacement(keys, 2):
        entries = [
            _raw(id="a", spec=spec_a, status=status_a),
            _raw(id="b", spec=spec_b, status=status_b),
        ]
        loaded, problems = g.load(_file(tmp_path, entries))
        overlap = status_a == status_b and (spec_a == spec_b or g.EVERY_SPEC in (spec_a, spec_b))
        assert bool(problems) is overlap, (spec_a, status_a, spec_b, status_b, problems)
        assert len(loaded) == 2


@pytest.mark.parametrize(
    ("text", "says"),
    [
        ("{", "not readable as JSON"),
        ('{"title": "t", "title": "u", "description": "d", "gaps": []}', "written twice"),
        ('{"title": "t", "description": "d"}', "gaps"),
        ('{"title": "t", "description": "d", "gaps": [], "more": 1}', "more"),
    ],
)
def test_a_file_that_cannot_be_read_accepts_nothing(tmp_path: Path, text: str, says: str) -> None:
    loaded, problems = g.load(_file(tmp_path, [], text=text))
    assert loaded == [] and problems and says in " ".join(problems)


def test_a_missing_file_accepts_nothing(tmp_path: Path) -> None:
    loaded, problems = g.load(tmp_path / "absent.json")
    assert loaded == [] and "not readable" in problems[0]


# -- able to fail --------------------------------------------------------------------------


def _approval_ignored(findings, entries, backlog, problems=()):
    return judge(findings, [e.approved_by("anyone", "t") for e in entries], backlog, problems)


def _backlog_ignored(findings, entries, backlog, problems=()):
    return judge(findings, entries, dict.fromkeys(ITEMS.values(), True), problems)


def _unused_not_reported(findings, entries, backlog, problems=()):
    result = judge(findings, entries, backlog, problems)
    return GateResult(result.refused, (), result.closed, result.problems, result.accepted)


def _error_taken_for_a_failure(findings, entries, backlog, problems=()):
    as_failures = [
        Finding(f.framework, f.spec, f.check, "FAIL" if f.status == "ERROR" else f.status)
        for f in findings
    ]
    return judge(as_failures, entries, backlog, problems)


class _UnknownIsOpen(dict):  # type: ignore[type-arg]
    def get(self, key: object, default: object = None) -> object:
        return super().get(key, True)


def _unknown_item_taken_as_open(findings, entries, backlog, problems=()):
    return judge(findings, entries, _UnknownIsOpen(backlog), problems)


@pytest.mark.parametrize(
    ("broken", "says"),
    [
        (
            _approval_ignored,
            "found [s1.json NOT_RUN] with [* NOT_RUN (not approved, open item)]: "
            "the gate says pass; it must fail",
        ),
        (
            _backlog_ignored,
            "found [s1.json NOT_RUN] with [* NOT_RUN (approved, closed item)]: "
            "the gate says pass; it must fail",
        ),
        (
            _unused_not_reported,
            "found [nothing] with [* NOT_RUN (approved, open item)]: "
            "the gate says pass; it must fail",
        ),
        (
            _error_taken_for_a_failure,
            "found [s1.json ERROR] with [s1.json FAIL (approved, open item)]: "
            "the gate says pass; it must fail",
        ),
        (
            _unknown_item_taken_as_open,
            "found [s1.json NOT_RUN] with [* NOT_RUN (approved, unknown item)]: "
            "the gate says pass; it must fail",
        ),
    ],
    ids=[
        "approval-ignored",
        "backlog-ignored",
        "unused-not-reported",
        "error-accepted",
        "unknown-item-open",
    ],
)
def test_a_broken_gate_is_caught(broken: Callable[..., GateResult], says: str) -> None:
    assert counterexample(broken) == says
