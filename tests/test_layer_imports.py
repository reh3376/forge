"""The three layers import in one direction only (D-17, S-1 to S-3, S-6; BACKLOG FB-198).

forge-core imports nothing of the hub or of a module; forge-hub imports forge-core and no
module; a module imports forge-core and nothing of the hub or of another module.

Each layer is its own package (FB-199 to FB-201): ``forge_core``, ``forge_hub``, and one
package per module, ``forge_<name>`` in ``forge-modules/forge-<name>/src/python``. A file is
sorted by the package it lies in. Each
import is read from the syntax tree, so one inside a function counts and one inside a
docstring does not.
"""

from __future__ import annotations

import ast
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
MODULES = REPO / "forge-modules"
ROOTS = {
    "forge_core": REPO / "forge-core" / "src" / "python" / "forge_core",
    "forge_hub": REPO / "forge-hub" / "src" / "python" / "forge_hub",
    **{
        package.name: package
        for package in sorted(MODULES.glob("*/src/python/*"))
        if (package / "__init__.py").is_file()
    },
}

CORE = "forge-core"
HUB = "forge-hub"

# Each import that breaks a rule and is allowed to stand, with the item that removes it.
# An entry that no longer matches an import fails the test: the list only shrinks.
KNOWN = {
    ("forge_hub/api/main.py", "forge_ot.host"): (
        "FB-204: the hub hosts forge-ot in its own process until the module runs on the link"
    ),
}


def layer_of(package: str, relative: str = "") -> str:
    """The layer of a file, given the package it lies in."""
    if package == "forge_core":
        return CORE
    if package == "forge_hub":
        return HUB
    return f"module {package}"


def layer_of_import(dotted: str) -> str | None:
    """The layer of what a dotted name refers to: the deepest file or package that exists."""
    package, _, rest = dotted.partition(".")
    root = ROOTS.get(package)
    if root is None:
        return None
    parts = rest.split(".") if rest else []
    for end in range(len(parts), 0, -1):
        candidate = "/".join(parts[:end])
        if (root / f"{candidate}.py").is_file():
            return layer_of(package, f"{candidate}.py")
        if (root / candidate / "__init__.py").is_file():
            return layer_of(package, f"{candidate}/__init__.py")
    return layer_of(package, "__init__.py")


def allowed(source: str, target: str) -> bool:
    return target in {source, CORE}


def imports_of(path: Path) -> list[str]:
    """Every ``forge.…`` or ``forge_core.…`` name a file imports, anywhere in it."""
    names: list[str] = []
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            names.extend(f"{node.module}.{alias.name}" for alias in node.names)
        elif isinstance(node, ast.Import):
            names.extend(alias.name for alias in node.names)
    return [name for name in names if name.split(".")[0] in ROOTS]


def files() -> list[tuple[str, str, Path]]:
    found = []
    for package, root in ROOTS.items():
        for path in sorted(root.rglob("*.py")):
            if "__pycache__" not in path.parts:
                found.append((package, path.relative_to(root).as_posix(), path))
    return found


def crossings() -> dict[tuple[str, str], str]:
    found: dict[tuple[str, str], str] = {}
    for package, relative, path in files():
        source = layer_of(package, relative)
        for name in imports_of(path):
            target = layer_of_import(name)
            if target is None or allowed(source, target):
                continue
            parent = name.rsplit(".", 1)[0]
            module = parent if layer_of_import(parent) == target else name
            found[(f"{package}/{relative}", module)] = f"{source} imports {target}"
    return found


def test_the_sorting_covers_the_three_layers() -> None:
    layers = {layer_of(package, relative) for package, relative, _ in files()}
    assert {CORE, HUB} <= layers
    assert sum(1 for package, _, _ in files() if package == "forge_hub") > 80
    assert sum(1 for name in layers if name.startswith("module ")) == 9
    assert sum(1 for package, _, _ in files() if package == "forge_core") > 100


def test_no_import_goes_against_the_layers() -> None:
    unexpected = {key: why for key, why in crossings().items() if key not in KNOWN}
    assert not unexpected, "\n".join(
        f"{file}: {why} ({module})" for (file, module), why in sorted(unexpected.items())
    )


def test_every_named_exception_still_exists() -> None:
    """A fixed crossing leaves the list; the list never hides one that is gone."""
    gone = sorted(set(KNOWN) - set(crossings()))
    assert not gone, f"no longer in the code, remove from KNOWN: {gone}"


def test_the_shared_package_is_gone() -> None:
    """There is no package ``forge`` any more: nothing can import a layer through it."""
    assert not list((REPO / "src").rglob("*.py")), "src/ holds code again"
    assert "forge" not in ROOTS
    for package, root in ROOTS.items():
        if package not in {"forge_core", "forge_hub"}:
            module = root.parents[2].name  # forge-modules/<module>/src/python/<package>
            assert package == module.replace("-", "_"), f"{root}: package and folder differ"


def test_the_rule_itself() -> None:
    assert allowed(CORE, CORE) and allowed(HUB, CORE) and allowed("module forge_ot", CORE)
    assert not allowed(CORE, HUB) and not allowed(CORE, "module forge_ot")
    assert not allowed(HUB, "module forge_ot") and not allowed("module forge_ot", HUB)
    assert not allowed("module forge_ot", "module forge_wms")
    assert layer_of("forge_core", "link/spoke_client.py") == CORE
    assert layer_of("forge_core", "fxts/fmts/runners/fmts_runner.py") == CORE
    assert layer_of("forge_hub", "link/hub_ingest.py") == HUB
    assert layer_of("forge_hub", "conformance.py") == HUB
    assert layer_of("forge_wms", "adapter.py") == "module forge_wms"
    assert layer_of("forge_ot", "host.py") == "module forge_ot"
    assert layer_of_import("forge_core.models.alarm.AlarmState") == CORE
    assert layer_of_import("forge_hub.conformance") == HUB
