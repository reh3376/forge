"""Claims, their marks, and what a verdict rests on: D-19 step 2 (AE-1, AE-3, AE-4).

The laws (``docs/decisions/approvals-and-evidence.md``, step 2 as built):

1. **A verdict's kind is what it reached, never more than its check declares.** A verdict
   that did not run or is waived rests on nothing; one that names something in a form
   other than ``file:<path>`` or ``artifact:<what>`` is an error; otherwise its kind is
   the strongest thing it names, ``self`` when it names nothing, capped by the kind its
   check declares. Every combination of status, declared kind and what is named: 192.
2. **The marks split a schema cleanly.** Every property lies under exactly one mark, the
   marks come from the closed list, and no two top-level properties give one section id.
   Every assignment of marks to a small schema (625) is judged against an oracle that
   counts the marks on each leaf's path, and the six real schemas are clean.
3. **No check decides on a description.** A check declared to read a property marked
   ``description``, or a part of one, rests on nothing (``none``).
4. **A claim a spec makes is in its section's finding if and only if no check of the
   real thing reached it in that run.** On every governed spec, the run's
   ``<fw>:evidence-<section>`` verdicts equal what an oracle derives from the marks in
   force, the spec and the run's own verdicts; a check of the real thing covers a claim
   only when it is declared to cover it or a property above it.
5. **A mark change is always a minor step and always named.** Every transition between
   no mark, ``claim``, ``description`` and ``structure``, at the top, in a part, and on a
   property named ``description``. A property named like a wording keyword is a name.
6. **Marks take effect only when the owner approves them.** The marks in force are the
   latest approved version's; a release awaiting approval changes nothing.

Each law is shown able to fail on a broken variant. Skill: ``.claude/skills/verify-fxts-evidence``.
"""

from __future__ import annotations

import asyncio
import copy
import functools
import itertools
import json
import shutil
from typing import TYPE_CHECKING, Any, ClassVar

import pytest

from forge_core import contract
from forge_core.fxts.shared import schemas
from forge_core.fxts.shared.runner import (
    EVIDENCE_ORDER,
    Check,
    EvidenceKind,
    FxTSRunner,
    FxTSVerdict,
    VerdictStatus,
)
from forge_hub.cli import governance as governance_cli

if TYPE_CHECKING:
    from pathlib import Path

FRAMEWORKS = tuple(sorted(governance_cli.FRAMEWORKS))
K = EvidenceKind
V = VerdictStatus


@functools.cache
def _runs() -> tuple[governance_cli.GateRun, ...]:
    return tuple(asyncio.run(governance_cli.gate_runs()))


def _runner(fw: str) -> Any:
    framework = governance_cli.FRAMEWORKS[fw]
    return framework.make_runner(framework.schema)


def _schema(fw: str) -> dict[str, Any]:
    return json.loads(contract.schema_path(fw).read_text(encoding="utf-8"))


# -- 1. a verdict's kind -------------------------------------------------------------


class Stand(FxTSRunner):
    """A runner with one check of each declared kind."""

    framework = "FXTS"
    CHECKS: ClassVar[tuple[Check, ...]] = tuple(
        Check(f"fxts:{kind.value}", (), kind) for kind in EvidenceKind
    )

    def implemented_fields(self) -> set[str]:
        return set()

    async def _run_checks(self, target: str, **kwargs: Any) -> list[FxTSVerdict]:
        return []


NAMED = {"file": "file:forge-core/contract/lists/x.json", "artifact": "artifact:module:forge_core"}
MALFORMED = "forge-core/contract/lists/x.json"


def oracle_kind(status: V, declared: K, named: set[str]) -> tuple[V, K]:
    if status in (V.NOT_RUN, V.WAIVED):
        return status, K.NONE
    if "malformed" in named:
        return V.ERROR, K.NONE
    reached = K.ARTIFACT if "artifact" in named else K.FILE if "file" in named else K.SELF
    order = list(EVIDENCE_ORDER)
    return status, order[min(order.index(declared), order.index(reached))]


KIND_CASES = [
    (status, declared, frozenset(named))
    for status in V
    for declared in EvidenceKind
    for size in range(4)
    for named in itertools.combinations(("file", "artifact", "malformed"), size)
]


def test_the_kind_cases_are_every_combination() -> None:
    assert len(KIND_CASES) == len(V) * len(EvidenceKind) * 8 == 192


@pytest.mark.parametrize(("status", "declared", "named"), KIND_CASES)
def test_a_verdicts_kind_is_what_it_reached_capped_by_its_declaration(
    status: V, declared: K, named: frozenset[str]
) -> None:
    reached = [NAMED.get(n, MALFORMED) for n in sorted(named)]
    verdict = FxTSVerdict(
        check_id=f"fxts:{declared.value}",
        spec_ref="FXTS/x",
        status=status,
        message="m",
        reached=reached,
    )
    got = Stand().with_evidence(verdict)
    assert (got.status, got.evidence_kind) == oracle_kind(status, declared, set(named))


