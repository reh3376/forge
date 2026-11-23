"""Every skipped test says why (owner, 2026-11-18: "All skipped test need a reason / warning").

A test that is skipped without a reason is a silent gap. This walks every test in the
repository, in every language, and fails for a skip that gives none:

* Python: ``pytest.mark.skip``, ``skipif``, ``xfail``, ``pytest.skip()`` and
  ``importorskip`` carry a non-empty ``reason`` (or message).
* TypeScript (the interim MES bridge): ``it.skip``, ``describe.skip``, ``test.skip``,
  ``xit``, ``xdescribe``, ``xtest`` and ``.todo`` have a comment starting ``skip reason:``
  on the same line or the line above.
* Go: ``t.Skip`` and ``t.Skipf`` are called with a message.

CI prints the reasons of the Python skips on every run (``pytest -rsx``).
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SKIPPED_DIRS = {"node_modules", ".venv", "__pycache__", ".next", "dist", "build", ".git"}
PYTHON_ROOTS = (
    "tests",
    "forge-core/tests",
    "modules/Forge DB Orchestration",
    "modules/Forge CMMS",
    "modules/Forge ERPI",
    "modules/Forge NMS",
)
TS_ROOTS = (
    "modules/Forge MES/backend/src",
    "modules/Forge MES/backend/test",
    "modules/Forge MES/frontend",
    "modules/Forge MES/shared/src",
)
MARKERS = {"skip", "skipif", "xfail"}
TS_SKIP = re.compile(r"\b(?:it|test|describe)\.(?:skip|todo)\(|\bx(?:it|test|describe)\(")
TS_REASON = re.compile(r"//\s*skip reason:\s*\S", re.IGNORECASE)
GO_SKIP = re.compile(r"\bt\.(Skip|Skipf|SkipNow)\(([^)]*)\)")


def _files(roots: tuple[str, ...], suffixes: tuple[str, ...]) -> list[Path]:
    found: list[Path] = []
    for root in roots:
        base = REPO / root
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.suffix in suffixes and not SKIPPED_DIRS & set(path.parts):
                found.append(path)
    return sorted(found)


def _has_text(node: ast.AST | None) -> bool:
    """A reason that is a non-empty string, or an expression that builds one."""
    if node is None:
        return False
    if isinstance(node, ast.Constant):
        return isinstance(node.value, str) and bool(node.value.strip())
    return True  # an f-string, a name or a call: a reason is given


def _reason(call: ast.Call, positional: int | None) -> bool:
    for keyword in call.keywords:
        if keyword.arg in ("reason", "msg"):
            return _has_text(keyword.value)
    if positional is not None and len(call.args) > positional:
        return _has_text(call.args[positional])
    return False


def _python_findings(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    where = path.relative_to(REPO)
    findings: list[str] = []
    calls: set[int] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        name = node.func.attr
        owner = ast.unparse(node.func.value)
        if owner == "pytest.mark" and name in MARKERS:
            calls.add(id(node.func))
            # skip("why") takes the reason first; skipif(condition, reason=...) second
            if not _reason(node, 0 if name == "skip" else None):
                findings.append(f"{where}:{node.lineno}: pytest.mark.{name} without a reason")
        elif owner == "pytest" and name in ("skip", "xfail"):
            if not _reason(node, 0):
                findings.append(f"{where}:{node.lineno}: pytest.{name}() without a reason")
        elif owner == "pytest" and name == "importorskip" and not _reason(node, None):
            findings.append(f"{where}:{node.lineno}: pytest.importorskip without a reason")
    for node in ast.walk(tree):  # a bare marker, used without being called
        if (
            isinstance(node, ast.Attribute)
            and node.attr in MARKERS
            and ast.unparse(node.value) == "pytest.mark"
            and id(node) not in calls
        ):
            findings.append(f"{where}:{node.lineno}: bare pytest.mark.{node.attr}, no reason")
    return findings


def test_every_python_skip_gives_a_reason() -> None:
    findings: list[str] = []
    for path in _files(PYTHON_ROOTS, (".py",)):
        if path.name == Path(__file__).name:
            continue
        findings.extend(_python_findings(path))
    assert not findings, "skips without a reason:\n" + "\n".join(findings)


def test_every_typescript_skip_gives_a_reason() -> None:
    findings: list[str] = []
    for path in _files(TS_ROOTS, (".ts", ".tsx")):
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        for index, line in enumerate(lines):
            if not TS_SKIP.search(line) or line.lstrip().startswith(("//", "*")):
                continue
            above = lines[index - 1] if index else ""
            if not (TS_REASON.search(line) or TS_REASON.search(above)):
                findings.append(f"{path.relative_to(REPO)}:{index + 1}: {line.strip()[:80]}")
    assert not findings, "skipped tests without a `// skip reason: ...` comment:\n" + "\n".join(
        findings
    )


def test_every_go_skip_gives_a_reason() -> None:
    findings: list[str] = []
    for path in _files(("go",), (".go",)):
        for index, line in enumerate(path.read_text(encoding="utf-8").splitlines()):
            match = GO_SKIP.search(line)
            if match and (match.group(1) == "SkipNow" or not match.group(2).strip()):
                findings.append(f"{path.relative_to(REPO)}:{index + 1}: {line.strip()[:80]}")
    assert not findings, "t.Skip without a message:\n" + "\n".join(findings)


def test_the_checker_catches_what_it_should(tmp_path: Path) -> None:
    """The walk above passes today; prove it would fail for each kind of silent skip."""
    bad = tmp_path / "test_bad.py"
    bad.write_text(
        "import pytest\n"
        "@pytest.mark.skip\n"
        "def test_a(): ...\n"
        "@pytest.mark.skip()\n"
        "def test_b(): ...\n"
        "@pytest.mark.skipif(True)\n"
        "def test_c(): ...\n"
        "@pytest.mark.xfail(reason='')\n"
        "def test_d(): ...\n"
        "def test_e():\n"
        "    pytest.skip()\n"
        "@pytest.mark.skip('because the fixture is not built')\n"
        "def test_ok_1(): ...\n"
        "@pytest.mark.skipif(True, reason='needs a running broker')\n"
        "def test_ok_2(): ...\n"
        "def test_ok_3():\n"
        "    pytest.skip('no docker here')\n",
        encoding="utf-8",
    )
    tree_findings = []
    global REPO
    original = REPO
    REPO = tmp_path
    try:
        tree_findings = _python_findings(bad)
    finally:
        REPO = original
    assert len(tree_findings) == 5, tree_findings
    assert TS_SKIP.search("  it.skip('x', () => {})") and TS_SKIP.search("xdescribe('y', ...)")
    assert TS_SKIP.search("it.todo('later')") and not TS_SKIP.search("it('runs', () => {})")
    assert TS_REASON.search("// skip reason: needs the broker") and not TS_REASON.search("// skip")
    assert GO_SKIP.search("t.Skip()").group(2) == ""
    assert GO_SKIP.search('t.Skip("needs postgres")').group(2)
