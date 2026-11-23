"""The archive of each major directory: an index of what was retired, not the content.

A retired document is removed from the tree and gets a row in ``archive/archive.json`` of
the major directory it belonged to: what it was for, why it went, what replaced it, and the
commit that still holds it (D-17 §10, A-4). The content stays in the history, so nothing in
the tree can be read as current by mistake. ``archive/README.md`` is generated from the
index and a test fails when it is stale.

    forge archive list              every row of every archive
    forge archive show <id>         the retired file, read from the history
    forge archive index             rewrite each archive/README.md from its index
"""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Any

import typer

REPO_ROOT = Path(__file__).resolve().parents[5]
INDEX_NAME = "archive.json"
README_NAME = "README.md"
ENTRY_FIELDS = (
    "id",
    "name",
    "purpose",
    "retired",
    "reason",
    "replaced_by",
    "commit",
    "paths",
)
ID_PATTERN = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
COMMIT_PATTERN = re.compile(r"^[0-9a-f]{40}$")
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")

archive_app = typer.Typer(help="What was retired from each major directory, and where it is.")


@dataclass(frozen=True)
class Archive:
    """One major directory's archive index."""

    directory: Path  # the major directory, relative to the repository root
    document: dict[str, Any]

    @property
    def entries(self) -> list[dict[str, Any]]:
        return list(self.document.get("entries", []))


def major_directories(root: Path) -> list[Path]:
    """The root, forge-core, forge-hub and each module folder (D-17 §10.3), as they exist."""
    found = [Path()]
    found += [Path(name) for name in ("forge-core", "forge-hub") if (root / name).is_dir()]
    modules = root / "forge-modules"
    if modules.is_dir():
        found += sorted(p.relative_to(root) for p in modules.iterdir() if p.is_dir())
    return found


def load_archives(root: Path = REPO_ROOT) -> list[Archive]:
    archives = []
    for directory in major_directories(root):
        index = root / directory / "archive" / INDEX_NAME
        if index.is_file():
            archives.append(Archive(directory, json.loads(index.read_text(encoding="utf-8"))))
    return archives


def problems(archive: Archive) -> list[str]:
    """What is wrong with an index, without looking at the history."""
    found: list[str] = []
    seen: set[str] = set()
    for position, entry in enumerate(archive.entries):
        where = f"entries[{position}]"
        missing = [name for name in ENTRY_FIELDS if name not in entry]
        if missing or set(entry) - set(ENTRY_FIELDS):
            extra = sorted(set(entry) - set(ENTRY_FIELDS))
            found.append(f"{where}: missing {missing}, unknown {extra}")
            continue
        if not ID_PATTERN.match(str(entry["id"])):
            found.append(f"{where}: id {entry['id']!r} is not a kebab-case id")
        if entry["id"] in seen:
            found.append(f"{where}: id {entry['id']!r} is repeated")
        seen.add(entry["id"])
        if not COMMIT_PATTERN.match(str(entry["commit"])):
            found.append(f"{where}: commit is not a full 40-character hash")
        if not DATE_PATTERN.match(str(entry["retired"])):
            found.append(f"{where}: retired is not a date (YYYY-MM-DD)")
        if not isinstance(entry["paths"], list) or not entry["paths"]:
            found.append(f"{where}: paths is not a non-empty list")
        for name in ("name", "purpose", "reason"):
            if not str(entry[name]).strip():
                found.append(f"{where}: {name} is empty")
    return found


def _git(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, check=False)


def history_is_complete(root: Path = REPO_ROOT) -> bool:
    """False in a shallow clone, where an old commit may be absent."""
    return _git(root, "rev-parse", "--is-shallow-repository").stdout.strip() == "false"


def missing_from_history(archive: Archive, root: Path = REPO_ROOT) -> list[str]:
    """Each path of each row that its commit does not hold."""
    gone = []
    for entry in archive.entries:
        for path in entry.get("paths", []):
            if _git(root, "cat-file", "-e", f"{entry['commit']}:{path}").returncode != 0:
                gone.append(f"{entry['id']}: {path} is not in commit {entry['commit'][:12]}")
    return gone