def test_a_vacuous_pass_rests_on_the_spec_alone() -> None:
    """The PR 185 defect: a check declared to reach the real thing passes with nothing to
    check (futs:expressions, "No expressions.") and must not count as the real thing."""
    verdict = FxTSVerdict(
        check_id="fxts:artifact", spec_ref="FXTS/x", status=V.PASS, message="none"
    )
    assert Stand().with_evidence(verdict).evidence_kind is K.SELF


# -- 2. the marks split a schema cleanly --------------------------------------------


def _oracle_resolve(
    root: dict[str, Any], node: dict[str, Any], seen: tuple[str, ...]
) -> tuple[dict[str, Any], tuple[str, ...]]:
    while "$ref" in node and node["$ref"] not in seen:
        ref = node["$ref"]
        target = root
        for part in ref.lstrip("#/").split("/"):
            target = target[part]
        seen = (*seen, ref)
        node = {**target, **{k: v for k, v in node.items() if k != "$ref"}}
    return node, seen


def oracle_clean(schema: dict[str, Any]) -> bool:
    """Every leaf's path from the top holds exactly one mark, each from the list, and the
    section ids are distinct."""
    ok = True

    def walk(node: dict[str, Any], seen: tuple[str, ...], marks: list[Any]) -> None:
        nonlocal ok
        node, seen = _oracle_resolve(schema, node, seen)
        here = [*marks, node[schemas.MARK_KEY]] if schemas.MARK_KEY in node else marks
        kids = node.get("properties") or {}
        if not kids:
            if len(here) != 1 or here[0] not in schemas.MARKS:
                ok = False
            return
        if any(m not in schemas.MARKS for m in here):
            ok = False
        for child in kids.values():
            walk(child, seen, here)

    for child in schema["properties"].values():
        walk(child, (), [])
    ids = [name.replace("_", "-") for name in schema["properties"]]
    return ok and len(ids) == len(set(ids))


def _small(marks: tuple[Any, ...]) -> dict[str, Any]:
    """Two top-level properties; the first has two parts. ``marks``: a, a.x, a.y, b."""

    def prop(mark: Any, **rest: Any) -> dict[str, Any]:
        return {**rest, **({schemas.MARK_KEY: mark} if mark is not None else {})}

    a, ax, ay, b = marks
    return {
        "properties": {
            "a": prop(
                a,
                type="object",
                properties={"x": prop(ax, type="string"), "y": prop(ay, type="string")},
            ),
            "b": prop(b, type="string"),
        }
    }


SMALL = list(itertools.product((None, "claim", "description", "structure", "bogus"), repeat=4))


def test_the_small_cases_are_every_assignment() -> None:
    assert len(SMALL) == 5**4 == 625


@pytest.mark.parametrize("marks", SMALL)
def test_mark_problems_agree_with_the_oracle(marks: tuple[Any, ...]) -> None:
    schema = _small(marks)
    clean = oracle_clean(schema)
    assert (schemas.mark_problems(schema) == []) is clean
    if clean:
        explicit = {
            "/a": marks[0],
            "/a/x": marks[1],
            "/a/y": marks[2],
            "/b": marks[3],
        }
        units = dict(schemas.mark_units(schema))
        if marks[0] is not None:
            assert units == {"/a": marks[0], "/b": marks[3]}
        else:
            assert units == {k: v for k, v in explicit.items() if k != "/a"}


@pytest.mark.parametrize("fw", FRAMEWORKS)
def test_each_framework_schema_is_split_cleanly(fw: str) -> None:
    schema = _schema(fw)
    assert schemas.mark_problems(schema) == []
    assert oracle_clean(schema)


def _broken(fw: str, change: str) -> dict[str, Any]:
    schema = copy.deepcopy(_schema(fw))
    props = schema["properties"]
    if change == "unmarked section":
        del props["endpoint"][schemas.MARK_KEY]
    elif change == "mark inside a mark":
        props["response"]["properties"]["success_status"][schemas.MARK_KEY] = "claim"
    elif change == "unknown mark":
        props["method"][schemas.MARK_KEY] = "evidence"
    elif change == "same section id":
        props["rate-limit"] = {"type": "string", schemas.MARK_KEY: "claim"}
    return schema


@pytest.mark.parametrize(
    "change", ["unmarked section", "mark inside a mark", "unknown mark", "same section id"]
)
def test_a_schema_split_wrongly_is_caught(change: str) -> None:
    schema = _broken("fats", change)
    assert schemas.mark_problems(schema) != []
    assert not oracle_clean(schema)


