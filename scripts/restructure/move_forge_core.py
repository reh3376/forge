"""Move forge-core into its own folder (D-17 step 3, BACKLOG FB-199).

Run once, from the repository root, on a clean tree:  python scripts/restructure/move_forge_core.py

It moves the packages that hubs and modules share out of ``src/forge`` into
``forge-core/src/python/forge_core`` with ``git mv`` (so history follows), then rewrites
every dotted name and every file path that named the old place, in every tracked text file
except the ones listed in ``UNTOUCHED``. It is kept in the repository so the change can be
read and reproduced; it is not run again.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CORE = "forge-core/src/python/forge_core"
GENERIC = ("csv_file", "mqtt_sparkplug", "opcua", "rest_generic")
LINK = (
    "spoke_client",
    "spoke_callback",
    "grpc_channel",
    "transport_adapter",
    "serialization",
    "proto_bridge",
)

# (from, to), in order: files and folders moved with git mv
MOVES: list[tuple[str, str]] = [
    ("src/forge/governance/fmts/conformance.py", "src/forge/conformance.py"),
    ("src/forge/governance", f"{CORE}/fxts"),
    ("src/forge/proto_gen", f"{CORE}/proto_gen"),
    ("src/forge/sdk", f"{CORE}/sdk"),
    ("src/forge/adapters/base", f"{CORE}/adapter"),
    *[(f"src/forge/adapters/{name}", f"{CORE}/adapter/generic/{name}") for name in GENERIC],
    *[(f"src/forge/transport/{name}.py", f"{CORE}/link/{name}.py") for name in LINK],
]
# everything directly in src/forge/core becomes the top of forge_core
CORE_SOURCE = "src/forge/core"

DOTTED: list[tuple[str, str]] = [
    (r"forge\.adapters\.base", "forge_core.adapter"),
    (rf"forge\.adapters\.({'|'.join(GENERIC)})", r"forge_core.adapter.generic.\1"),
    (rf"forge\.transport\.({'|'.join(LINK)})", r"forge_core.link.\1"),
    (r"forge\.governance\.fmts\.conformance", "forge.conformance"),
    (r"forge\.governance", "forge_core.fxts"),
    (r"forge\.proto_gen", "forge_core.proto_gen"),
    (r"forge\.sdk", "forge_core.sdk"),
    (r"forge\.core", "forge_core"),
]
PATHS: list[tuple[str, str]] = [
    (r"src/forge/adapters/base", f"{CORE}/adapter"),
    (rf"src/forge/adapters/({'|'.join(GENERIC)})", rf"{CORE}/adapter/generic/\1"),
    (rf"src/forge/transport/({'|'.join(LINK)})\.py", rf"{CORE}/link/\1.py"),
    (r"src/forge/governance/fmts/conformance\.py", "src/forge/conformance.py"),
    (r"src/forge/governance", f"{CORE}/fxts"),
    (r"src/forge/proto_gen", f"{CORE}/proto_gen"),
    (r"src/forge/sdk", f"{CORE}/sdk"),
    (r"src/forge/core", CORE),
]

# Not rewritten: signed records keep their text (D-17 §7), the archive points into history,
# and these trees are not Python of this project.
UNTOUCHED = (
    "docs/decisions/",
    "archive/",
    "modules/Forge MES/",
    "go/",
    "scripts/restructure/",
    "scripts/tutorial-forge/",
    "uv.lock",
)
TEXT_SUFFIXES = {".py", ".md", ".json", ".toml", ".yml", ".yaml", ".sh", ".txt", ".cfg", ".proto"}
TEXT_NAMES = {"Makefile", "CODEOWNERS", ".gitignore", ".gitleaks.toml", ".dockerignore"}


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=True, capture_output=True, text=True
    ).stdout


def move() -> None:
    for source, target in MOVES:
        (ROOT / target).parent.mkdir(parents=True, exist_ok=True)
        git("mv", source, target)
    (ROOT / CORE).mkdir(parents=True, exist_ok=True)
    for tracked in sorted({p.split("/")[3] for p in git("ls-files", CORE_SOURCE).split("\n") if p}):
        git("mv", f"{CORE_SOURCE}/{tracked}", f"{CORE}/{tracked}")


def rewrite() -> int:
    dotted = [(re.compile(rf"(?<![\w.]){old}(?![\w])"), new) for old, new in DOTTED]
    paths = [(re.compile(rf"{old}(?![\w])"), new) for old, new in PATHS]
    changed = 0
    for name in git("ls-files").split("\n"):
        if not name or name.startswith(UNTOUCHED):
            continue
        path = ROOT / name
        if path.suffix not in TEXT_SUFFIXES and path.name not in TEXT_NAMES:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, FileNotFoundError):
            continue
        new = text
        for pattern, replacement in paths:
            new = pattern.sub(replacement, new)
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
