"""Schema versions: the registry, the step rules and the spec's record (D-14 Q-5, FB-151).

The owner's rules: one id form; a released version is never edited and every version is
kept; each version's hash is recorded and approved by the owner; patch is wording, minor
adds something optional, major adds a required field or removes or narrows anything;
each spec records the schema version and hash it was approved against.
"""

from __future__ import annotations

import copy
import json
import shutil
from typing import TYPE_CHECKING, Any

import pytest

from forge_core.fxts.shared import schemas
from forge_hub.cli.governance import FRAMEWORKS, framework_specs

if TYPE_CHECKING:
    from pathlib import Path

MARK = schemas.MARK_KEY
BASE: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "forge://fxts/demo/v1.0.0",
    "type": "object",
    "required": ["spec_version", "name"],
    "properties": {
        "spec_version": {"type": "string", "const": "1.0.0", MARK: "structure"},
        "name": {"type": "string", "description": "The name.", MARK: "claim"},
        "kind": {"type": "string", "enum": ["a", "b"], MARK: "claim"},
        "integrity": {"type": "object", MARK: "structure"},
    },
}
#: An optional property a release adds; a released schema marks every property (D-19, AE-3).
ALIAS: dict[str, Any] = {"type": "string", MARK: "claim"}


def versioned(schema: dict[str, Any], version: str) -> dict[str, Any]:
    out = copy.deepcopy(schema)
    out["$id"] = f"forge://fxts/demo/v{version}"
    out["properties"]["spec_version"]["const"] = version
    return out


@pytest.fixture
def demo(tmp_path: Path) -> Path:
    """A framework named ``demo`` with version 1.0.0 released."""
    schema_dir = tmp_path / "demo" / "schema"
    schema_dir.mkdir(parents=True)
    write(schema_dir, BASE)
    schemas.release(schema_dir, summary="first", released_at="2026-11-19T00:00:00Z")
    return schema_dir


def write(schema_dir: Path, schema: dict[str, Any]) -> None:
    schemas.current_file(schema_dir).write_text(json.dumps(schema, indent=2), encoding="utf-8")


def spec_for(schema_dir: Path, version: str = "1.0.0") -> dict[str, Any]:
    row = schemas.find(schema_dir, version)
    assert row is not None
    return {
        "spec_version": version,
        "name": "x",
        "integrity": {"schema_version": version, "schema_hash": row.schema_hash},
    }


class TestTheStepAChangeNeeds:
    def test_wording_is_a_patch(self) -> None:
        new = copy.deepcopy(BASE)
        new["properties"]["name"]["description"] = "The module's name."
        assert schemas.needed_step(schemas.diff(BASE, new)) == "patch"

    def test_an_optional_field_or_an_enum_value_is_minor(self) -> None:
        new = copy.deepcopy(BASE)
        new["properties"]["alias"] = copy.deepcopy(ALIAS)
        new["properties"]["kind"]["enum"].append("c")
        changes = schemas.diff(BASE, new)
        assert {c.step for c in changes} == {"minor"} and len(changes) == 2

    @pytest.mark.parametrize(
        "edit",
        [
            lambda s: s["required"].append("kind"),
            lambda s: s["properties"].pop("kind"),
            lambda s: s["properties"]["kind"]["enum"].remove("b"),
            lambda s: s["properties"]["name"].update(type="integer"),
            lambda s: s["properties"]["name"].update(maxLength=3),
            lambda s: s.update(additionalProperties=False),
        ],
        ids=["required", "removed", "enum-narrowed", "type", "bound", "closed"],
    )
    def test_a_required_field_a_removal_or_a_narrowing_is_major(self, edit: Any) -> None:
        new = copy.deepcopy(BASE)
        edit(new)
        assert schemas.needed_step(schemas.diff(BASE, new)) == "major"

    def test_the_version_markers_alone_are_no_change(self) -> None:
        assert schemas.diff(BASE, versioned(BASE, "1.0.1")) == []

    def test_step_between_reads_the_numbers(self) -> None:
        assert schemas.step_between("1.2.3", "1.2.4") == "patch"
        assert schemas.step_between("1.2.3", "1.3.0") == "minor"
        assert schemas.step_between("1.2.3", "2.0.0") == "major"
        assert schemas.step_between("1.2.3", "1.2.3") is None
        assert schemas.step_between("1.2.3", "1.1.9") is None


