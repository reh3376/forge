"""Every FxTS framework against what a framework must provide (D-14, F-1 to F-12).

``docs/decisions/fxts-framework-baseline.md``, signed by the owner on 2026-11-18. A
framework is either planned (a documentation page that says so; no code, no specs) or
it meets the whole baseline. This walks ``forge-core/src/python/forge_core/fxts`` and the
documentation on every run, so a framework cannot be added half-finished and the summary document
cannot fall behind the code (BACKLOG FB-149, FB-152).

A requirement that is not met is a failure: a baseline gap is never accepted. A spec the
owner has not approved is let through only by an accepted gap the owner approved
(``forge-core/fxts/accepted-gaps.json``, FB-266), which the gate holds to an open backlog
item and removes when the spec is approved.
"""

from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING, Any

import pytest

from forge_core.fxts import locations
from forge_core.fxts.shared import schemas
from forge_core.fxts.shared.runner import check_schema_runner_parity, verify_spec_hash
from forge_hub.cli import governance as governance_cli
from forge_hub.cli.governance import (
    FRAMEWORKS,
    REPO_ROOT,
    SPEC_ROOT,
    framework_specs,
    spec_files,
)

if TYPE_CHECKING:
    from pathlib import Path

DOCS = REPO_ROOT / "forge-core" / "docs" / "fxts"
SUMMARY = (DOCS / "README.md").read_text(encoding="utf-8")

#: Not frameworks with specs of their own: the engine every runner is built on, and the
#: hash framework, which governs the integrity block of every other framework's specs.
INFRASTRUCTURE = {
    "shared": "the shared runner",
    "fhts": "the hash framework",
}
#: The governed lists and every schema live in the contract, not among the runners (FB-227).
#: A documentation page that says "Planned", and nothing in the code.
PLANNED = ("fdts", "flts", "fnts", "fots", "fpts", "fqts", "fsts")
BUILT = tuple(sorted(FRAMEWORKS))

#: The one schema id form the owner decided (D-14, Q-5).
ID_FORM = re.compile(r"^forge://fxts/[a-z]+/v\d+\.\d+\.\d+$")
ANY_VERSIONED_ID = re.compile(r"^forge://[a-z]+/[a-z]+/v\d+\.\d+\.\d+$")


def _schema(fw: str) -> dict[str, Any]:
    return json.loads(FRAMEWORKS[fw].schema.read_text(encoding="utf-8"))


def _specs(fw: str) -> list[Path]:
    return framework_specs(FRAMEWORKS[fw])


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
        """F-5, as D-17 words it: a spec lives in the folder of what it describes, which is
        the ``fxts`` folder of the hub or of a module. A spec file anywhere else is not
        listed, hashed or run by anything."""
        skipped = {"node_modules", ".venv", ".git", "__pycache__"}
        strays = [
            str(path.relative_to(REPO_ROOT))
            for path in REPO_ROOT.rglob("*.f?ts.json")
            if not skipped & set(path.parts)
            and not any(folder in path.parents for folder in locations.fxts_folders())
            and "tests" not in path.relative_to(REPO_ROOT).parts
        ]
        assert strays == []
        listed = set(spec_files(SPEC_ROOT))
        unlisted = [
            str(path.relative_to(REPO_ROOT))
            for folder in locations.fxts_folders()
            for path in folder.glob("*/*.json")
            if path not in listed
        ]
        assert unlisted == [], "a file in an fxts folder that the listing does not see"
        assert not list(SPEC_ROOT.glob("*/specs/*.json")), "forge-core holds no spec"

    def test_the_spec_listing_sees_every_spec(self) -> None:
        listed = {path.name for path in spec_files(SPEC_ROOT)}
        expected = {path.name for fw in BUILT for path in _specs(fw)}
        assert expected <= listed and len(expected) == 64


@pytest.mark.parametrize("fw", BUILT)
class TestEachFramework:
    def test_f1_and_f8_a_page_with_a_purpose_and_a_true_summary_row(self, fw: str) -> None:
        page = _page(fw)
        assert "\n## Purpose\n" in page
        row = _summary_row(fw)
        assert row is not None, f"{fw.upper()} has no row in forge-core/docs/fxts/README.md"
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

    def test_f4_every_spec_is_approved_or_its_approval_is_an_accepted_gap(self, fw: str) -> None:
        for path in _specs(fw):
            integrity = json.loads(path.read_text(encoding="utf-8"))["integrity"]
            if integrity.get("hash_state") != "approved" or not integrity.get("approved_by"):
                accepted = governance_cli.accepted_checks(fw, path.name, "FAIL")
                assert f"{fw}:hash-approved" in accepted, (
                    f"{path.name} is not approved by the owner, and no accepted gap says so"
                )

    def test_f6_and_f9_a_gate_and_the_commands(self, fw: str) -> None:
        # A framework's gate is with the tests of what its specs describe: forge-core's, the
        # hub's, or under tests/governance while its tests use a module's spec (FB-201).
        gates = [
            REPO_ROOT / "forge-core" / "tests" / "fxts" / fw,
            REPO_ROOT / "forge-hub" / "tests" / "fxts" / fw,
            REPO_ROOT / "tests" / "governance" / fw,
        ]
        assert any(list(gate.glob("test_*.py")) for gate in gates), f"{fw} has no gate"
        assert FRAMEWORKS[fw].schema.is_file()
        assert any(folder.is_dir() for folder in FRAMEWORKS[fw].specs_dirs)

    def test_f11_the_runner_declares_every_check_it_gives(self, fw: str) -> None:
        """D-14 F-11 (D-19 AE-2): the full law is tests/governance/test_declared_checks.py."""
        runner = FRAMEWORKS[fw].make_runner(FRAMEWORKS[fw].schema)
        assert runner.CHECKS, f"{fw} declares none of its checks (forge_core/fxts/{fw}/checks.py)"

    def test_f12_the_schema_marks_every_property(self, fw: str) -> None:
        """D-14 F-12 (D-19 AE-3): every property is a claim, a description or structure,
        split cleanly; the law is tests/governance/test_evidence_claims.py."""
        assert schemas.mark_problems(_schema(fw)) == []

    def test_the_framework_meets_the_whole_baseline(self, fw: str) -> None:
        """A baseline gap is never accepted (FB-266): it is fixed, or the framework is a
        planned one."""
        assert _gaps(fw) == {}, f"{fw} does not meet the baseline: {_gaps(fw)}"
