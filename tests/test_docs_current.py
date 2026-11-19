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


def test_the_last_merged_pull_request_is_the_one_in_history() -> None:
    """The number in both documents is the newest pull request merged into this history."""
    log = _git("log", "-n", "200", "--format=%s")
    merged = [int(n) for n in re.findall(r"^Merge pull request #(\d+) ", log, re.MULTILINE)]
    if not merged:  # a shallow checkout without merge commits: nothing to compare against
        return
    assert _state()[1] == max(merged), (
        f"the documents say PR {_state()[1]}; the newest merged pull request is {max(merged)}"
    )


def test_the_status_date_is_not_older_than_the_newest_commit() -> None:
    newest = _git("log", "-n", "1", "--format=%cs").strip()
    if not newest:
        return
    # The documents are written before the commit that carries them, and CI may sit in
    # another time zone, so allow the day before the newest commit and nothing older.
    earliest = (date.fromisoformat(newest) - timedelta(days=1)).isoformat()
    assert _state()[0] >= earliest, (_state()[0], newest)