class TestRelease:
    def test_the_first_release_is_a_frozen_copy_awaiting_approval(self, demo: Path) -> None:
        (row,) = schemas.versions(demo)
        assert (row.version, row.step, row.hash_state) == ("1.0.0", "baseline", "pending_review")
        assert row.file.name == "demo.v1.0.0.schema.json" and row.file.is_file()
        assert schemas.registry_problems(demo) == []

    def test_an_edit_without_a_new_version_is_a_problem_and_cannot_be_released(
        self, demo: Path
    ) -> None:
        edited = copy.deepcopy(BASE)
        edited["properties"]["alias"] = copy.deepcopy(ALIAS)
        write(demo, edited)
        (problem,) = schemas.registry_problems(demo)
        assert "differs from version 1.0.0" in problem and "schema-release" in problem
        with pytest.raises(ValueError, match=r"still says 1\.0\.0"):
            schemas.release(demo, summary="x", released_at="t")

    def test_a_step_smaller_than_the_change_needs_is_refused(self, demo: Path) -> None:
        edited = versioned(BASE, "1.0.1")
        edited["required"].append("kind")
        write(demo, edited)
        with pytest.raises(ValueError, match="patch step; these changes need major"):
            schemas.release(demo, summary="x", released_at="t")

    def test_a_minor_release_keeps_both_versions(self, demo: Path) -> None:
        edited = versioned(BASE, "1.1.0")
        edited["properties"]["alias"] = copy.deepcopy(ALIAS)
        write(demo, edited)
        row = schemas.release(demo, summary="alias", released_at="t")
        assert (row.version, row.step) == ("1.1.0", "minor")
        assert [v.version for v in schemas.versions(demo)] == ["1.0.0", "1.1.0"]
        assert schemas.latest(demo) == row and schemas.registry_problems(demo) == []

    def test_the_id_and_the_spec_version_must_agree(self, demo: Path) -> None:
        edited = versioned(BASE, "1.1.0")
        edited["properties"]["spec_version"]["const"] = "1.0.0"
        write(demo, edited)
        with pytest.raises(ValueError, match=r"must be '1\.1\.0'"):
            schemas.release(demo, summary="x", released_at="t")
        edited["$id"] = "forge://governance/demo/v1.1.0"
        write(demo, edited)
        with pytest.raises(ValueError, match="it must be forge://fxts/demo/v"):
            schemas.release(demo, summary="x", released_at="t")

    def test_nothing_to_release_when_nothing_changed(self, demo: Path) -> None:
        with pytest.raises(ValueError, match="nothing to release"):
            schemas.release(demo, summary="x", released_at="t")


class TestAReleasedVersionIsNeverEdited:
    def test_an_edited_frozen_copy_is_named(self, demo: Path) -> None:
        (row,) = schemas.versions(demo)
        row.file.write_text(json.dumps({**BASE, "title": "edited"}), encoding="utf-8")
        assert any("never edited" in p for p in schemas.registry_problems(demo))

    def test_an_unlisted_or_missing_file_is_named(self, demo: Path) -> None:
        shutil.copy(schemas.current_file(demo), demo / "versions" / "demo.v9.9.9.schema.json")
        assert any("not in the registry" in p for p in schemas.registry_problems(demo))
        schemas.versions(demo)[0].file.unlink()
        assert any("is missing" in p for p in schemas.registry_problems(demo))

    def test_no_registry_is_a_problem(self, tmp_path: Path) -> None:
        schema_dir = tmp_path / "demo" / "schema"
        schema_dir.mkdir(parents=True)
        (problem,) = schemas.registry_problems(schema_dir)
        assert "no schema version is registered" in problem


