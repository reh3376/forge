"""The documents carry today's state on every push (decision A-8; owner, 2026-11-19).

The tutorial's opening line says when it was last verified and against which merged
pull request. The owner found it six days and twenty-four pull requests stale. It must
move with every push, together with the state document's status line, so the two are
checked against each other and against the repository's history here.
"""

from __future__ import annotations

import re
import subprocess
from datetime import date, timedelta
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
TUTORIAL = (REPO / "docs" / "tutorial.md").read_text(encoding="utf-8")
STATE = (REPO / "docs" / "WHERE-WE-ARE.md").read_text(encoding="utf-8")


def _git(*args: str) -> str:
    done = subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True, check=False)
    return done.stdout


def _tutorial() -> tuple[str, int]:
    match = re.search(
        r"^`Last verified: (\d{4}-\d{2}-\d{2})` .*?merge of PR (\d+)", TUTORIAL, re.MULTILINE
    )
    assert match, "the tutorial's opening has no `Last verified: <date>` ... PR <n> line"
    return match.group(1), int(match.group(2))


def _state() -> tuple[str, int]:
    match = re.search(
        r"^\*\*Status date:\*\* (\d{4}-\d{2}-\d{2}) .*?last merged PR: (\d+)",
        STATE,
        re.MULTILINE,
    )
    assert match, "WHERE-WE-ARE.md has no status line with a date and the last merged PR"
    return match.group(1), int(match.group(2))


def test_the_tutorial_and_the_state_document_agree() -> None:
    assert _tutorial() == _state()


def _merged() -> list[tuple[int, str]]:
    """``(number, commit)`` of every pull request merge in the recent history, newest first."""
    log = _git("log", "-n", "200", "--format=%H %s")
    found = re.findall(r"^([0-9a-f]{40}) Merge pull request #(\d+) ", log, re.MULTILINE)
    return sorted(((int(number), commit) for commit, number in found), reverse=True)


def allowed_numbers(merged: list[tuple[int, str]], work_after_newest: int) -> set[int]:
    """The pull request numbers the documents may name, given the history.

    Once any work follows the newest merge, the documents must name that merge: this is
    the state of every push. The merge commit itself is the one exception. It is made
    by the merge, so the documents inside it were written before its number existed
    and name the pull request before it. Without this the check fails on ``main``
    after every merge (BACKLOG FB-172: it did, on PR 121 and PR 122).
    """
    if not merged:  # a shallow checkout without merge commits: nothing to compare against
        return set()
    newest = merged[0][0]
    if work_after_newest > 0:
        return {newest}
    return {newest} | ({merged[1][0]} if len(merged) > 1 else set())


def test_the_last_merged_pull_request_is_the_one_in_history() -> None:
    """The number in both documents is the newest pull request merged into this history."""
    merged = _merged()
    if not merged:
        return
    after = _git("rev-list", "--no-merges", "--count", f"{merged[0][1]}..HEAD").strip()
    allowed = allowed_numbers(merged, int(after or 0))
    if len(merged) == 1 and not int(after or 0):
        return  # a shallow checkout that ends at the merge: the merge before it is not visible
    assert _state()[1] in allowed, (
        f"the documents say PR {_state()[1]}; the history allows {sorted(allowed)} "
        f"(newest merged pull request {merged[0][0]}, {after or 0} commit(s) after it)"
    )


def test_what_the_documents_may_name() -> None:
    history = [(122, "b" * 40), (121, "a" * 40)]
    assert allowed_numbers(history, work_after_newest=1) == {122}  # a push: must be current
    assert allowed_numbers(history, work_after_newest=0) == {122, 121}  # the merge commit
    assert allowed_numbers(history[:1], work_after_newest=0) == {122}
    assert allowed_numbers([], work_after_newest=3) == set()


def test_the_status_date_is_not_older_than_the_newest_commit() -> None:
    newest = _git("log", "-n", "1", "--format=%cs").strip()
    if not newest:
        return
    # The documents are written before the commit that carries them, and CI may sit in
    # another time zone, so allow the day before the newest commit and nothing older.
    earliest = (date.fromisoformat(newest) - timedelta(days=1)).isoformat()
    assert _state()[0] >= earliest, (_state()[0], newest)
