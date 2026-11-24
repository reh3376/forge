"""Every verdict any runner gives matches a declared check and names its kind of evidence.

D-19, law 3 (``docs/decisions/approvals-and-evidence.md``; AE-1, AE-2). A runner declares,
as data, each check it can give (``forge_core/fxts/<fw>/checks.py``), the spec properties
it looks at and the kind of evidence it reaches; the runner base gives each verdict the
kind of its declaration and turns a verdict with no declaration into an error.

Why this covers every case: a check id is written in a runner's source in one of three
ways, and each is read here from the source itself, not from a list kept in this test:
a string literal (``"facts:time-governed"``); the first argument of the framework's
``_verdict`` helper, which adds the framework's prefix; or an f-string, which is either
the helper's own ``f"<fw>:{check}"`` (covered by the helper's literals), the module
requirements' ``fmts:m<n>`` (every requirement of ``REQUIREMENTS``), or a form with a
placeholder that must equal a declared pattern. So every id a runner can give is reached
by the scan, whether or not any spec makes the runner give it. Then every declaration
must be written somewhere (no dead entries), every pointer must name a property of the
framework's schema, and on every governed spec every verdict carries its kind.

Able to fail: a declaration taken away, a pointer to a property that does not exist and
a verdict with an undeclared id must each be caught.

Skill: ``.claude/skills/verify-fxts-evidence``.
"""

from __future__ import annotations

import ast
import asyncio
import functools
import importlib
import json
import re
from pathlib import Path
from typing import Any

import pytest
from typer.testing import CliRunner

from forge_core import contract
from forge_core.fxts.fmts.runners.fmts_runner import REQUIREMENTS
from forge_core.fxts.shared.runner import (
    Check,
    EvidenceKind,
    FxTSVerdict,
    VerdictStatus,
    evidence_kind_of,
)
from forge_hub.cli import governance as governance_cli
from forge_hub.cli.main import app

#: Every framework in the registry, so a framework added later is held to the law too.
FRAMEWORKS = tuple(sorted(governance_cli.FRAMEWORKS))
FXTS = Path(contract.__file__).resolve().parents[3] / "src" / "python" / "forge_core" / "fxts"


def _sources(fw: str) -> list[Path]:
    files = [FXTS / fw / "runners" / f"{fw}_runner.py"]
    if fw == "fmts":  # the conformance kit gives M-4 to M-7
        files.append(Path(governance_cli.__file__).resolve().parents[1] / "conformance.py")
    return files


def _form(node: ast.JoinedStr) -> str:
    return "".join(part.value if isinstance(part, ast.Constant) else "{x}" for part in node.values)


def written_ids(fw: str) -> tuple[set[str], set[str]]:
    """Every check id written in the framework's runner: literal ids, and the forms of
    ids built at run time (placeholders as ``{x}``)."""
    literals: set[str] = set()
    forms: set[str] = set()
    for path in _sources(fw):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        # the fixed pieces of an f-string are not ids of their own
        pieces = {
            id(part)
            for node in ast.walk(tree)
            if isinstance(node, ast.JoinedStr)
            for part in node.values
        }
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Constant)
                and isinstance(node.value, str)
                and id(node) not in pieces
                and re.fullmatch(rf"{fw}:[a-z0-9-]+", node.value)
            ):
                literals.add(node.value)
            elif (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr == "_verdict"
                and node.args
                and isinstance(node.args[0], ast.Constant)
                and isinstance(node.args[0].value, str)
            ):
                literals.add(f"{fw}:{node.args[0].value}")
            elif (
                isinstance(node, ast.keyword)
                and node.arg == "check_id"
                and isinstance(node.value, ast.JoinedStr)
            ):
                forms.add(_form(node.value))
    if fw == "fmts":
        literals |= {f"fmts:{r.lower().replace('-', '')}" for r in REQUIREMENTS}
    forms -= {f"{fw}:{{x}}"}  # the helper's own form; its literals are read above
    return literals, forms


def _checks(fw: str) -> tuple[Check, ...]:
    return importlib.import_module(f"forge_core.fxts.{fw}.checks").CHECKS


def _runner(fw: str) -> Any:
    framework = governance_cli.FRAMEWORKS[fw]
    return framework.make_runner(framework.schema)


def _normal(check_id: str) -> str:
    return re.sub(r"\{[a-z_]+\}", "{x}", check_id)


def undeclared(fw: str, checks: tuple[Check, ...]) -> list[str]:
    """Ids or forms written in the runner that no declaration (or shared check) covers."""
    literals, forms = written_ids(fw)
    runner = _runner(fw)
    shared = {
        c.id for c in runner.declared_checks()[: len(runner.declared_checks()) - len(runner.CHECKS)]
    }
    found = []
    for check_id in sorted(literals):
        if check_id in shared:
            continue
        if not any(c.matches(check_id) for c in checks):
            found.append(check_id)
    patterns = {_normal(c.id) for c in checks if c.is_pattern}
    found += [form for form in sorted(forms) if form not in patterns]
    return found


