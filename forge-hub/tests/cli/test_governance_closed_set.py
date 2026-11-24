"""The closed set of governed files and one identity per spec, as the gate checks them (FB-268).

``closed_set_problems`` is handed a tree and its file list of the test's own; the rule that
decides each file's kind is proved for every case in ``forge-core/tests/fxts/test_kinds.py``.
"""

from __future__ import annotations

import dataclasses
import json
from typing import TYPE_CHECKING

import pytest
from typer.testing import CliRunner

from forge_hub.cli import governance
from forge_hub.cli.main import app

if TYPE_CHECKING:
    from pathlib import Path

HUB_VIEW = "forge-hub/fxts/fvts/forge-hub.fvts.json"


def _tree(tmp_path: Path, files: dict[str, object]) -> tuple[Path, list[str]]:
    for rel, content in files.items():
        path = tmp_path / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            content if isinstance(content, str) else json.dumps(content), encoding="utf-8"
        )
    return tmp_path, sorted(files)


SPEC_HASHED = {"name": "x", "integrity": {"spec_hash": "0" * 64}}


@pytest.mark.parametrize(
    ("rel", "content", "says"),
    [
        ("forge-hub/fxts/fats/notes.txt", "x", "not a kind of file this governed folder may hold"),
        ("forge-hub/fxts/fats/nested/v1_x.json", {}, "not a kind of file"),
        ("forge-hub/fxts/fats/forge-x.facts.json", {}, "not a kind of file"),
        ("forge-hub/fxts/fats/.hidden.json", {}, "not a kind of file"),
        ("forge-modules/forge-x/fxts/zzts/x.json", {}, "not a kind of file"),
        ("forge-core/fxts/extra.json", {}, "not a kind of file"),
        ("forge-core/contract/proto/notes.md", "x", "not a kind of file"),
        ("docs/forge-x.facts.json", {}, "a governed file outside the governed folders"),
        (
            "forge-modules/forge-x/specs/x.list.json",
            {},
            "a governed file outside the governed folders",
        ),
        (
            "forge-modules/forge-x/src/v1_health.json",
            SPEC_HASHED,
            "a governed file outside the governed folders",
        ),
    ],
)
def test_a_file_out_of_place_is_refused(
    tmp_path: Path, rel: str, content: object, says: str
) -> None:
    root, files = _tree(tmp_path, {rel: content})
    problems = governance.closed_set_problems(root, files)
    assert len(problems) == 1 and problems[0].startswith(f"{rel}: {says}"), problems


@pytest.mark.parametrize(
    ("rel", "content"),
    [
        ("tests/governance/futs/fixtures/reference.view.futs.json", SPEC_HASHED),
        ("tests/governance/fvts/fixtures/golden/x.json", SPEC_HASHED),
        ("forge-modules/forge-x/node_modules/pkg/x.facts.json", SPEC_HASHED),
        ("forge-modules/forge-x/src/data.json", {"name": "x"}),
        ("README.md", "a document"),
    ],
)
def test_what_governance_leaves_alone(tmp_path: Path, rel: str, content: object) -> None:
    root, files = _tree(tmp_path, {rel: content})
    assert governance.closed_set_problems(root, files) == []


def test_a_file_list_that_cannot_be_read_fails_the_gate(tmp_path: Path) -> None:
    """No .git: the gate cannot see what a commit would hold, and says why (FB-268)."""
    problems = governance.closed_set_problems(tmp_path)
    assert len(problems) == 1 and problems[0].startswith("cannot list the repository's files")


def _object(
    owner: str, entity: str, version: str, schema_id: str | None = None
) -> dict[str, object]:
    return {"$id": schema_id or f"forge://schemas/{owner}/{entity}/{version}", "type": "object"}


