"""Every FxTS framework against what a framework must provide (D-14, F-1 to F-10).

``docs/decisions/fxts-framework-baseline.md``, signed by the owner on 2026-11-18. A
framework is either planned (a documentation page that says so; no code, no specs) or
it meets the whole baseline. This walks ``src/forge/governance`` and the documentation
on every run, so a framework cannot be added half-finished and the summary document
cannot fall behind the code (BACKLOG FB-149, FB-152).

A requirement that is not met yet is named in ``KNOWN_GAPS`` with the backlog item that
closes it. The test fails when a gap appears that is not listed, and also when a listed
gap has been closed, so the list is removed as the work is done.
"""

from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING, Any

import pytest

from forge.cli.governance import FRAMEWORKS, REPO_ROOT, SPEC_ROOT, spec_files
from forge.governance.fmts.runners.fmts_runner import load_backlog
from forge.governance.shared import schemas
from forge.governance.shared.runner import check_schema_runner_parity, verify_spec_hash

if TYPE_CHECKING:
    from pathlib import Path

DOCS = REPO_ROOT / "docs" / "FxTS"
SUMMARY = (DOCS / "README.md").read_text(encoding="utf-8")

#: Not frameworks with specs of their own: the engine every runner is built on, and the
#: hash framework, which governs the integrity block of every other framework's specs.
INFRASTRUCTURE = {
    "shared": "the shared runner",
    "fhts": "the hash framework",
    "lists": "the governed lists specs choose from (FB-153)",
}
#: A documentation page that says "Planned", and nothing in the code.
PLANNED = ("fdts", "flts", "fnts", "fots", "fpts", "fqts", "fsts")
BUILT = tuple(sorted(FRAMEWORKS))

#: The one schema id form the owner decided (D-14, Q-5).
ID_FORM = re.compile(r"^forge://fxts/[a-z]+/v\d+\.\d+\.\d+$")
ANY_VERSIONED_ID = re.compile(r"^forge://[a-z]+/[a-z]+/v\d+\.\d+\.\d+$")

#: Requirements not met yet, per framework, each with the backlog item that closes it.
#: Empty since FB-151 (2026-11-19): every framework meets all ten.
KNOWN_GAPS: dict[str, dict[str, str]] = {}
#: Specs whose hash the owner has not approved, each with the item that leads to it.
PENDING_APPROVAL = {"forge-mes.fmts.json": "FB-155", "forge-ot.fvts.json": "FB-078"}


def _schema(fw: str) -> dict[str, Any]:
    return json.loads(FRAMEWORKS[fw].schema.read_text(encoding="utf-8"))


def _specs(fw: str) -> list[Path]:
    return sorted(FRAMEWORKS[fw].specs_dir.glob(FRAMEWORKS[fw].pattern))


def _page(fw: str) -> str:
    return (DOCS / f"{fw.upper()}.md").read_text(encoding="utf-8")


def _summary_row(fw: str) -> str | None:
    match = re.search(rf"^\| \[{fw.upper()}\]\({fw.upper()}\.md\) \|.*$", SUMMARY, re.MULTILINE)
    return match.group(0) if match else None


def _gaps(fw: str) -> dict[str, str]:
    """What this framework does not meet, by requirement, with what was found."""
    gaps: dict[str, str] = {}
    schema = _schema(fw)
    schema_id = str(schema.get("$id", ""))
    if not ANY_VERSIONED_ID.match(schema_id):
        gaps["F-2 version"] = f"schema $id {schema_id!r} carries no version"
    elif not ID_FORM.match(schema_id):
        gaps["F-2 id form"] = f"schema $id is {schema_id!r}, not forge://fxts/{fw}/v<version>"
    schema_dir = FRAMEWORKS[fw].schema.parent
    problems = schemas.registry_problems(schema_dir)
    if problems:
        gaps["F-2 schema hash"] = "; ".join(problems)
    unapproved = [
        row.version for row in schemas.versions(schema_dir) if row.hash_state == "pending_review"
    ]
    if unapproved:
        gaps["F-2 schema approval"] = f"schema version(s) {unapproved} await the owner's approval"
    for path in _specs(fw):
        problem = schemas.spec_schema_problem(
            schema_dir, json.loads(path.read_text(encoding="utf-8"))
        )
        if problem:
            gaps["F-10"] = f"{path.name}: {problem}"
            break
    return gaps


