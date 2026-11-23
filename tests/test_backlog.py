"""The backlog holds open work; a finished entry is in the closed log (BACKLOG FB-247).

The owner, 2026-11-23, on reading ``BACKLOG.md``: its rule said a fixed entry is removed
and its commit mentioned, and 118 entries marked Done were still in the file, most without
a commit. Finished entries are now in ``BACKLOG-DONE.md``, each with the date and the commit
or pull request that fixed it. This file holds the two to that, so the habit of marking an
entry Done and leaving it cannot return unnoticed.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

import pytest

from forge_core.fxts.fmts.runners.fmts_runner import load_backlog

REPO = Path(__file__).resolve().parents[1]
OPEN = (REPO / "BACKLOG.md").read_text(encoding="utf-8")
DONE = (REPO / "BACKLOG-DONE.md").read_text(encoding="utf-8")
ROW = re.compile(r"^\| (FB-\d+) \| ", re.MULTILINE)
PENDING = "this change"
#: How a finished entry begins. "Partly done" is open: the entry says what is left.
FINISHED = ("**Done", "**Fixed")
BY = re.compile(
    rf"^(?:the owner's decision; recorded in )?(?:`[0-9a-f]{{8}}`(?: \(PR \d+\))?(?:, with FB-\d+)?"
    rf"|{PENDING}|not found)$"
)


def _cells(text: str) -> dict[str, list[str]]:
    rows = {}
    for line in text.split("\n"):
        if ROW.match(line):
            cells = [cell.strip() for cell in line.strip().strip("|").split(" | ")]
            rows[cells[0]] = cells
    return rows


def _git(*args: str) -> str | None:
    done = subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True, check=False)
    return done.stdout if done.returncode == 0 else None


def test_no_finished_entry_is_left_in_the_backlog() -> None:
    left = [item for item, cells in _cells(OPEN).items() if cells[2].startswith(FINISHED)]
    assert not left, (
        f"{left}: finished entries move to BACKLOG-DONE.md in the change that finishes them, "
        f"with the date and '{PENDING}' in the By column"
    )


def test_an_id_is_in_one_file_only_and_is_never_reused() -> None:
    open_ids, done_ids = ROW.findall(OPEN), ROW.findall(DONE)
    assert len(open_ids) == len(set(open_ids)), "an id is twice in BACKLOG.md"
    assert len(done_ids) == len(set(done_ids)), "an id is twice in BACKLOG-DONE.md"
    assert not set(open_ids) & set(done_ids), sorted(set(open_ids) & set(done_ids))


def test_every_closed_entry_says_when_and_by_what() -> None:
    for item, cells in _cells(DONE).items():
        assert len(cells) == 7, f"{item}: {len(cells)} columns"
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}|not dated", cells[2]), (
            f"{item}: Closed {cells[2]!r}"
        )
        assert BY.match(cells[3]), f"{item}: By {cells[3]!r}"


def test_an_id_cited_in_the_working_documents_exists() -> None:
    """A cited id is in the backlog or in the closed log: closing an entry loses nothing."""
    known = set(load_backlog(REPO))
    assert len(known) > 240
    cited: dict[str, str] = {}
    for name in ("CLAUDE.md", "README.md", "docs/WHERE-WE-ARE.md", "docs/ROADMAP.md"):
        for item in re.findall(r"FB-\d{3,}", (REPO / name).read_text(encoding="utf-8")):
            cited.setdefault(item, name)
    unknown = {item: where for item, where in cited.items() if item not in known}
    assert not unknown, f"cited and in neither file: {unknown}"


def test_the_loader_reads_both_files(tmp_path: Path) -> None:
    (tmp_path / "BACKLOG.md").write_text(
        "| FB-900 | Low | Still open. | here | fix |\n"
        "| FB-901 | Low | **Done 2026-01-01.** Left here by mistake. | here | fix |\n",
        encoding="utf-8",
    )
    (tmp_path / "BACKLOG-DONE.md").write_text(
        "| FB-902 | Low | 2026-01-02 | `0123abcd` (PR 9) | **Done 2026-01-02.** x | here | fix |\n",
        encoding="utf-8",
    )
    assert load_backlog(tmp_path) == {"FB-900": True, "FB-901": False, "FB-902": False}


def test_this_change_is_replaced_once_the_change_is_merged() -> None:
    """An entry says ``this change`` only until its pull request is merged.

    On ``main`` straight after the merge it still says so, because the text was written
    before the merge. Once any work follows that merge, the entry must name the commit and
    the pull request: that is the first thing done after "pr N merged".
    """
    pending = [item for item, cells in _cells(DONE).items() if cells[3] == PENDING]
    if not pending:
        return
    merges = _git("log", "--merges", "--first-parent", "-n", "1", "--format=%H")
    if not merges or not merges.strip():
        pytest.skip("no merge commit in this checkout's history: nothing to compare against")
    latest = merges.strip()
    after = _git("rev-list", "--count", f"{latest}..HEAD")
    assert after is not None
    if int(after) == 0:
        return  # the merge commit itself: the text inside it was written before the merge
    stale = []
    for item in pending:
        number = int(item.split("-")[1])
        named = _git(
            "log", latest, "--no-merges", "-E", f"--grep=FB-0*{number}([^0-9]|$)", "--format=%h"
        )
        if named and named.strip():
            stale.append(item)
    assert not stale, (
        f"{stale} still say '{PENDING}', and a commit that names them is already merged: "
        "write the commit and the pull request in the By column"
    )