def still_in_tree(archive: Archive, root: Path = REPO_ROOT) -> list[str]:
    """A retired path that exists again: the row is wrong or the file came back."""
    return [
        f"{entry['id']}: {path} exists in the tree"
        for entry in archive.entries
        for path in entry.get("paths", [])
        if (root / path).exists()
    ]


def render(archive: Archive) -> str:
    """The generated README of one archive."""
    scope = archive.document.get("scope", archive.directory.as_posix() or "forge")
    lines = [
        f"# Archive of {scope}",
        "",
        "Generated from `archive.json` by `forge archive index`. Do not edit.",
        "",
        "What was retired from this directory. The content is not kept in the tree, so it",
        "cannot be read as current; every row names the commit that still holds it.",
        "Read one with `forge archive show <id>`.",
        "",
        "| Id | Was | For | Retired | Why | Replaced by | Files |",
        "|---|---|---|---|---|---|---|",
    ]
    for entry in archive.entries:
        replaced = f"`{entry['replaced_by']}`" if entry["replaced_by"] else "nothing"
        lines.append(
            f"| `{entry['id']}` | {entry['name']} | {entry['purpose']} | {entry['retired']} "
            f"| {entry['reason']} | {replaced} | {len(entry['paths'])} at "
            f"`{entry['commit'][:12]}` |"
        )
    return "\n".join(lines) + "\n"


def find(entry_id: str, root: Path = REPO_ROOT) -> dict[str, Any] | None:
    for archive in load_archives(root):
        for entry in archive.entries:
            if entry.get("id") == entry_id:
                return entry
    return None


@archive_app.command("list")
def list_entries() -> None:
    """Every retired document, by major directory."""
    archives = load_archives()
    if not archives:
        typer.echo("no archive exists yet")
        return
    for archive in archives:
        typer.echo(f"{archive.directory.as_posix() or '.'}/archive  ({len(archive.entries)})")
        for entry in archive.entries:
            typer.echo(f"  {entry['id']:<32} {entry['retired']}  {entry['name']}")


@archive_app.command("show")
def show(
    entry_id: Annotated[str, typer.Argument(help="The row's id, as `forge archive list` shows")],
    path: Annotated[
        str | None, typer.Option("--path", help="Which file, when the row has several")
    ] = None,
) -> None:
    """Print a retired file from the history."""
    entry = find(entry_id)
    if entry is None:
        typer.echo(f"no archive row has the id '{entry_id}'", err=True)
        raise typer.Exit(1)
    paths = list(entry["paths"])
    if path is None and len(paths) > 1:
        typer.echo(f"'{entry_id}' has {len(paths)} files; choose one with --path:")
        for name in paths:
            typer.echo(f"  {name}")
        return
    chosen = path or paths[0]
    if chosen not in paths:
        typer.echo(f"'{chosen}' is not a file of '{entry_id}'", err=True)
        raise typer.Exit(1)
    done = _git(REPO_ROOT, "show", f"{entry['commit']}:{chosen}")
    if done.returncode != 0:
        typer.echo(
            f"commit {entry['commit'][:12]} does not hold {chosen} here "
            f"(a shallow clone? fetch the full history): {done.stderr.strip()}",
            err=True,
        )
        raise typer.Exit(1)
    typer.echo(done.stdout, nl=False)


@archive_app.command("index")
def write_indexes() -> None:
    """Rewrite each archive/README.md from its archive.json."""
    for archive in load_archives():
        target = REPO_ROOT / archive.directory / "archive" / README_NAME
        text = render(archive)
        changed = not target.is_file() or target.read_text(encoding="utf-8") != text
        target.write_text(text, encoding="utf-8")
        typer.echo(f"{target.relative_to(REPO_ROOT)}: {'written' if changed else 'current'}")