def _resolves(schema: dict[str, Any], node: dict[str, Any], parts: list[str]) -> bool:
    if not parts:
        return True
    if "$ref" in node:
        target: Any = schema
        for segment in node["$ref"].lstrip("#/").split("/"):
            target = target[segment]
        return _resolves(schema, target, parts)
    for key in ("allOf", "anyOf", "oneOf"):
        if any(_resolves(schema, branch, parts) for branch in node.get(key, [])):
            return True
    head, rest = parts[0], parts[1:]
    if head in node.get("properties", {}):
        return _resolves(schema, node["properties"][head], rest)
    extra = node.get("additionalProperties")
    if isinstance(extra, dict):
        return _resolves(schema, extra, rest)
    if node.get("patternProperties"):
        return _resolves(schema, next(iter(node["patternProperties"].values())), rest)
    if node.get("type") == "array" and isinstance(node.get("items"), dict):
        return _resolves(schema, node["items"], rest if head.isdigit() else parts)
    return False


def bad_pointers(fw: str, checks: tuple[Check, ...]) -> list[str]:
    schema = json.loads(contract.schema_path(fw).read_text(encoding="utf-8"))
    return [
        f"{c.id} covers {pointer}"
        for c in checks
        for pointer in c.covers
        if pointer and not _resolves(schema, schema, pointer.strip("/").split("/"))
    ]


@functools.cache
def _runs() -> tuple[governance_cli.GateRun, ...]:
    return tuple(asyncio.run(governance_cli.gate_runs()))


# -- the law -------------------------------------------------------------------------


@pytest.mark.parametrize("fw", FRAMEWORKS)
def test_every_id_written_in_a_runner_is_declared(fw: str) -> None:
    assert undeclared(fw, _checks(fw)) == []


@pytest.mark.parametrize("fw", FRAMEWORKS)
def test_every_declaration_is_written_in_the_runner(fw: str) -> None:
    literals, forms = written_ids(fw)
    dead = [
        c.id
        for c in _checks(fw)
        if not (
            (not c.is_pattern and c.id in literals) or (c.is_pattern and _normal(c.id) in forms)
        )
    ]
    assert dead == [], "declared but written nowhere in the runner"


@pytest.mark.parametrize("fw", FRAMEWORKS)
def test_every_pointer_names_a_property_of_the_schema(fw: str) -> None:
    assert bad_pointers(fw, _checks(fw)) == []


@pytest.mark.parametrize("fw", FRAMEWORKS)
def test_each_id_is_declared_once(fw: str) -> None:
    ids = [c.id for c in _checks(fw)]
    assert len(ids) == len(set(ids))
    assert all(c.id.startswith(f"{fw}:") for c in _checks(fw))
    assert all(c.kind in EvidenceKind for c in _checks(fw))


def test_every_verdict_on_every_governed_spec_names_its_kind() -> None:
    seen = 0
    for run in _runs():
        runner = _runner(run.framework)
        for verdict in run.report.verdicts:
            seen += 1
            declared = runner.declaration_of(verdict.check_id)
            where = f"{run.spec.name}: {verdict.check_id}"
            assert declared is not None and not verdict.evidence.get("undeclared"), where
            unobserved = verdict.status in (VerdictStatus.NOT_RUN, VerdictStatus.WAIVED)
            want = (
                EvidenceKind.NONE
                if unobserved
                else evidence_kind_of(declared.kind, verdict.reached)
            )
            assert verdict.evidence_kind == want, where
    assert seen > 1000


def test_the_evidence_command_reports_every_framework() -> None:
    result = CliRunner().invoke(app, ["governance", "evidence", "--json"])
    assert result.exit_code == 0, result.output
    table = json.loads(result.output)
    assert set(table) == set(FRAMEWORKS)
    fats = table["fats"]["units"]
    # declared: the live checks reach the route; observed in the gate: only the spec itself
    assert fats["/endpoint"] == {"mark": "claim", "declared": "artifact", "observed": "self"}
    fmts = table["fmts"]["units"]
    kit = fmts.get("/baseline/M-4") or fmts["/baseline"]  # parts once the marks are approved
    assert kit["observed"] == "artifact"  # the conformance kit ran the module


# -- able to fail --------------------------------------------------------------------


def test_a_declaration_taken_away_is_caught() -> None:
    checks = tuple(c for c in _checks("facts") if c.id != "facts:time-governed")
    assert undeclared("facts", checks) == ["facts:time-governed"]
    patterns = tuple(c for c in _checks("facts") if c.id != "facts:lifecycle-{field}")
    assert "facts:lifecycle-{x}" in undeclared("facts", patterns)


def test_a_pointer_to_nothing_is_caught() -> None:
    wrong = (Check("fats:method", ("/verb",), EvidenceKind.SELF),)
    assert bad_pointers("fats", wrong) == ["fats:method covers /verb"]


async def test_a_verdict_with_an_undeclared_id_is_an_error() -> None:
    from forge_core.fxts.facts.runners.facts_runner import FACTSRunner
    from forge_core.fxts.locations import spec_path

    class Inventive(FACTSRunner):
        async def _run_checks(self, target: str, **kwargs: Any) -> list[FxTSVerdict]:
            made_up = FxTSVerdict(
                check_id="facts:made-up",
                spec_ref="FACTS/x",
                status=VerdictStatus.PASS,
                message="ok",
            )
            return [*await super()._run_checks(target, **kwargs), made_up]

    spec = json.loads(spec_path("facts", "forge-wms.facts.json").read_text(encoding="utf-8"))
    report = await Inventive(schema_path=governance_cli.FRAMEWORKS["facts"].schema).run(
        target="forge-wms", spec=spec
    )
    made_up = next(v for v in report.verdicts if v.check_id == "facts:made-up")
    assert made_up.status is VerdictStatus.ERROR and made_up.evidence_kind is EvidenceKind.NONE
    assert "undeclared check: 'facts:made-up'" in made_up.message
    assert report.failed