def test_a_release_refuses_marks_that_do_not_split(tmp_path: Path) -> None:
    source = contract.schema_dir("fats")
    copy_dir = tmp_path / "fats" / "schema"
    shutil.copytree(source, copy_dir)
    working = copy_dir / "fats.schema.json"
    schema = _broken("fats", "unmarked section")
    schema["$id"] = schema["$id"].rsplit("/v", 1)[0] + "/v0.3.0"
    schema["properties"]["spec_version"]["const"] = "0.3.0"
    working.write_text(json.dumps(schema), encoding="utf-8")
    with pytest.raises(ValueError, match="do not split it cleanly"):
        schemas.release(copy_dir, summary="test", released_at="2026-11-24T00:00:00Z")


# -- 3. no check decides on a description --------------------------------------------


def _descriptions(fw: str) -> list[str]:
    return [p for p, m in schemas.mark_units(_schema(fw)) if m == "description"]


@pytest.mark.parametrize("fw", FRAMEWORKS)
def test_a_check_reading_a_description_rests_on_nothing(fw: str) -> None:
    wrong = [
        c.id
        for c in _runner(fw).declared_checks()
        for d in _descriptions(fw)
        if any(p == d or p.startswith(d + "/") for p in c.covers) and c.kind is not K.NONE
    ]
    assert wrong == []


def test_a_check_deciding_on_a_description_is_caught() -> None:
    runner = _runner("facts")
    checks = (*runner.declared_checks(), Check("facts:notes", ("/metadata",), K.SELF))
    wrong = [
        c.id
        for c in checks
        for d in _descriptions("facts")
        if d in c.covers and c.kind is not K.NONE
    ]
    assert wrong == ["facts:notes"]


# -- 4. a claim is a finding iff nothing real reached it -----------------------------


def _present(spec: dict[str, Any], pointer: str) -> bool:
    node: Any = spec
    for part in pointer.strip("/").split("/"):
        if not isinstance(node, dict) or part not in node:
            return False
        node = node[part]
    return node is not None


def oracle_findings(
    fw: str, spec: dict[str, Any], verdicts: list[FxTSVerdict]
) -> dict[str, list[str]]:
    schema_dir = contract.schema_dir(fw)
    source = schemas.marks_version(schema_dir)
    if source is not None:
        units = schemas.mark_units(source.load())
    else:
        head = schemas.latest(schema_dir)
        units = [(f"/{name}", "claim") for name in head.load()["properties"]] if head else []
    runner = _runner(fw)
    reached = set()
    for v in verdicts:
        declared = runner.declaration_of(v.check_id)
        if v.evidence_kind is K.ARTIFACT and declared is not None:
            reached.update(declared.covers)
    found: dict[str, list[str]] = {}
    for pointer, mark in units:
        if mark != "claim" or not _present(spec, pointer):
            continue
        if any(c == "" or pointer == c or pointer.startswith(c + "/") for c in reached):
            continue
        section = pointer.split("/")[1]
        found.setdefault(f"{fw}:evidence-{section.replace('_', '-')}", []).append(pointer)
    return found


def _given(run: governance_cli.GateRun) -> dict[str, list[str]]:
    return {
        v.check_id: v.evidence["uncovered"]
        for v in run.report.verdicts
        if ":evidence-" in v.check_id
    }


def test_on_every_governed_spec_the_findings_are_the_unreached_claims() -> None:
    checked = 0
    for run in _runs():
        spec = json.loads(run.spec.read_text(encoding="utf-8"))
        others = [v for v in run.report.verdicts if ":evidence-" not in v.check_id]
        assert _given(run) == oracle_findings(run.framework, spec, others), run.spec.name
        assert all(
            v.status is V.NOT_RUN and v.evidence_kind is K.NONE
            for v in run.report.verdicts
            if ":evidence-" in v.check_id
        )
        checked += 1
    assert checked == len(_runs()) > 50


async def _fats_with_live(
    monkeypatch: pytest.MonkeyPatch, reached: list[str]
) -> dict[str, list[str]]:
    """One real API spec through the real command, with its live check giving a pass that
    names ``reached``, and the marks of the latest release in force."""
    from forge_core.fxts.fats.runners.fats_runner import FATSRunner
    from forge_core.fxts.locations import spec_files

    real = FATSRunner._run_checks

    async def with_live(self: FATSRunner, target: str, **kwargs: Any) -> list[FxTSVerdict]:
        verdicts = [v for v in await real(self, target, **kwargs) if v.check_id != "fats:live"]
        live = FxTSVerdict(
            check_id="fats:live",
            spec_ref="FATS/live",
            status=V.PASS,
            message="reached",
            reached=reached,
        )
        return [*verdicts, live]

    monkeypatch.setattr(FATSRunner, "_run_checks", with_live)
    monkeypatch.setattr(schemas, "marks_version", schemas.latest)
    report = await governance_cli.run_framework("fats", str(spec_files("fats")[0]))
    return {
        v.check_id: v.evidence["uncovered"] for v in report.verdicts if ":evidence-" in v.check_id
    }