class TestApproval:
    def test_only_an_unedited_live_version_is_approved(self, demo: Path) -> None:
        row = schemas.approve(demo, "1.0.0", by="owner", at="2026-11-19T12:00:00Z")
        assert row.approved and row.approved_by == "owner"
        with pytest.raises(ValueError, match="no registered version"):
            schemas.approve(demo, "3.0.0", by="owner", at="t")
        row.file.write_text("{}", encoding="utf-8")
        with pytest.raises(ValueError, match="no longer matches"):
            schemas.approve(demo, "1.0.0", by="owner", at="t")


class TestWhatASpecRecords:
    def test_a_spec_with_no_record_or_a_stale_one_is_named(self, demo: Path) -> None:
        schemas.approve(demo, "1.0.0", by="owner", at="t")
        spec = spec_for(demo)
        assert schemas.spec_schema_problem(demo, spec) is None
        assert "no integrity block" in str(schemas.spec_schema_problem(demo, {"name": "x"}))
        bare = {**spec, "integrity": {}}
        assert "does not record" in str(schemas.spec_schema_problem(demo, bare))
        other = {**spec, "integrity": {**spec["integrity"], "schema_hash": "0" * 64}}
        assert "the schema changed since" in str(schemas.spec_schema_problem(demo, other))
        moved = {**spec, "spec_version": "1.1.0"}
        assert "stamp it again" in str(schemas.spec_schema_problem(demo, moved))
        unknown = {"spec_version": "7.0.0", "integrity": {**spec["integrity"]}}
        unknown["integrity"]["schema_version"] = "7.0.0"
        assert "is not registered" in str(schemas.spec_schema_problem(demo, unknown))

    def test_an_unapproved_schema_makes_its_specs_wait(self, demo: Path) -> None:
        assert "has not approved its hash" in str(schemas.spec_schema_problem(demo, spec_for(demo)))

    def test_a_minor_step_leaves_a_spec_valid_and_a_major_step_asks_for_review(
        self, demo: Path
    ) -> None:
        schemas.approve(demo, "1.0.0", by="owner", at="t")
        spec = spec_for(demo)
        minor = versioned(BASE, "1.1.0")
        minor["properties"]["alias"] = copy.deepcopy(ALIAS)
        write(demo, minor)
        schemas.release(demo, summary="alias", released_at="t")
        assert schemas.spec_schema_problem(demo, spec) is None
        assert schemas.schema_for_spec(demo, spec).name == "demo.v1.0.0.schema.json"
        major = versioned(minor, "2.0.0")
        major["required"].append("alias")
        write(demo, major)
        schemas.release(demo, summary="alias required", released_at="t")
        problem = str(schemas.spec_schema_problem(demo, spec))
        assert "a major step past 1.0.0" in problem and "migrate-spec" in problem


@pytest.mark.parametrize("fw", sorted(FRAMEWORKS))
class TestEveryFramework:
    def test_its_versions_are_in_order(self, fw: str) -> None:
        assert schemas.registry_problems(FRAMEWORKS[fw].schema.parent) == []

    def test_its_current_schema_has_the_one_id_form(self, fw: str) -> None:
        schema = json.loads(FRAMEWORKS[fw].schema.read_text(encoding="utf-8"))
        match = schemas.ID_FORM.match(schema["$id"])
        assert match and match["framework"] == fw
        assert schema["properties"]["spec_version"]["const"] == match["version"]

    def test_every_spec_records_a_registered_schema(self, fw: str) -> None:
        schema_dir = FRAMEWORKS[fw].schema.parent
        for path in framework_specs(FRAMEWORKS[fw]):
            spec = json.loads(path.read_text(encoding="utf-8"))
            row = schemas.find(schema_dir, spec["integrity"]["schema_version"])
            assert row is not None and row.schema_hash == spec["integrity"]["schema_hash"], path
            assert spec["spec_version"] == row.version, path


def test_the_first_fmts_schema_is_kept_for_history() -> None:
    row = schemas.find(FRAMEWORKS["fmts"].schema.parent, "0.1.0")
    assert row is not None and row.hash_state == "historical" and row.file.is_file()
    with pytest.raises(ValueError, match="history only"):
        schemas.approve(FRAMEWORKS["fmts"].schema.parent, "0.1.0", by="owner", at="t")
