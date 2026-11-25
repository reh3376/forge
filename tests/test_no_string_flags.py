"""No flag is read by comparing a string (FB-291, FB-296; CLAUDE.md: no truthiness).

``os.getenv("X", "false").lower() == "true"`` reads ``1``, ``yes`` and ``on`` as false; it
once turned the hub's authentication off (FB-291). The same read split over two lines,
``raw = os.getenv(...)`` and then ``raw in ("1", "true", "yes", "on")``, turned the hub's
client certificates off for any other word (FB-296), and a check of single lines missed it.
So this check reads the syntax tree: an environment value, or any name assigned from one,
compared with a boolean word (``forge_core.coerce``'s words) is a finding. Every flag goes
through ``forge_core.coerce.env_boolean`` or ``boolean``. A failure names the line.
"""

from __future__ import annotations

import ast
from pathlib import Path

from forge_core.coerce import FALSE_WORDS, TRUE_WORDS

ROOT = Path(__file__).resolve().parents[1]
BOOLEAN_WORDS = TRUE_WORDS | FALSE_WORDS
SOURCES = ("forge-core/src", "forge-hub/src", "forge-modules")


def _is_environ(node: ast.AST) -> bool:
    return (isinstance(node, ast.Attribute) and node.attr == "environ") or (
        isinstance(node, ast.Name) and node.id == "environ"
    )


def _reads_env(node: ast.AST) -> bool:
    """``getenv(...)``, ``os.environ.get(...)`` or ``os.environ[...]`` anywhere inside."""
    for sub in ast.walk(node):
        if isinstance(sub, ast.Call):
            func = sub.func
            if isinstance(func, ast.Attribute) and func.attr == "getenv":
                return True
            if isinstance(func, ast.Name) and func.id == "getenv":
                return True
            if isinstance(func, ast.Attribute) and func.attr == "get" and _is_environ(func.value):
                return True
        if isinstance(sub, ast.Subscript) and _is_environ(sub.value):
            return True
    return False


def _uses(node: ast.AST, names: set[str]) -> bool:
    return any(isinstance(sub, ast.Name) and sub.id in names for sub in ast.walk(node))


def _boolean_words(node: ast.AST) -> set[str]:
    elements = node.elts if isinstance(node, ast.Tuple | ast.List | ast.Set) else [node]
    words = {
        e.value.strip().lower()
        for e in elements
        if isinstance(e, ast.Constant) and isinstance(e.value, str)
    }
    return words & BOOLEAN_WORDS


def _assignments(scope: ast.AST) -> list[tuple[list[str], ast.AST]]:
    found = []
    for node in ast.walk(scope):
        if isinstance(node, ast.Assign):
            targets = [t.id for t in node.targets if isinstance(t, ast.Name)]
            found.append((targets, node.value))
        elif isinstance(node, ast.AnnAssign | ast.NamedExpr) and node.value is not None:
            target = node.target
            if isinstance(target, ast.Name):
                found.append(([target.id], node.value))
    return found


def flag_reads(source: str) -> list[int]:
    """The lines where an environment value is compared with a boolean word."""
    tree = ast.parse(source)
    functions = (n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef | ast.AsyncFunctionDef))
    scopes = [tree, *functions]
    lines: set[int] = set()
    for scope in scopes:
        assignments = _assignments(scope)
        env_names: set[str] = set()
        while True:  # a name assigned from an environment value, or from such a name
            grown = {
                name
                for targets, value in assignments
                if _reads_env(value) or _uses(value, env_names)
                for name in targets
            }
            if grown <= env_names:
                break
            env_names |= grown
        for node in ast.walk(scope):
            if not isinstance(node, ast.Compare):
                continue
            operands = [node.left, *node.comparators]
            from_env = any(_reads_env(o) or _uses(o, env_names) for o in operands)
            if from_env and any(_boolean_words(o) for o in operands):
                lines.add(node.lineno)
    return sorted(lines)


def _python_sources() -> list[Path]:
    paths = []
    for base in SOURCES:
        for path in (ROOT / base).rglob("*.py"):
            parts = path.relative_to(ROOT).parts
            if base == "forge-modules" and ("src" not in parts or "node_modules" in parts):
                continue
            paths.append(path)
    return paths


def test_no_flag_is_read_by_comparing_a_string() -> None:
    found = []
    for path in _python_sources():
        text = path.read_text(encoding="utf-8")
        found += [
            f"{path.relative_to(ROOT)}:{n}: {text.splitlines()[n - 1].strip()}"
            for n in flag_reads(text)
        ]
    assert found == [], "read these through forge_core.coerce.env_boolean:\n" + "\n".join(found)


def test_the_check_sees_every_form_of_the_idiom() -> None:
    one_line = 'enabled = os.getenv("FORGE_AUTH_ENABLED", "false").lower() == "true"\n'
    two_lines = (
        'def f(prefix):\n    raw = os.getenv(f"{prefix}_REQUIRE", "").strip().lower()\n'
        '    return None if raw == "" else raw in ("1", "true", "yes", "on")\n'
    )
    via_another_name = (
        'raw = os.environ.get("X")\nword = raw.strip()\nif word != "off":\n    pass\n'
    )
    subscript = 'on = os.environ["X"] in {"1", "yes"}\n'
    assert flag_reads(one_line) == [1]
    assert flag_reads(two_lines) == [3]
    assert flag_reads(via_another_name) == [3]
    assert flag_reads(subscript) == [1]


def test_the_check_leaves_the_one_rule_and_other_words_alone() -> None:
    assert flag_reads('enabled = env_boolean("FORGE_AUTH_ENABLED", False)\n') == []
    store = 'store = os.getenv("FORGE_STORE", "memory")\nok = store == "postgres"\n'
    assert flag_reads(store) == []
    assert flag_reads('raw = os.getenv("X", "")\nempty = raw.strip() == ""\n') == []
    assert flag_reads('mode = "on"\nok = mode == "on"\n') == []  # not from the environment