class TestTheSetOfFrameworks:
    def test_every_directory_is_a_framework_or_named_infrastructure(self) -> None:
        directories = {
            path.name
            for path in SPEC_ROOT.iterdir()
            if path.is_dir() and path.name != "__pycache__"
        }
        assert directories == set(BUILT) | set(INFRASTRUCTURE)

    def test_a_planned_framework_is_a_page_and_nothing_else(self) -> None:
        for fw in PLANNED:
            assert not (SPEC_ROOT / fw).exists(), f"{fw} is planned but has code"
            status = re.search(r"^\*\*Status:\*\*(.*)$", _page(fw), re.MULTILINE)
            assert status and status.group(1).strip().startswith("Planned"), fw
            row = _summary_row(fw)
            assert row and row.rstrip(" |").endswith("Planned"), fw

    def test_no_page_without_a_framework_or_a_plan(self) -> None:
        pages = {path.stem.lower() for path in DOCS.glob("F*TS.md")}
        assert pages == set(BUILT) | set(PLANNED) | {"fhts"}

    def test_no_spec_lives_outside_its_framework(self) -> None:
        """F-5. A spec file anywhere else is not listed, hashed or run by anything."""
        skipped = {"node_modules", ".venv", ".git", "__pycache__"}
        strays = [
            str(path.relative_to(REPO_ROOT))
            for path in REPO_ROOT.rglob("*.f?ts.json")
            if not skipped & set(path.parts)
            and SPEC_ROOT not in path.parents
            and "tests" not in path.relative_to(REPO_ROOT).parts
        ]
        assert strays == []

    def test_the_spec_listing_sees_every_spec(self) -> None:
        listed = {path.name for path in spec_files(SPEC_ROOT)}
        expected = {path.name for fw in BUILT for path in _specs(fw)}
        assert expected <= listed and len(expected) == 61


@pytest.mark.parametrize("fw", BUILT)
class TestEachFramework:
    def test_f1_and_f8_a_page_with_a_purpose_and_a_true_summary_row(self, fw: str) -> None:
        page = _page(fw)
        assert "\n## Purpose\n" in page
        row = _summary_row(fw)
        assert row is not None, f"{fw.upper()} has no row in docs/FxTS/README.md"
        assert "Planned" not in row and "Stub" not in row
        assert f"{len(_specs(fw))} spec" in row, f"the row does not state the spec count: {row}"

    def test_f3_the_runner_enforces_every_schema_field(self, fw: str) -> None:
        runner = FRAMEWORKS[fw].make_runner(FRAMEWORKS[fw].schema)
        assert check_schema_runner_parity(_schema(fw), runner.implemented_fields()) == []
        assert runner.framework.lower() == fw

    def test_f4_every_spec_carries_a_hash_that_verifies(self, fw: str) -> None:
        specs = _specs(fw)
        assert specs, f"{fw} has no specs: a framework without specs is a planned one"
        for path in specs:
            spec = json.loads(path.read_text(encoding="utf-8"))
            integrity = spec.get("integrity")
            assert isinstance(integrity, dict) and integrity.get("spec_hash"), path.name
            verified, message = verify_spec_hash(spec)
            assert verified is True, f"{path.name}: {message}"

    def test_f4_every_spec_is_approved_or_named_as_pending(self, fw: str) -> None:
        unapproved = set()
        for path in _specs(fw):
            integrity = json.loads(path.read_text(encoding="utf-8"))["integrity"]
            if integrity.get("hash_state") != "approved" or not integrity.get("approved_by"):
                unapproved.add(path.name)
        expected = {
            name for name in PENDING_APPROVAL if name.endswith(f".{fw}.json") and unapproved
        }
        assert unapproved == expected & unapproved == unapproved & set(PENDING_APPROVAL)

    def test_f6_and_f9_a_gate_and_the_commands(self, fw: str) -> None:
        gate = REPO_ROOT / "tests" / "governance" / fw
        assert list(gate.glob("test_*.py")), f"{fw} has no gate under tests/governance"
        assert FRAMEWORKS[fw].schema.is_file() and FRAMEWORKS[fw].specs_dir.is_dir()

    def test_the_gaps_are_exactly_the_known_ones(self, fw: str) -> None:
        found = _gaps(fw)
        known = KNOWN_GAPS.get(fw, {})
        assert set(found) == set(known), (
            f"{fw}: found {sorted(found)}, listed {sorted(known)}. A gap that is not listed "
            "is a new defect; a listed gap that is gone must be removed from KNOWN_GAPS."
        )


def test_every_named_gap_and_pending_approval_has_an_open_backlog_item() -> None:
    backlog = load_backlog(REPO_ROOT)
    items = {item for gaps in KNOWN_GAPS.values() for item in gaps.values()}
    items |= set(PENDING_APPROVAL.values())
    assert {item: backlog.get(item) for item in items} == dict.fromkeys(items, True)


def test_a_pending_spec_is_really_pending() -> None:
    """The list of pending approvals shrinks when the owner approves; it never goes stale."""
    for name in PENDING_APPROVAL:
        fw = name.split(".")[-2]
        integrity = json.loads((FRAMEWORKS[fw].specs_dir / name).read_text())["integrity"]
        assert integrity.get("hash_state") != "approved", f"{name} is approved: remove it"
