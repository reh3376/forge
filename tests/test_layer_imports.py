"""The three layers import in one direction only (D-17, S-1 to S-3, S-6; BACKLOG FB-198).

forge-core imports nothing of the hub or of a module; forge-hub imports forge-core and no
module; a module imports forge-core and nothing of the hub or of another module. Until the
folders are moved (FB-199 to FB-201) every file under ``src/forge`` is sorted into the layer
it will live in, and each import is read from the syntax tree, so one inside a function
counts and one inside a docstring does not.
"""

from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src" / "forge"

CORE = "forge-core"
HUB = "forge-hub"

# The hub's end of the link; the other files of ``transport`` are the module's end (core).
HUB_LINK = {"hub_ingest.py", "hub_server.py", "grpc_server.py", "spoke_pull.py"}
# The conformance kit runs a real hub, so it goes with the hub (D-17, §5).
HUB_FILES = {"governance/fmts/conformance.py"}
# What every module is built on.
CORE_ADAPTER = {"base"}

# Each import that breaks a rule and is allowed to stand, with the item that removes it.
# An entry that no longer matches an import fails the test: the list only shrinks.
KNOWN = {
    ("api/main.py", "forge.modules.ot.host"): (
        "FB-204: the hub hosts forge-ot in its own process until the module runs on the link"
    ),
}


def layer_of(relative: str) -> str:
    """The layer a file under ``src/forge`` will live in."""
    parts = relative.split("/")
    top = parts[0]
    if relative in HUB_FILES:
        return HUB
    if top in {"core", "proto_gen", "sdk", "governance"} or len(parts) == 1:
        return CORE
    if top == "transport":
        return HUB if parts[-1] in HUB_LINK else CORE
    if top == "adapters":
        return CORE if len(parts) == 2 or parts[1] in CORE_ADAPTER else f"module {parts[1]}"
    if top == "modules":
        return CORE if len(parts) == 2 else f"module {parts[1]}"
    return HUB


def layer_of_import(dotted: str) -> str | None:
    """The layer of what ``forge.<dotted>`` names: the deepest file or package that exists."""
    parts = dotted.split(".")
    for end in range(len(parts), 0, -1):
        candidate = "/".join(parts[:end])
        if (ROOT / f"{candidate}.py").is_file():
            return layer_of(f"{candidate}.py")
        if (ROOT / candidate).is_dir():
            return layer_of(f"{candidate}/__init__.py")
    return None


def allowed(source: str, target: str) -> bool:
    return target in {source, CORE}


def imports_of(path: Path) -> list[str]:
    """Every ``forge.…`` name a file imports, anywhere in it."""
    names: list[str] = []
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            names.extend(f"{node.module}.{alias.name}" for alias in node.names)
        elif isinstance(node, ast.Import):
            names.extend(alias.name for alias in node.names)
    return [name for name in names if name.startswith("forge.")]


def crossings() -> dict[tuple[str, str], str]:
    found: dict[tuple[str, str], str] = {}
    for path in sorted(ROOT.rglob("*.py")):
        relative = path.relative_to(ROOT).as_posix()
        source = layer_of(relative)
        for name in imports_of(path):
            target = layer_of_import(name.removeprefix("forge."))
            if target is not None and not allowed(source, target):
                module = (
                    name.rsplit(".", 1)[0]
                    if layer_of_import(name.removeprefix("forge.").rsplit(".", 1)[0]) == target
                    else name
                )
                found[(relative, module)] = f"{source} imports {target}"
    return found


def test_the_sorting_covers_the_three_layers() -> None:
    layers = {layer_of(p.relative_to(ROOT).as_posix()) for p in ROOT.rglob("*.py")}
    assert {CORE, HUB} <= layers
    assert sum(1 for name in layers if name.startswith("module ")) >= 9


def test_no_import_goes_against_the_layers() -> None:
    unexpected = {key: why for key, why in crossings().items() if key not in KNOWN}
    assert not unexpected, "\n".join(
        f"{file}: {why} ({module})" for (file, module), why in sorted(unexpected.items())
    )


def test_every_named_exception_still_exists() -> None:
    """A fixed crossing leaves the list; the list never hides one that is gone."""
    gone = sorted(set(KNOWN) - set(crossings()))
    assert not gone, f"no longer in the code, remove from KNOWN: {gone}"


def test_the_rule_itself() -> None:
    assert allowed(CORE, CORE) and allowed(HUB, CORE) and allowed("module ot", CORE)
    assert not allowed(CORE, HUB) and not allowed(CORE, "module ot")
    assert not allowed(HUB, "module ot") and not allowed("module ot", HUB)
    assert not allowed("module ot", "module forge_wms")
    assert layer_of("transport/hub_ingest.py") == HUB
    assert layer_of("transport/spoke_client.py") == CORE
    assert layer_of("adapters/base/interface.py") == CORE
    assert layer_of("adapters/forge_wms/adapter.py") == "module forge_wms"
    assert layer_of("governance/fmts/conformance.py") == HUB
