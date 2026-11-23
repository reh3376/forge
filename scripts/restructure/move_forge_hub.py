"""Move the hub into its own folder (D-17 step 4, BACKLOG FB-200: the package).

Run once, from the repository root, on a clean tree:  python scripts/restructure/move_forge_hub.py

It moves the hub's packages out of ``src/forge`` into ``forge-hub/src/python/forge_hub``
with ``git mv`` (so history follows), then rewrites every dotted name and every file path
that named the old place. The hub's end of the transport becomes ``forge_hub.link``, beside
the module's end in ``forge_core.link``.

Three kinds of text look like a hub package name and are not one, and are left alone:

- names that are data: the metric ``forge.ingest.refused`` and the exchange
  ``forge.curation.products``;
- the scripting API a module's scripts see (``@forge.api.route``, ``forge.api.Request``),
  which is forge-core's SDK and no hub package;
- every JSON and proto file: a spec or a schema changes only by a stamp and the owner's
  approval, never by a rename script (the lesson of FB-199).

It is kept in the repository so the change can be read and reproduced; it is not run again.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HUB = "forge-hub/src/python/forge_hub"
PACKAGES = (
    "api",
    "gateway",
    "ingest",
    "storage",
    "registry",
    "context",
    "curation",
    "broker",
    "observer",
    "cli",
)
NAMES = "|".join(PACKAGES)
#: What may follow a package name and makes the whole a name of data or of the scripting API.
NOT_A_MODULE = r"(?!\.(?:route|Request|Response|json_response|refused|products)\b)"

MOVES: list[tuple[str, str]] = [
    *[(f"src/forge/{name}", f"{HUB}/{name}") for name in PACKAGES],
    ("src/forge/transport", f"{HUB}/link"),
    ("src/forge/conformance.py", f"{HUB}/conformance.py"),
]
DOTTED: list[tuple[str, str]] = [
    (r"(?<![\w.@])forge\.transport(?![\w])", "forge_hub.link"),
    (rf"(?<![\w.@])forge\.({NAMES})(?![\w]){NOT_A_MODULE}", r"forge_hub.\1"),
    (r"(?<![\w.@])forge\.conformance(?![\w])", "forge_hub.conformance"),
    (r"from forge import conformance(?![\w])", "from forge_hub import conformance"),
]
PATHS: list[tuple[str, str]] = [
    (r"src/forge/transport(?![\w])", f"{HUB}/link"),
    (rf"src/forge/({NAMES})(?![\w])", rf"{HUB}/\1"),
    (r"src/forge/conformance\.py", f"{HUB}/conformance.py"),
]

# Not rewritten at all: signed records keep their text (D-17 §7), the archive points into
# history, and these trees are not Python of this project.
UNTOUCHED = (
    "docs/decisions/",
    "archive/",
    "modules/Forge MES/",
    "forge-core/src/go/",
    "scripts/restructure/",
    "scripts/tutorial-forge/",
    "uv.lock",
)
# Dotted names are not rewritten here: these speak of the scripting API, whose namespace
# is ``forge`` whatever the hub's package is called.
SCRIPTING = (
    "docs/p7-forge-ot/",
    "docs/p7-ot-module/",
    "forge-core/src/python/forge_core/sdk/scripting/",
    "forge-core/tests/sdk/",
)
TEXT_SUFFIXES = {".py", ".md", ".toml", ".yml", ".yaml", ".sh", ".txt", ".cfg"}
TEXT_NAMES = {"Makefile", "CODEOWNERS", ".gitignore", ".gitleaks.toml", ".dockerignore"}


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=True, capture_output=True, text=True
    ).stdout


def move() -> None:
    (ROOT / HUB).mkdir(parents=True, exist_ok=True)
    for source, target in MOVES:
        git("mv", source, target)


def rewrite() -> int:
    dotted = [(re.compile(old), new) for old, new in DOTTED]
    paths = [(re.compile(old), new) for old, new in PATHS]
    changed = 0
    for name in git("ls-files").split("\n"):
        if not name or name.startswith(UNTOUCHED):
            continue
        path = ROOT / name
        is_text = path.suffix in TEXT_SUFFIXES or path.name in TEXT_NAMES
        if not is_text and not path.name.startswith("Dockerfile"):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, FileNotFoundError):
            continue
        new = text
        for pattern, replacement in paths:
            new = pattern.sub(replacement, new)
        if not name.startswith(SCRIPTING):
            for pattern, replacement in dotted:
                new = pattern.sub(replacement, new)
        if new != text:
            path.write_text(new, encoding="utf-8")
            changed += 1
    return changed


if __name__ == "__main__":
    if git("status", "--porcelain", "--untracked-files=no").strip():
        raise SystemExit("the tree has uncommitted changes; commit or stash them first")
    move()
    print(f"moved; {rewrite()} files rewritten")
