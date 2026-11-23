"""Move the hub's tests into forge-hub/tests (D-17 §10.3, BACKLOG FB-200 step 2).

Run once, from the repository root, on a clean tree:
    python scripts/restructure/move_forge_hub_tests.py

Each test folder follows the code it tests:

- the hub's folders go to ``forge-hub/tests`` (``transport`` as ``link``, like the code);
- four link tests use forge-core's end alone and go to ``forge-core/tests/link``;
- two tests import a module's code beside the hub's and stay at the root, where the tests
  that span layers are kept.

Three helpers were imported from one test file by another. Two folders named ``tests``
cannot both be the package ``tests``, so they become ``tests/tls.py`` and
``tests/samples.py`` at the root, beside ``tests/otel.py``, and every tree imports them
from there. Then the paths that named the old places are rewritten in the documents and
the code. JSON and proto files are not touched.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HUB_TESTS = "forge-hub/tests"
CORE_LINK = "forge-core/tests/link"
FOLDERS = (
    "api",
    "gateway",
    "ingest",
    "storage",
    "registry",
    "context",
    "curation",
    "broker",
    "cli",
)
CORE_ONLY = (
    "test_callback_auth.py",
    "test_proto_bridge_manifest.py",
    "test_proto_bridge_timestamps.py",
    "test_serialization.py",
)
#: Import a module's code beside the hub's: they span layers and stay at the root.
STAY = ("tests/api/test_ot_host.py", "tests/transport/test_transport_adapter.py")

SYS_PATH_BLOCK = re.compile(
    r"(?:# [^\n]*\n)*_src = Path\(__file__\)\.resolve\(\)\.parent\.parent\.parent / \"src\"\n"
    r"if str\(_src\) not in sys\.path:\n    sys\.path\.insert\(0, str\(_src\)\)\n"
)
UNTOUCHED = (
    "docs/decisions/",
    "archive/",
    "modules/Forge MES/",
    "forge-core/src/go/",
    "scripts/restructure/",
    "scripts/tutorial-forge/",
    "uv.lock",
)
TEXT_SUFFIXES = {".py", ".md", ".toml", ".yml", ".yaml", ".sh", ".txt", ".cfg"}


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=True, capture_output=True, text=True
    ).stdout


def target_of(name: str) -> str | None:
    """Where a tracked test file goes; None when it stays or is not a hub test."""
    if name in STAY or name.endswith("/__init__.py"):
        return None
    parts = name.split("/")
    if len(parts) < 3 or parts[0] != "tests":
        return None
    if parts[1] == "transport":
        if parts[2] in CORE_ONLY:
            return f"{CORE_LINK}/{'/'.join(parts[2:])}"
        return f"{HUB_TESTS}/link/{'/'.join(parts[2:])}"
    if parts[1] in FOLDERS:
        return f"{HUB_TESTS}/{'/'.join(parts[1:])}"
    return None


def move() -> dict[str, str]:
    moved: dict[str, str] = {}
    for name in [n for n in git("ls-files", "tests").split("\n") if n]:
        folder = name.split("/")[1] if "/" in name else ""
        if name.endswith("/__init__.py") and folder in (*FOLDERS, "transport"):
            keep = any(stay.startswith(f"tests/{folder}/") for stay in STAY)
            if not keep or name.count("/") > 2:
                git("rm", "-q", name)
            continue
        target = target_of(name)
        if target is None:
            continue
        (ROOT / target).parent.mkdir(parents=True, exist_ok=True)
        git("mv", name, target)
        moved[name] = target
    return moved


def fix_moved(moved: dict[str, str]) -> None:
    """Inside each moved file: one folder deeper, no dead import-path code, root helpers."""
    for target in [*moved.values(), *STAY]:
        path = ROOT / target
        if path.suffix != ".py":
            continue
        text = path.read_text(encoding="utf-8")
        new = SYS_PATH_BLOCK.sub("", text)
        if target.startswith(HUB_TESTS):
            new = new.replace(
                "Path(__file__).resolve().parents[2]", "Path(__file__).resolve().parents[3]"
            )
        if target.startswith(CORE_LINK):
            new = new.replace(
                "Path(__file__).resolve().parents[2]", "Path(__file__).resolve().parents[3]"
            )
        new = new.replace(
            "from tests.transport.test_callback_auth import self_signed",
            "from tests.tls import self_signed",
        )
        new = new.replace(
            "from tests.curation.conftest import make_record_batch",
            "from tests.samples import make_record_batch",
        )
        if new != text:
            path.write_text(new, encoding="utf-8")


def rewrite_mentions() -> int:
    core = "|".join(re.escape(name) for name in CORE_ONLY)
    rules = [
        (re.compile(rf"(?<![\w/.-])tests/transport/({core})"), rf"{CORE_LINK}/\1"),
        (
            re.compile(r"(?<![\w/.-])tests/transport(?![\w])(?!/test_transport_adapter)"),
            f"{HUB_TESTS}/link",
        ),
        (
            re.compile(rf"(?<![\w/.-])tests/({'|'.join(FOLDERS)})(?![\w])(?!/test_ot_host)"),
            rf"{HUB_TESTS}/\1",
        ),
    ]
    changed = 0
    for name in git("ls-files").split("\n"):
        if not name or name.startswith(UNTOUCHED):
            continue
        path = ROOT / name
        if path.suffix not in TEXT_SUFFIXES and path.name != "Makefile":
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, FileNotFoundError):
            continue
        new = text
        for pattern, replacement in rules:
            new = pattern.sub(replacement, new)
        if new != text:
            path.write_text(new, encoding="utf-8")
            changed += 1
    return changed


if __name__ == "__main__":
    if git("status", "--porcelain", "--untracked-files=no").strip():
        raise SystemExit("the tree has uncommitted changes; commit or stash them first")
    files = move()
    fix_moved(files)
    print(f"moved {len(files)} files; {rewrite_mentions()} files with rewritten paths")
