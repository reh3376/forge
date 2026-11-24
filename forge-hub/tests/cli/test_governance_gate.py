"""``forge governance check``, ``gaps`` and ``gap-approve``: the gate's command line (FB-266).

The rule the gate applies is checked for every case in
``forge-core/tests/fxts/test_gaps_exhaustive.py``; the repository against its own gate in
``tests/governance/test_gate.py``. Here: that the commands print what was decided, exit
with it, and that an approval is recorded only as the owner gives it.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from typer.testing import CliRunner

from forge_core.fxts.fmts.runners import fmts_runner
from forge_core.fxts.shared import gaps
from forge_core.fxts.shared.runner import FxTSReport, FxTSVerdict, VerdictStatus
from forge_hub.cli import governance
from forge_hub.cli.main import app

#: The backlog these tests run against: one open item, one closed, nothing else.
BACKLOG = {"FB-901": True, "FB-902": False}
OPEN_ITEM, CLOSED_ITEM = "FB-901", "FB-902"


def _entry(**changes: Any) -> dict[str, Any]:
    return {
        "id": "facts-live",
        "framework": "facts",
        "spec": "*",
        "check": "facts:live",
        "status": "NOT_RUN",
        "backlog_item": OPEN_ITEM,
        "reason": "No check compares an adapter spec with the module's code.",
        **changes,
    }


def _run(status: VerdictStatus = VerdictStatus.NOT_RUN) -> governance.GateRun:
    report = FxTSReport(
        framework="FACTS",
        runner_version="0",
        target="forge-x",
        verdicts=[
            FxTSVerdict(
                check_id="facts:schema-valid", spec_ref="r", status=VerdictStatus.PASS, message="ok"
            ),
            FxTSVerdict(
                check_id="facts:live", spec_ref="r", status=status, message="NOT RUN (FB-271)"
            ),
        ],
    )
    return governance.GateRun("facts", Path("forge-x.facts.json"), report)


@pytest.fixture
def gate_on(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Point the commands at a gaps file of the test's own and at runs it chooses."""
    path = tmp_path / gaps.FILE_NAME

    def set_up(entries: list[dict[str, Any]], runs: list[governance.GateRun]) -> Path:
        path.write_text(
            json.dumps({"title": "t", "description": "d", "gaps": entries}, indent=2) + "\n",
            encoding="utf-8",
        )

        async def fake_runs() -> list[governance.GateRun]:
            return runs

        monkeypatch.setattr(governance, "GAPS_PATH", path)
        monkeypatch.setattr(governance, "gate_runs", fake_runs)
        monkeypatch.setattr(governance, "gate_problems", list)
        monkeypatch.setattr(fmts_runner, "load_backlog", lambda root: dict(BACKLOG))
        return path

    return set_up


def _cli(*args: str) -> tuple[int, str]:
    result = CliRunner().invoke(app, ["governance", *args])
    return result.exit_code, result.output


def test_an_unapproved_entry_lets_nothing_through(gate_on) -> None:
    gate_on([_entry()], [_run()])
    code, out = _cli("check")
    assert code == 1, out
    assert "REFUSED  facts forge-x.facts.json facts:live [NOT_RUN]" in out
    assert "is not approved by the owner as it is now" in out
    assert "Gate FAILED: 0 problem(s), 1 refused" in out

    code, out = _cli("gaps")
    assert (
        code == 0
        and f"facts-live: facts * facts:live [NOT_RUN] until {OPEN_ITEM}: NOT APPROVED" in out
    )


def test_the_owner_approves_and_the_gate_passes(gate_on) -> None:
    path = gate_on([_entry()], [_run()])
    code, out = _cli("gap-approve", "facts-live", "--by", "reh3376")
    assert code == 0, out
    assert "No permission check point is wired for governance:gap:approve" in out
    written = json.loads(path.read_text(encoding="utf-8"))["gaps"][0]
    assert written["approval"]["by"] == "reh3376"
    assert written["approval"]["hash"] == gaps.AcceptedGap.model_validate(written).content_hash

    code, out = _cli("check")
    assert code == 0, out
    assert "accepted facts-live: 1 finding(s)" in out and "Gate passed" in out


def test_an_approved_entry_changed_afterwards_counts_no_more(gate_on) -> None:
    path = gate_on([_entry()], [_run()])
    _cli("gap-approve", "facts-live", "--by", "reh3376")
    document = json.loads(path.read_text(encoding="utf-8"))
    document["gaps"][0]["reason"] = "Edited after the owner approved it, to say something else."
    path.write_text(json.dumps(document), encoding="utf-8")
    code, out = _cli("check")
    assert code == 1 and "not approved by the owner as it is now" in out


def test_a_closed_gap_stops_the_gate_until_its_entry_goes(gate_on) -> None:
    gate_on([_entry()], [])
    _cli("gap-approve", "facts-live", "--by", "reh3376")
    code, out = _cli("check")
    assert code == 1
    assert "UNUSED   facts-live: it covers nothing that was found" in out


def test_an_entry_whose_item_is_closed_stops_the_gate(gate_on) -> None:
    gate_on([_entry(backlog_item=CLOSED_ITEM)], [_run()])
    _cli("gap-approve", "facts-live", "--by", "reh3376")
    code, out = _cli("check")
    assert code == 1
    assert f"CLOSED   facts-live: its backlog item {CLOSED_ITEM} is closed" in out


def test_an_error_is_refused_whatever_the_file_says(gate_on) -> None:
    gate_on([_entry(status="FAIL", spec="forge-x.facts.json")], [_run(VerdictStatus.ERROR)])
    _cli("gap-approve", "facts-live", "--by", "reh3376")
    code, out = _cli("check")
    assert code == 1
    assert "[ERROR]: a check with the status ERROR is never accepted" in out


def test_a_file_with_overlapping_entries_is_a_problem(gate_on) -> None:
    gate_on([_entry(), _entry(id="facts-live-x", spec="forge-x.facts.json")], [_run()])
    code, out = _cli("check")
    assert code == 1
    assert "PROBLEM  accepted-gaps.json: the entries 'facts-live' and 'facts-live-x'" in out
    code, out = _cli("gaps")
    assert code == 1 and "PROBLEM" in out


@pytest.mark.parametrize(
    ("args", "says"),
    [
        (("gap-approve", "facts-live", "--by", "  "), "cannot be empty"),
        (
            ("gap-approve", "no-such-gap", "--by", "reh3376"),
            "No accepted gap with the id: no-such-gap",
        ),
    ],
)
def test_an_approval_needs_a_name_and_an_entry(gate_on, args: tuple[str, ...], says: str) -> None:
    path = gate_on([_entry()], [_run()])
    before = path.read_text(encoding="utf-8")
    code, out = _cli(*args)
    assert code == 1 and says in out
    assert path.read_text(encoding="utf-8") == before


def test_the_repository_file_is_the_one_the_gate_reads() -> None:
    assert governance.GAPS_PATH == governance.REPO_ROOT / "forge-core" / "fxts" / gaps.FILE_NAME
    entries, problems = gaps.load(governance.GAPS_PATH)
    assert problems == [] and entries
