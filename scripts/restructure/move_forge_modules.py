"""Move every module into its own folder (D-17 step 5, BACKLOG FB-201 step 3).

Run once, from the repository root, on a clean tree:
    python scripts/restructure/move_forge_modules.py

Each module's code and specs move together, so the owner approves the changed spec hashes
once:

- ``src/forge/modules/ot``            -> ``forge-modules/forge-ot/src/python/forge_ot``
- ``src/forge/adapters/forge_<name>`` -> ``forge-modules/forge-<name>/src/python/forge_<name>``
- a module's specs, from forge-core's framework folders,
  -> ``forge-modules/<module>/fxts/<framework>``
- the twelve widget specs -> ``forge-modules/forge-display/fxts/futs``

``src/forge`` is then empty and is removed: there is no package ``forge`` any more. Dotted
names and paths are rewritten in code and documents. In JSON only the paths inside the
modules' own specs are rewritten (a spec names its module's code and its sibling specs by
path); those specs are stamped afterwards and put to the owner. Released schemas, the
contract and the hub's specs are not touched.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODULES = "forge-modules"
FXTS = "forge-core/src/python/forge_core/fxts"
ADAPTERS = (
    "forge_cmms",
    "forge_historian",
    "forge_ims",
    "forge_integ_erp_netsuite",
    "forge_mes",
    "forge_nms",
    "forge_scanner",
    "forge_wms",
)
#: package name -> module id (its folder)
PACKAGES = {"forge_ot": "forge-ot", **{name: name.replace("_", "-") for name in ADAPTERS}}
MODULE_IDS = sorted([*PACKAGES.values(), "forge-display"], key=len, reverse=True)

UNTOUCHED = (
    "docs/decisions/",
    "archive/",
    "forge-modules/forge-mes/bridge/",
    "forge-core/src/go/",
    "forge-core/contract/",
    "forge-hub/fxts/",
    "scripts/restructure/",
    "scripts/tutorial-forge/",
    "uv.lock",
)
TEXT_SUFFIXES = {".py", ".md", ".toml", ".yml", ".yaml", ".sh", ".txt", ".cfg"}
TEXT_NAMES = {"Makefile", "CODEOWNERS", ".gitignore", ".gitleaks.toml", ".dockerignore"}


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=True, capture_output=True, text=True
    ).stdout


def package_dir(package: str) -> str:
    return f"{MODULES}/{PACKAGES[package]}/src/python/{package}"


def owner_of(spec_name: str) -> str:
    """The module a spec file belongs to, by its name."""
    if ".widget." in spec_name:
        return "forge-display"
    for module in MODULE_IDS:
        if spec_name.startswith((f"{module}.", f"{module}-")):
            return module
    raise SystemExit(f"{spec_name}: no module owns this spec")


def move() -> dict[str, str]:
    """Move code and specs; return {old spec path: new spec path}."""
    (ROOT / MODULES).mkdir(exist_ok=True)
    for package in PACKAGES:
        source = (
            "src/forge/modules/ot" if package == "forge_ot" else f"src/forge/adapters/{package}"
        )
        target = ROOT / package_dir(package)
        target.parent.mkdir(parents=True, exist_ok=True)
        git("mv", source, str(target.relative_to(ROOT)))
    specs: dict[str, str] = {}
    for name in [n for n in git("ls-files", FXTS).split("\n") if "/specs/" in n]:
        path = Path(name)
        if path.suffix != ".json":
            git("rm", "-q", name)  # the specs folders' empty __init__.py
            continue
        framework = path.parent.parent.name
        target = f"{MODULES}/{owner_of(path.name)}/fxts/{framework}/{path.name}"
        (ROOT / target).parent.mkdir(parents=True, exist_ok=True)
        git("mv", name, target)
        specs[name] = target
    for leftover in [n for n in git("ls-files", "src/forge").split("\n") if n]:
        git("rm", "-q", leftover)
    return specs


def rules(specs: dict[str, str]) -> tuple[list, list]:
    names = "|".join(ADAPTERS)
    paths = [(re.compile(re.escape(old) + r"(?![\w])"), new) for old, new in specs.items()]
    paths += [
        (re.compile(r"src/forge/modules/ot(?![\w])"), package_dir("forge_ot")),
        *[
            (re.compile(rf"src/forge/adapters/{name}(?![\w])"), package_dir(name))
            for name in ADAPTERS
        ],
    ]
    dotted = [
        (re.compile(r"(?<![\w.@])forge\.modules\.ot(?![\w])"), "forge_ot"),
        (re.compile(rf"(?<![\w.@])forge\.adapters\.({names})(?![\w])"), r"\1"),
    ]
    return paths, dotted


def rewrite(specs: dict[str, str]) -> tuple[int, list[str]]:
    paths, dotted = rules(specs)
    changed = 0
    changed_specs: list[str] = []
    moved_specs = set(specs.values())
    module_json = re.compile(rf"^{MODULES}/[^/]+/(fxts/|src/python/[^/]+/manifest\.json$)")
    for name in [n for n in git("ls-files").split("\n") if n]:
        if name.startswith(UNTOUCHED):
            continue
        path = ROOT / name
        is_text = path.suffix in TEXT_SUFFIXES or path.name in TEXT_NAMES
        is_text = is_text or path.name.startswith("Dockerfile")
        is_module_json = path.suffix == ".json" and bool(module_json.match(name))
        if not is_text and not is_module_json:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, FileNotFoundError):
            continue
        new = text
        for pattern, replacement in paths:
            new = pattern.sub(replacement, new)
        if is_text:
            for pattern, replacement in dotted:
                new = pattern.sub(replacement, new)
        if new != text:
            path.write_text(new, encoding="utf-8")
            changed += 1
            if name in moved_specs:
                changed_specs.append(name)
    return changed, changed_specs


if __name__ == "__main__":
    if git("status", "--porcelain", "--untracked-files=no").strip():
        raise SystemExit("the tree has uncommitted changes; commit or stash them first")
    moved = move()
    count, stamped = rewrite(moved)
    print(f"moved {len(PACKAGES)} packages and {len(moved)} specs; {count} files rewritten")
    print("specs whose content changed (to be stamped):")
    for spec in stamped:
        print("  " + spec)
