"""FVTS gate for the hub's own view contract, and the rules for objects (BACKLOG FB-177).

This is the ``conformance_tests.suite_path`` of ``forge-hub.fvts.json``: the hub's
screens are the first thing forge-display renders (D-16, Q-15). The hub is not a module,
so it has no FACTS spec, and its screens show collections of things (objects), not live
points. The rest of the file holds the runner and the reference renderer to the rules
for objects with small changes to a copy of the spec.
"""

from __future__ import annotations

import copy
import json
import shutil
from pathlib import Path
from typing import Any

import pytest

from forge_core.fxts.fvts import REPO_ROOT, SCHEMA_PATH
from forge_core.fxts.fvts.renderer import (
    GoldenRenderError,
    ReferenceRenderer,
    load_golden_messages,
    render_golden_set,
)
from forge_core.fxts.fvts.runners.fvts_runner import HUB_OWNER, FVTSRunner
from forge_core.fxts.shared.runner import VerdictStatus, sha256_hex_obj
from forge_hub import fxts as hub_fxts

HUB_SPEC_PATH = hub_fxts.specs_dir("fvts") / "forge-hub.fvts.json"
GOLDEN = Path(__file__).resolve().parent / "golden"
PASS, FAIL = VerdictStatus.PASS, VerdictStatus.FAIL

#: Failures the gate allows. Empty: the owner approved the hub's view spec.
ALLOWED_FAILURES: frozenset[str] = frozenset()
#: The four screens the owner put first (D-16, Q-15), and what each shows.
SCREENS = {
    "hub.status": ["hub.component"],
    "hub.modules": ["hub.module"],
    "hub.governance": ["hub.governed_file", "hub.schema_version"],
    "hub.access": ["hub.user", "hub.role", "hub.assignment"],
}


@pytest.fixture(scope="module")
def runner() -> FVTSRunner:
    return FVTSRunner(schema_path=SCHEMA_PATH)


@pytest.fixture
def hub() -> dict[str, Any]:
    return json.loads(HUB_SPEC_PATH.read_text(encoding="utf-8"))


async def _verdict(runner: FVTSRunner, spec: dict[str, Any], check: str, **kwargs: Any):
    report = await runner.run(target=spec["view_identity"]["view_id"], spec=spec, **kwargs)
    return {v.check_id: v for v in report.verdicts}[f"fvts:{check}"]


def _text(verdict) -> str:
    return " | ".join(v.message for v in verdict.violations)


class TestTheHubsContract:
    async def test_it_passes_every_check(self, runner: FVTSRunner, hub: dict[str, Any]) -> None:
        report = await runner.run(target="forge-hub-views", spec=hub)
        by_status: dict[VerdictStatus, set[str]] = {}
        for verdict in report.verdicts:
            by_status.setdefault(verdict.status, set()).add(verdict.check_id)
        assert by_status.get(VerdictStatus.NOT_IMPLEMENTED, set()) == set()
        assert by_status.get(VerdictStatus.ERROR, set()) == set()
        assert by_status.get(FAIL, set()) == ALLOWED_FAILURES, [
            (v.check_id, v.message) for v in report.verdicts if v.status is FAIL
        ]
        assert report.hash_verified is True and report.total == 21

    def test_it_is_the_hubs_and_shows_the_four_screens(self, hub: dict[str, Any]) -> None:
        assert hub["view_identity"]["owner_module"] == HUB_OWNER == "forge-hub"
        assert "facts_spec_ref" not in hub["view_identity"]
        assert {s["surface_id"]: s["objects"] for s in hub["surfaces"]} == SCREENS
        assert hub["data_bindings"]["points"] == []

    def test_every_object_schema_is_the_file_the_spec_names(self, hub: dict[str, Any]) -> None:
        for entry in hub["data_bindings"]["objects"]:
            document = json.loads((REPO_ROOT / entry["schema_path"]).read_text(encoding="utf-8"))
            assert document["$id"] == entry["schema_ref"]
            assert sha256_hex_obj(document) == entry["schema_hash"], entry["object_id"]
            assert entry["key_field"] in document["required"]
            assert document["additionalProperties"] is False

    def test_the_golden_set_renders_on_every_profile(self, hub: dict[str, Any]) -> None:
        messages = load_golden_messages(GOLDEN)
        assert len(messages) == 9
        for profile in ("desktop_hmi", "desktop_app", "web", "mobile"):
            run = render_golden_set(hub, profile, messages)
            assert run.errors == [] and run.rendered == 9, (profile, run.errors)

    def test_it_writes_nothing_and_assigns_no_role(self, hub: dict[str, Any]) -> None:
        """Approving a spec and assigning a role stay off the screens until roles are
        enforced (FB-075): the one action is running a spec's checks."""
        assert [(a["action_id"], a["kind"]) for a in hub["actions"]] == [
            ("governance.run_checks", "module_command")
        ]


