"""Move forge-core's documents into forge-core/docs (D-17 §10.5, BACKLOG FB-227 step 3).

Run once, from the repository root, on a clean tree:
    python scripts/restructure/move_forge_core_docs.py

The framework pages, the FACTS developer guide, the module builder guide and the
manufacturing entity catalog move with ``git mv``. Then every Markdown link in the
repository is recomputed: a link is read against where its file was, and written against
where its file and its target are now, so links into, out of and between the moved
documents all keep working. Plain mentions of the old paths are rewritten too. Signed
decision records and the archive are not touched (D-17 §7).
"""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MOVES = {
    "docs/FxTS": "forge-core/docs/fxts",
    "docs/governance/facts-developer-guide.md": "forge-core/docs/facts-developer-guide.md",
    "docs/MODULE_BUILDER.md": "forge-core/docs/module-builder.md",
    "docs/core/manufacturing-entity-catalog.md": "forge-core/docs/manufacturing-entity-catalog.md",
}
UNTOUCHED = ("docs/decisions/", "archive/", "modules/Forge MES/", "scripts/restructure/")
LINK = re.compile(r"(\]\()([^)\s]+)(\))")


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=True, capture_output=True, text=True
    ).stdout


def moved(path: str) -> str:
    """Where a repository path is after the move."""
    for old, new in MOVES.items():
        if path == old or path.startswith(old + "/"):
            return new + path[len(old) :]
    return path


def main() -> None:
    if git("status", "--porcelain", "--untracked-files=no").strip():
        raise SystemExit("the tree has uncommitted changes; commit or stash them first")
    before = [name for name in git("ls-files", "*.md").split("\n") if name]
    for old, new in MOVES.items():
        (ROOT / new).parent.mkdir(parents=True, exist_ok=True)
        git("mv", old, new)

    relinked = 0
    for old_name in before:
        if old_name.startswith(UNTOUCHED):
            continue
        new_name = moved(old_name)
        path = ROOT / new_name
        text = path.read_text(encoding="utf-8")

        def fix(match: re.Match[str], old_name: str = old_name, new_name: str = new_name) -> str:
            target = match.group(2)
            if re.match(r"^[a-z][a-z0-9+.-]*:|^#|^/", target):
                return match.group(0)
            link, _, fragment = target.partition("#")
            absolute = os.path.normpath(os.path.join(os.path.dirname(old_name), link))
            if absolute.startswith(".."):
                return match.group(0)
            destination = moved(absolute.replace(os.sep, "/"))
            if destination == absolute and new_name == old_name:
                return match.group(0)
            relative = os.path.relpath(destination, os.path.dirname(new_name) or ".")
            if link.endswith("/") and not relative.endswith("/"):
                relative += "/"
            rebuilt = relative + (f"#{fragment}" if fragment else "")
            return f"{match.group(1)}{rebuilt}{match.group(3)}"

        new_text = LINK.sub(fix, text)
        if new_text != text:
            path.write_text(new_text, encoding="utf-8")
            relinked += 1

    mentions = 0
    names = [n for n in git("ls-files").split("\n") if n and not n.startswith(UNTOUCHED)]
    for name in names:
        path = ROOT / name
        if path.suffix not in {".md", ".py", ".json", ".toml", ".yml", ".sh"} or not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        new_text = text
        for old, new in MOVES.items():
            new_text = new_text.replace(old, new)
        if new_text != text:
            path.write_text(new_text, encoding="utf-8")
            mentions += 1
    print(f"moved; links recomputed in {relinked} files, path mentions rewritten in {mentions}")


if __name__ == "__main__":
    main()
