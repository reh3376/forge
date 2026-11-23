"""Move the finished entries of BACKLOG.md into BACKLOG-DONE.md (BACKLOG FB-247).

Run once, from the repository root:  python scripts/backlog/split_closed.py

The backlog's rule was that a fixed entry is removed and its commit mentioned. In practice
entries were marked "Done" and left in place, most without a commit. The owner, 2026-11-23:
finished entries move to a closed log, each with the date and the commit or pull request
that fixed it, so that BACKLOG.md holds only open work and every id stays findable.

For each finished entry the script looks in the history of ``main`` for the commit that
names the item on the day it was closed (or the first one after), and for the pull request
that brought that commit in. Where it finds none it says so; it never invents one.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OPEN = ROOT / "BACKLOG.md"
DONE = ROOT / "BACKLOG-DONE.md"
ROW = re.compile(r"^\| (FB-\d+) \| ([^|]+) \| (.*) \|$")
CLOSED = ("**Done", "**Fixed")
#: Closed by a decision of the owner and not by a change.
DECIDED = {"FB-147", "FB-225"}
DATE = re.compile(r"(\d{4}-\d{2}-\d{2})")

HEAD = """# Forge Backlog: closed entries

Every entry of [`BACKLOG.md`](BACKLOG.md) that is finished, moved here when it was closed
(the owner, 2026-11-23). An id is never reused, so an id cited anywhere in the repository is
in one of the two files. `Closed` is the date in the entry; `By` is the commit that names
the item on that day and the pull request that brought it into `main`. Entries closed
before this file existed were given both from the history by
`scripts/backlog/split_closed.py`; "not found" means the history names no commit for it.

An entry closed in the change being written says `this change` until that change is merged
and has a pull request number.
"""


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=True, capture_output=True, text=True
    ).stdout


def fixed_by(item: str, closed: str) -> str:
    """``<sha> (PR n)`` for the commit that closed ``item``, from the history of main."""
    number = int(item.split("-")[1])
    pattern = rf"FB-0*{number}([^0-9]|$)"
    log = git("log", "origin/main", "--no-merges", "-E", f"--grep={pattern}", "--format=%H %cs")
    commits = [line.split() for line in log.splitlines() if line]
    if not commits:
        return "not found"
    commits.sort(key=lambda pair: pair[1])
    on_or_after = [pair for pair in commits if closed and pair[1] >= closed]
    sha = (on_or_after or commits[::-1])[0][0]
    merges = git(
        "log", "--merges", "--first-parent", "--ancestry-path", f"{sha}..origin/main", "--format=%s"
    ).splitlines()
    found = re.search(r"#(\d+)", merges[-1]) if merges else None
    return f"`{sha[:8]}`" + (f" (PR {found.group(1)})" if found else "")


def is_closed(item: str, problem: str) -> bool:
    if item in DECIDED:
        return True
    return problem.startswith(CLOSED) and not problem.startswith("**Done in part")


def main() -> None:
    kept: list[str] = []
    closed: list[tuple[str, list[str]]] = []  # (area heading, rows)
    area = ""
    for line in OPEN.read_text(encoding="utf-8").split("\n"):
        if line.startswith("## "):
            area = line
        match = ROW.match(line)
        if not match:
            kept.append(line)
            continue
        item, severity, rest = match.group(1), match.group(2).strip(), match.group(3)
        problem = rest.split(" | ")[0]
        if not is_closed(item, problem):
            kept.append(line)
            continue
        status = problem[: problem.find("**", 2) + 2] if problem.find("**", 2) > 0 else problem
        date = DATE.search(status)
        day = date.group(1) if date else ""
        row = f"| {item} | {severity} | {day or 'not dated'} | {fixed_by(item, day)} | {rest} |"
        if not closed or closed[-1][0] != area:
            closed.append((area, []))
        closed[-1][1].append(row)

    parts = [HEAD]
    for heading, rows in closed:
        parts += [
            "",
            heading,
            "",
            "| ID | Sev | Closed | By | Problem | Where | What was done |",
            "|----|-----|--------|----|---------|-------|---------------|",
            *rows,
        ]
    DONE.write_text("\n".join(parts) + "\n", encoding="utf-8")
    OPEN.write_text("\n".join(kept), encoding="utf-8")
    total = sum(len(rows) for _, rows in closed)
    missing = sum(row.count("| not found |") for _, rows in closed for row in rows)
    print(f"{total} entries moved to {DONE.name}; {missing} without a commit in the history")


if __name__ == "__main__":
    main()