class TestObjects:
    async def test_a_contract_with_no_point_and_no_object_shows_nothing(self, runner, hub) -> None:
        hub["data_bindings"]["objects"] = []
        for surface in hub["surfaces"]:
            surface["objects"] = []
        hub["actions"] = []
        hub["surfaces"][2]["actions"] = []
        assert "shows nothing" in _text(await _verdict(runner, hub, "objects"))

    async def test_a_changed_object_schema_needs_the_spec_approved_again(
        self, runner, hub, tmp_path: Path
    ) -> None:
        repo = tmp_path / "repo"
        entry = hub["data_bindings"]["objects"][0]
        target = repo / entry["schema_path"]
        target.parent.mkdir(parents=True)
        shutil.copy(REPO_ROOT / entry["schema_path"], target)
        document = json.loads(target.read_text(encoding="utf-8"))
        document["properties"]["severity"] = {"type": "string"}
        target.write_text(json.dumps(document), encoding="utf-8")
        hub["data_bindings"]["objects"] = [entry]
        verdict = await _verdict(runner, hub, "objects", repo_root=repo)
        assert verdict.status is FAIL and "has changed since this spec was stamped" in _text(
            verdict
        )

    async def test_the_schema_must_be_a_file_in_the_repository(self, runner, hub) -> None:
        hub["data_bindings"]["objects"][0]["schema_path"] = "../elsewhere.schema.json"
        hub["data_bindings"]["objects"][1]["schema_path"] = "src/nowhere.schema.json"
        text = _text(await _verdict(runner, hub, "objects"))
        assert text.count("is not a file in the repository") == 2

    async def test_the_reference_the_owner_and_the_key_must_fit(self, runner, hub) -> None:
        objects = hub["data_bindings"]["objects"]
        objects[0]["schema_ref"] = "forge://schemas/forge-hub/Component/v2"
        objects[1]["schema_ref"] = "forge://schemas/forge-wms/Module/v1"
        objects[2]["key_field"] = "approved_by"  # a field, but not a required one
        text = _text(await _verdict(runner, hub, "objects"))
        assert "the document's $id is" in text
        assert "is not a schema of 'forge-hub'" in text
        assert "key field 'approved_by' is not a required field" in text

    async def test_a_command_targets_a_declared_object(self, runner, hub) -> None:
        hub["actions"][0]["target_object"] = "hub.nothing"
        assert "targets unknown object 'hub.nothing'" in _text(
            await _verdict(runner, hub, "objects")
        )

    async def test_a_surface_shows_only_declared_objects_and_ids_are_unique(
        self, runner, hub
    ) -> None:
        hub["surfaces"][0]["objects"].append("hub.ghost")
        assert "shows unknown object 'hub.ghost'" in _text(
            await _verdict(runner, hub, "surface-refs")
        )
        hub["data_bindings"]["objects"].append(copy.deepcopy(hub["data_bindings"]["objects"][0]))
        assert "duplicate object_id" in _text(await _verdict(runner, hub, "unique-ids"))

    async def test_a_module_still_needs_a_facts_spec(self, runner, hub) -> None:
        """Only the hub is exempt: any other owner must be a module with a FACTS spec."""
        hub["view_identity"]["owner_module"] = "forge-somewhere"
        verdict = await _verdict(runner, hub, "owner-in-facts")
        assert verdict.status is FAIL and "has no FACTS spec" in _text(verdict)


class TestRenderingObjects:
    def test_columns_come_from_the_schema(self, hub: dict[str, Any]) -> None:
        view = ReferenceRenderer(hub, "web").render(
            {
                "message_type": "object_list",
                "object_id": "hub.component",
                "items": [{"name": "hub", "status": "up", "checked_at": "2026-11-21T12:00:00Z"}],
            }
        )
        assert view == {
            "view": "objects",
            "object_id": "hub.component",
            "key_field": "name",
            "columns": ["name", "status", "reason", "checked_at"],
            "rows": 1,
            "delivery": "push",
        }

    def test_an_item_outside_the_schema_is_refused(self, hub: dict[str, Any]) -> None:
        renderer = ReferenceRenderer(hub, "web")
        item = {"name": "hub", "status": "fine", "checked_at": "2026-11-21T12:00:00Z"}
        with pytest.raises(GoldenRenderError, match=r"object hub\.component item 0"):
            renderer.render(
                {"message_type": "object_list", "object_id": "hub.component", "items": [item]}
            )
        extra = {"name": "hub", "status": "up", "checked_at": "x", "password": "no"}
        with pytest.raises(GoldenRenderError, match="item 0"):
            renderer.render(
                {"message_type": "object_list", "object_id": "hub.component", "items": [extra]}
            )

    def test_two_items_cannot_share_a_key_and_the_object_must_be_declared(
        self, hub: dict[str, Any]
    ) -> None:
        renderer = ReferenceRenderer(hub, "web")
        item = {"name": "hub", "status": "up", "checked_at": "2026-11-21T12:00:00Z"}
        with pytest.raises(GoldenRenderError, match="two items share the key name='hub'"):
            renderer.render(
                {"message_type": "object_list", "object_id": "hub.component", "items": [item, item]}
            )
        with pytest.raises(GoldenRenderError, match=r"is not declared in data_bindings\.objects"):
            renderer.render({"message_type": "object_list", "object_id": "hub.lots", "items": []})

    def test_a_surface_lists_its_objects(self, hub: dict[str, Any]) -> None:
        view = ReferenceRenderer(hub, "mobile").render(
            {"message_type": "surface_render", "surface_id": "hub.governance"}
        )
        assert view["objects"] == ["hub.governed_file", "hub.schema_version"]
        assert view["actions_visible"] == ["governance.run_checks"] and view["points"] == []