async def test_a_check_of_the_real_thing_covers_its_claims_and_a_part_does_not_cover_the_whole(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    nothing = await _fats_with_live(monkeypatch, [])
    route = await _fats_with_live(monkeypatch, ["artifact:route:GET /v1/health"])
    # fats:live covers /endpoint, /method and two parts of /response
    assert {"fats:evidence-endpoint", "fats:evidence-method", "fats:evidence-response"} <= set(
        nothing
    )
    assert "fats:evidence-endpoint" not in route and "fats:evidence-method" not in route
    assert route["fats:evidence-response"] == ["/response"]
    assert "fats:evidence-spec-version" not in nothing  # structure, not a claim


def test_a_finding_dropped_or_invented_is_caught() -> None:
    run = next(r for r in _runs() if _given(r))
    spec = json.loads(run.spec.read_text(encoding="utf-8"))
    others = [v for v in run.report.verdicts if ":evidence-" not in v.check_id]
    expected = oracle_findings(run.framework, spec, others)
    dropped = dict(list(_given(run).items())[1:])
    assert dropped != expected
    invented = {**_given(run), f"{run.framework}:evidence-made-up": ["/made_up"]}
    assert invented != expected


# -- 5. a mark change is minor and named ---------------------------------------------

VALUES = (None, "claim", "description", "structure")
PLACES = ("top", "part", "named description")


def _with_mark(place: str, mark: str | None) -> dict[str, Any]:
    schema: dict[str, Any] = {
        "properties": {
            "a": {
                "type": "object",
                "properties": {"b": {"type": "string"}, "description": {"type": "string"}},
            }
        }
    }
    target = {
        "top": schema["properties"]["a"],
        "part": schema["properties"]["a"]["properties"]["b"],
        "named description": schema["properties"]["a"]["properties"]["description"],
    }[place]
    if mark is not None:
        target[schemas.MARK_KEY] = mark
    return schema


@pytest.mark.parametrize(("place", "old", "new"), list(itertools.product(PLACES, VALUES, VALUES)))
def test_a_mark_change_is_minor_and_named(place: str, old: str | None, new: str | None) -> None:
    changes = schemas.diff(_with_mark(place, old), _with_mark(place, new))
    if old == new:
        assert changes == []
        return
    assert len(changes) == 1
    (change,) = changes
    assert change.step == "minor"
    assert change.path.endswith(schemas.MARK_KEY) and "evidence mark" in change.what


@pytest.mark.parametrize("name", sorted(schemas._WORDING))
def test_a_property_named_like_a_keyword_is_a_name(name: str) -> None:
    base = {"properties": {"a": {"type": "object", "properties": {name: {"type": "string"}}}}}
    without = {"properties": {"a": {"type": "object", "properties": {}}}}
    assert [(c.what, c.step) for c in schemas.diff(base, without)] == [("removed", "major")]
    assert [(c.what, c.step) for c in schemas.diff(without, base)] == [("added", "minor")]
    keyword = copy.deepcopy(without)
    keyword["properties"]["a"][name] = "text"
    assert all(c.step == "patch" for c in schemas.diff(without, keyword))


# -- 6. marks take effect when approved ----------------------------------------------


def test_marks_in_force_are_the_latest_approved(tmp_path: Path) -> None:
    copy_dir = tmp_path / "fats" / "schema"
    shutil.copytree(contract.schema_dir("fats"), copy_dir)
    registry = json.loads((copy_dir / schemas.REGISTRY_NAME).read_text(encoding="utf-8"))
    rows = registry["versions"]
    assert len(rows) >= 2, "the marked release is registered"
    for row in rows[:-1]:
        row.update(
            hash_state="approved", approved_by="test-approver", approved_at="2026-11-24T00:00:00Z"
        )
    rows[-1].update(hash_state="pending_review")
    rows[-1].pop("approved_by", None)
    rows[-1].pop("approved_at", None)
    (copy_dir / schemas.REGISTRY_NAME).write_text(json.dumps(registry), encoding="utf-8")
    assert schemas.marks_version(copy_dir).version == rows[-2]["version"]  # awaiting: no effect
    schemas.approve(copy_dir, rows[-1]["version"], by="test-approver", at="2026-11-24T00:00:00Z")
    assert schemas.marks_version(copy_dir).version == rows[-1]["version"]  # approved: in force
    for row in rows:
        row.update(hash_state="pending_review", approved_by="", approved_at="")
    (copy_dir / schemas.REGISTRY_NAME).write_text(json.dumps(registry), encoding="utf-8")
    assert schemas.marks_version(copy_dir) is None  # none approved: every section a claim