def test_an_object_schema_must_say_what_its_name_says(tmp_path: Path) -> None:
    rel = "forge-hub/fxts/fvts/objects/Thing.v1.schema.json"
    root, files = _tree(tmp_path, {rel: _object("forge-hub", "Thing", "v2")})
    problems = governance.closed_set_problems(root, files)
    assert (
        f"{rel}: its $id is 'forge://schemas/forge-hub/Thing/v2'; its name and owner say 'forge://schemas/forge-hub/Thing/v1'"
        in problems
    )


def test_an_object_schema_no_view_uses_is_refused(tmp_path: Path) -> None:
    rel = "forge-hub/fxts/fvts/objects/Thing.v1.schema.json"
    root, files = _tree(tmp_path, {rel: _object("forge-hub", "Thing", "v1")})
    assert (
        f"{rel}: no view spec of forge-hub uses it; remove it or use it"
        in governance.closed_set_problems(root, files)
    )


def test_every_object_schema_the_hub_has_is_used() -> None:
    view = json.loads((governance.REPO_ROOT / HUB_VIEW).read_text(encoding="utf-8"))
    used = {o["schema_path"] for o in view["data_bindings"]["objects"]}
    on_disk = {
        str(p.relative_to(governance.REPO_ROOT))
        for p in (governance.REPO_ROOT / "forge-hub/fxts/fvts/objects").glob("*.json")
    }
    assert used == on_disk and len(used) == 7


def test_the_repository_has_no_closed_set_or_identity_problem() -> None:
    assert governance.closed_set_problems() == []
    assert governance.identity_problems() == []


# -- one identity per spec ---------------------------------------------------------------

FATS = governance.FRAMEWORKS["fats"]


def test_an_api_spec_is_a_method_and_a_path() -> None:
    assert (
        governance.key_of({"method": "POST", "endpoint": "/v1/schemas"}, FATS) == "POST /v1/schemas"
    )
    facts = governance.FRAMEWORKS["facts"]
    assert governance.key_of({"adapter_identity": {"adapter_id": "forge-x"}}, facts) == "forge-x"


def test_each_framework_names_its_files_by_rule() -> None:
    futs = governance.FRAMEWORKS["futs"]
    spec = {"identity": {"id": "alarm-list"}, "spec_kind": "widget"}
    assert governance.expected_file_name(spec, futs) == "alarm-list.widget.futs.json"
    assert governance.expected_file_name({"endpoint": "/v1/x"}, FATS) == ""


def _run(*args: str) -> tuple[int, str]:
    result = CliRunner().invoke(app, ["governance", "run", *args])
    return result.exit_code, result.output


def test_a_path_two_api_specs_share_is_refused_and_named() -> None:
    """Until FB-268 this ran whichever of the two sorted first, and said nothing."""
    code, out = _run("fats", "/v1/schemas")
    assert code == 1
    assert "'/v1/schemas' is 2 FATS specs: GET /v1/schemas (v1_registry_list.json)" in out
    assert "POST /v1/schemas (v1_registry_register.json)" in out


@pytest.mark.parametrize(
    ("target", "spec_file"),
    [
        ("GET /v1/schemas", "v1_registry_list.json"),
        ("POST /v1/schemas", "v1_registry_register.json"),
        ("/v1/health", "v1_health.json"),
    ],
)
def test_a_full_id_or_a_path_one_spec_has_finds_that_spec(target: str, spec_file: str) -> None:
    file, _, ident = governance.resolve_spec(FATS, target)
    assert file.name == spec_file and ident == target.split(" ")[-1]


def test_two_specs_with_one_identity_are_refused(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    folder = tmp_path / "fats"
    folder.mkdir()
    for name in ("v1_a.json", "v1_b.json"):
        (folder / name).write_text(
            json.dumps({"method": "GET", "endpoint": "/v1/a"}), encoding="utf-8"
        )
    monkeypatch.setitem(
        governance.FRAMEWORKS, "fats", dataclasses.replace(FATS, specs_dirs=(folder,))
    )
    assert "fats: v1_a.json and v1_b.json are both 'GET /v1/a'" in governance.identity_problems()
