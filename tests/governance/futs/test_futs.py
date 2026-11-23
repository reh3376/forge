"""FUTS: widget specs and view documents (BACKLOG FB-176; D-16, Q-12 and Q-13).

The gate: every spec in the framework runs through the runner, and each failure it is
allowed is named. The rest holds the runner to its rules with small changes to the
reference view document and to a widget spec.
"""

from __future__ import annotations

import copy
import json
import shutil
from typing import TYPE_CHECKING, Any

import pytest
from jsonschema import Draft202012Validator

from forge_core.fxts import locations
from forge_core.fxts.futs import REPO_ROOT, SCHEMA_PATH
from forge_core.fxts.futs.runners.futs_runner import FUTSRunner
from forge_core.fxts.shared import lists, schemas
from forge_core.fxts.shared.runner import (
    VerdictStatus,
    add_spec_hash,
    approve_spec_hash,
    check_schema_runner_parity,
)

if TYPE_CHECKING:
    from pathlib import Path

PASS, FAIL, SKIP = VerdictStatus.PASS, VerdictStatus.FAIL, VerdictStatus.SKIP
SCHEMA = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
#: Every FUTS spec, each in the folder of what it describes: the widgets are
#: forge-display's, a view is its module's or the hub's.
SPEC_FILES = locations.spec_files("futs", "*.futs.json")
WIDGETS = sorted(
    p.name.removesuffix(".widget.futs.json") for p in SPEC_FILES if ".widget." in p.name
)
VIEW = "forge-ot-ferm-overview"

#: The twelve the owner chose on 2026-11-20.
FIRST_WIDGETS = [
    "action-button", "alarm-banner", "alarm-list", "data-table", "input-field", "level-bar",
    "status-indicator", "text-label", "trend-chart", "two-state-symbol", "value-display",
    "view-link",
]  # fmt: skip
#: The hub's four standard screens (D-16, Q-15; FB-187), by view id and the surface each lays out.
HUB_SCREENS = {
    "forge-hub-status": "hub.status",
    "forge-hub-modules": "hub.modules",
    "forge-hub-governance": "hub.governance",
    "forge-hub-access": "hub.access",
}
#: Failures the gate allows, by spec id. A spec the owner approved is allowed none.
ALLOWED_FAILURES: dict[str, frozenset[str]] = {}
#: Checks that could not be run, by spec id: CEL is compiled by the Go server (FB-181).
NOT_RUN: dict[str, frozenset[str]] = {VIEW: frozenset({"futs:expressions"})}


def _load(name: str) -> dict[str, Any]:
    return json.loads(locations.spec_path("futs", name).read_text(encoding="utf-8"))


def _copy_specs(target: Path) -> None:
    """Every FUTS spec in one folder, for a test that edits a widget spec."""
    target.mkdir()
    for file in SPEC_FILES:
        shutil.copy(file, target / file.name)


def sign(spec: dict[str, Any]) -> dict[str, Any]:
    """Hash and approve, and record the schema, as ``stamp`` and the owner would."""
    spec.pop("integrity", None)
    add_spec_hash(spec, changed_by="test")
    approve_spec_hash(spec, approved_by="reh3376")
    row = schemas.find(SCHEMA_PATH.parent, spec["spec_version"])
    assert row is not None
    spec["integrity"].update(schema_version=row.version, schema_hash=row.schema_hash)
    return spec


@pytest.fixture
def runner() -> FUTSRunner:
    return FUTSRunner(schema_path=SCHEMA_PATH)


@pytest.fixture
def view() -> dict[str, Any]:
    return _load(f"{VIEW}.view.futs.json")


@pytest.fixture
def widget() -> dict[str, Any]:
    return _load("value-display.widget.futs.json")


async def _one(runner: FUTSRunner, spec: dict[str, Any], check: str, **kwargs: Any):
    report = await runner.run(target=spec["identity"]["id"], spec=sign(spec), **kwargs)
    by_id = {v.check_id: v for v in report.verdicts}
    assert f"futs:{check}" in by_id, sorted(by_id)
    return by_id[f"futs:{check}"]


def _text(verdict) -> str:
    return " | ".join(v.message for v in verdict.violations)


def _nodes(node: dict[str, Any]):
    yield node
    for child in node.get("children", []):
        yield from _nodes(child)


def _node(view: dict[str, Any], node_id: str) -> dict[str, Any]:
    return next(n for n in _nodes(view["view"]["root"]) if n["node_id"] == node_id)


class TestSchemaAndParity:
    def test_the_schema_is_valid_and_registered(self) -> None:
        Draft202012Validator.check_schema(SCHEMA)
        assert SCHEMA["$id"] == "forge://fxts/futs/v0.2.0"
        assert schemas.registry_problems(SCHEMA_PATH.parent) == []

    def test_the_runner_enforces_every_schema_field(self, runner: FUTSRunner) -> None:
        assert check_schema_runner_parity(SCHEMA, runner.implemented_fields()) == []

    def test_a_spec_is_one_kind_or_the_other(self, widget: dict[str, Any]) -> None:
        validator = Draft202012Validator(SCHEMA)
        both = {**widget, "view": {}}
        assert list(validator.iter_errors(both))
        neither = {k: v for k, v in widget.items() if k != "widget"}
        assert list(validator.iter_errors(neither))


class TestTheSpecs:
    def test_the_first_widgets_are_the_owners_twelve(self) -> None:
        assert WIDGETS == FIRST_WIDGETS
        assert len(SPEC_FILES) == len(FIRST_WIDGETS) + 1 + len(HUB_SCREENS)

    @pytest.mark.parametrize("path", SPEC_FILES, ids=lambda p: p.name.split(".")[0])
    async def test_every_spec_meets_the_runner(self, runner: FUTSRunner, path: Path) -> None:
        spec = json.loads(path.read_text(encoding="utf-8"))
        ident = spec["identity"]["id"]
        assert path.name == f"{ident}.{spec['spec_kind']}.futs.json"
        report = await runner.run(target=ident, spec=spec)
        by_status: dict[VerdictStatus, set[str]] = {}
        for verdict in report.verdicts:
            by_status.setdefault(verdict.status, set()).add(verdict.check_id)
        assert by_status.get(VerdictStatus.NOT_IMPLEMENTED, set()) == set()
        assert by_status.get(VerdictStatus.ERROR, set()) == set()
        assert by_status.get(FAIL, set()) == ALLOWED_FAILURES.get(ident, frozenset())
        assert by_status.get(SKIP, set()) == NOT_RUN.get(ident, frozenset())
        assert report.hash_verified is True

    def test_every_widget_with_a_binding_shows_quality_and_staleness(self) -> None:
        for name in WIDGETS:
            widget = _load(f"{name}.widget.futs.json")["widget"]
            if widget["bindings"]:
                assert widget["shows"] == {"quality": True, "staleness": True}, name

    def test_the_reference_view_uses_every_container_kind(self, view: dict[str, Any]) -> None:
        used = {n["container"] for n in _nodes(view["view"]["root"]) if "container" in n}
        assert used == lists.load(lists.CONTAINER_KINDS).ids == {"fixed", "reflow", "switch"}


class TestAWidgetSpec:
    async def test_a_bound_widget_must_show_quality_and_staleness(self, runner, widget) -> None:
        widget["widget"]["shows"]["staleness"] = False
        verdict = await _one(runner, widget, "widget-shows")
        assert verdict.status == FAIL and "never shown as a good one" in _text(verdict)

    async def test_names_do_not_collide(self, runner, widget) -> None:
        widget["widget"]["properties"].append(dict(widget["widget"]["properties"][0]))
        assert (await _one(runner, widget, "widget-names")).status == FAIL

    async def test_an_enum_has_values_and_a_default_among_them(self, runner, widget) -> None:
        widget["widget"]["properties"].append(
            {"prop_name": "size", "prop_type": "enum", "prop_required": False}
        )
        assert "no values" in _text(await _one(runner, widget, "widget-properties"))
        widget["widget"]["properties"][-1].update(prop_enum=["s", "m"], prop_default="xl")
        assert "is not one of" in _text(await _one(runner, widget, "widget-properties"))

    async def test_identity_must_match_the_target(self, runner, widget) -> None:
        report = await runner.run(target="something-else", spec=sign(widget))
        assert {v.check_id: v.status for v in report.verdicts}["futs:identity-match"] == FAIL


class TestAViewDocument:
    async def test_the_reference_passes_and_names_what_it_did_not_check(self, runner, view) -> None:
        report = await runner.run(target=VIEW, spec=view)
        skipped = [v for v in report.verdicts if v.status == SKIP]
        assert [v.check_id for v in skipped] == ["futs:expressions"]
        assert skipped[0].message.startswith("NOT CHECKED") and "FB-181" in skipped[0].message

    async def test_a_widget_without_a_spec(self, runner, view) -> None:
        _node(view, "temp")["widget"] = "gauge-dial"
        verdict = await _one(runner, view, "widgets")
        assert verdict.status == FAIL and "no widget spec" in _text(verdict)

    async def test_a_widget_whose_spec_is_not_approved(self, runner, view, tmp_path) -> None:
        specs = tmp_path / "specs"
        _copy_specs(specs)
        path = specs / "value-display.widget.futs.json"
        spec = json.loads(path.read_text(encoding="utf-8"))
        spec["integrity"]["hash_state"] = "pending_review"
        path.write_text(json.dumps(spec), encoding="utf-8")
        verdict = await _one(runner, view, "widgets", specs_dir=specs)
        assert verdict.status == FAIL and "not approved by the owner" in _text(verdict)

    async def test_an_edited_widget_spec_is_not_trusted(self, runner, view, tmp_path) -> None:
        specs = tmp_path / "specs"
        _copy_specs(specs)
        path = specs / "value-display.widget.futs.json"
        spec = json.loads(path.read_text(encoding="utf-8"))
        spec["widget"]["shows"]["quality"] = False
        path.write_text(json.dumps(spec), encoding="utf-8")
        verdict = await _one(runner, view, "widgets", specs_dir=specs)
        assert verdict.status == FAIL and "hash does not verify" in _text(verdict)

    async def test_properties_are_the_widgets_own(self, runner, view) -> None:
        _node(view, "title")["props"] = {"text": 5, "colour": "red", "emphasis": "huge"}
        text = _text(await _one(runner, view, "props"))
        assert "no property 'colour'" in text and "5 is not a string" in text
        assert "'huge' is not one of" in text

    async def test_a_required_property_is_set(self, runner, view) -> None:
        del _node(view, "agitator")["props"]["symbol"]
        assert "required property 'symbol'" in _text(await _one(runner, view, "props"))

    async def test_a_binding_is_to_a_point_of_the_surface(self, runner, view) -> None:
        _node(view, "temp")["bind"]["value"]["point"] = "ferm.pressure"
        verdict = await _one(runner, view, "bindings")
        assert verdict.status == FAIL and "not a point of the surface" in _text(verdict)

    async def test_a_binding_fits_the_points_type(self, runner, view) -> None:
        _node(view, "temp_bar")["bind"]["value"]["point"] = "ferm.agitator_running"
        assert "takes number" in _text(await _one(runner, view, "bindings"))

    async def test_a_required_binding_and_an_unknown_one(self, runner, view) -> None:
        node = _node(view, "agitator")
        node["bind"] = {"speed": {"point": "ferm.temperature"}}
        text = _text(await _one(runner, view, "bindings"))
        assert "no binding 'speed'" in text and "does not bind the required 'state'" in text

    async def test_an_expression_only_where_the_widget_takes_one(self, runner, view) -> None:
        _node(view, "alarms")["bind"]["alarms"]["expression"] = "v"
        assert "does not take an expression" in _text(await _one(runner, view, "bindings"))

    async def test_alarms_are_the_modules_alarms(self, runner, view) -> None:
        _node(view, "alarms")["bind"]["alarms"]["point"] = "ferm.temperature"
        assert "@alarms" in _text(await _one(runner, view, "bindings"))

    async def test_an_action_is_one_the_surface_declares_of_the_right_kind(
        self, runner, view
    ) -> None:
        _node(view, "sp")["act"] = {"submit": "alarm.acknowledge", "erase": "x"}
        text = _text(await _one(runner, view, "actions"))
        assert "asks for a tag_write" in text and "no action 'erase'" in text
        _node(view, "sp")["act"] = {"submit": "ferm.drain"}
        assert "not an action of the surface" in _text(await _one(runner, view, "actions"))

    async def test_an_event_handler_names_a_declared_script(self, runner, view) -> None:
        _node(view, "temp")["on"] = {"changed": "log_it", "exploded": "log_it"}
        text = _text(await _one(runner, view, "events"))
        assert "is not declared by this document" in text and "no event 'exploded'" in text
        view["view"]["scripts"] = [{"script_id": "log_it", "script_path": "../outside.py"}]
        assert "not a file inside the repository" in _text(await _one(runner, view, "events"))

    async def test_node_ids_are_unique(self, runner, view) -> None:
        _node(view, "n_temp")["node_id"] = "temp"
        assert "used twice" in _text(await _one(runner, view, "nodes"))

    async def test_a_fixed_container_places_its_children_and_others_do_not(
        self, runner, view
    ) -> None:
        del _node(view, "temp")["place"]
        _node(view, "n_temp")["place"] = {"x": 0, "y": 0, "w": 10, "h": 10}
        text = _text(await _one(runner, view, "nodes"))
        assert "has no position" in text and "does not place its children" in text

    async def test_a_containers_kind_and_layout_fit(self, runner, view) -> None:
        _node(view, "side")["container"] = "carousel"
        _node(view, "graphic")["layout"]["direction"] = "row"
        text = _text(await _one(runner, view, "nodes"))
        assert "not in the governed list of container kinds" in text
        assert "'direction' does not apply to a 'fixed' container" in text

    async def test_a_switch_shows_a_child_at_every_width(self, runner, view) -> None:
        view["view"]["root"]["layout"]["breakpoints"] = [{"min_width": 900, "show": "elsewhere"}]
        text = _text(await _one(runner, view, "nodes"))
        assert "not a child of 'screen'" in text and "no breakpoint from width 0" in text

    async def test_the_view_spec_must_be_the_modules_and_have_the_surface(
        self, runner, view
    ) -> None:
        bad = copy.deepcopy(view)
        bad["view"]["surface_id"] = "ferm.nowhere"
        assert "no surface" in _text(await _one(runner, bad, "view-spec"))
        bad = copy.deepcopy(view)
        bad["view"]["owner_module"] = "forge-wms"
        assert "belongs to 'forge-ot'" in _text(await _one(runner, bad, "view-spec"))
        bad = copy.deepcopy(view)
        bad["view"]["fvts_spec"] = "src/nowhere.fvts.json"
        assert "not found" in _text(await _one(runner, bad, "view-spec"))

    async def test_a_widget_supports_the_surfaces_profiles(self, runner, view, tmp_path) -> None:
        specs = tmp_path / "specs"
        _copy_specs(specs)
        path = specs / "level-bar.widget.futs.json"
        spec = json.loads(path.read_text(encoding="utf-8"))
        spec["widget"]["profiles"] = ["desktop_hmi"]
        path.write_text(json.dumps(sign(spec)), encoding="utf-8")
        verdict = await _one(runner, view, "profiles", specs_dir=specs)
        assert verdict.status == FAIL and "does not support ['web']" in _text(verdict)

    async def test_an_unapproved_list_of_container_kinds_fails_the_view(
        self, runner, view, tmp_path
    ) -> None:
        copy_dir = tmp_path / "lists"
        shutil.copytree(lists.LISTS_DIR, copy_dir)
        path = lists.list_path(lists.CONTAINER_KINDS, copy_dir)
        document = json.loads(path.read_text(encoding="utf-8"))
        document["entries"].append({"id": "carousel", "description": "Added without approval."})
        path.write_text(json.dumps(document), encoding="utf-8")
        verdict = await _one(runner, view, "lists", lists_dir=copy_dir)
        assert verdict.status == FAIL and "container-kinds" in _text(verdict)


class TestBindingACollection:
    """A binding names a point or an object (FUTS 0.2.0, FB-187)."""

    @pytest.fixture
    def screen(self) -> dict[str, Any]:
        return _load("forge-hub-governance.view.futs.json")

    def test_the_four_hub_screens_lay_out_the_four_surfaces(self) -> None:
        found = {}
        for view_id in HUB_SCREENS:
            view = _load(f"{view_id}.view.futs.json")
            assert view["view"]["owner_module"] == "forge-hub"
            assert view["view"]["root"]["container"] == "reflow"  # works on a phone
            found[view_id] = view["view"]["surface_id"]
        assert found == HUB_SCREENS

    def test_every_object_of_a_surface_is_on_its_screen(self) -> None:
        fvts = json.loads(
            (REPO_ROOT / "forge-hub/fxts/fvts/forge-hub.fvts.json").read_text(encoding="utf-8")
        )
        surfaces = {s["surface_id"]: set(s["objects"]) for s in fvts["surfaces"]}
        for view_id, surface_id in HUB_SCREENS.items():
            view = _load(f"{view_id}.view.futs.json")
            shown = {
                bound["object"]
                for node in _nodes(view["view"]["root"])
                for bound in node.get("bind", {}).values()
                if "object" in bound
            }
            assert shown == surfaces[surface_id], view_id

    async def test_an_object_must_be_one_of_the_surface(self, runner, screen) -> None:
        _node(screen, "files")["bind"]["rows"]["object"] = "hub.module"
        verdict = await _one(runner, screen, "bindings")
        assert verdict.status == FAIL and "not an object of the surface" in _text(verdict)

    async def test_a_binding_names_one_of_the_two(self, runner, screen) -> None:
        _node(screen, "files")["bind"]["rows"] = {"object": "hub.governed_file", "point": "x"}
        assert "names a point or an object, one of them" in _text(
            await _one(runner, screen, "bindings")
        )
        _node(screen, "files")["bind"]["rows"] = {}
        assert "names a point or an object, one of them" in _text(
            await _one(runner, screen, "bindings")
        )

    async def test_a_table_takes_an_object_and_a_value_takes_a_point(
        self, runner, screen, view
    ) -> None:
        _node(screen, "files")["bind"]["rows"] = {"point": "hub.governed_file"}
        assert "takes an object, not a point" in _text(await _one(runner, screen, "bindings"))
        # The reference view is written against 0.1.0, which has no object bindings:
        # the same change there is refused by its own schema version.
        _node(view, "temp")["bind"]["value"] = {"object": "ferm.temperature"}
        old_format = await runner.run(target=VIEW, spec=sign(copy.deepcopy(view)))
        assert {v.check_id: v.status for v in old_format.verdicts}["futs:schema-valid"] == FAIL
        view["spec_version"] = "0.2.0"
        assert "takes a point, not an object" in _text(await _one(runner, view, "bindings"))

    async def test_columns_are_fields_of_the_objects_schema(self, runner, screen) -> None:
        _node(screen, "schemas")["props"]["columns"] = "framework,version,colour"
        verdict = await _one(runner, screen, "props")
        assert verdict.status == PASS  # a string, as the widget declares
        text = _text(await _one(runner, screen, "bindings"))
        assert "'colour' is not a field of 'hub.schema_version'" in text

    async def test_a_collection_takes_no_expression(self, runner, screen, tmp_path) -> None:
        specs = tmp_path / "specs"
        _copy_specs(specs)
        path = specs / "data-table.widget.futs.json"
        spec = json.loads(path.read_text(encoding="utf-8"))
        spec["widget"]["bindings"][0]["expression_allowed"] = True
        path.write_text(json.dumps(sign(spec)), encoding="utf-8")
        _node(screen, "files")["bind"]["rows"]["expression"] = "v"
        text = _text(await _one(runner, screen, "bindings", specs_dir=specs))
        assert "a collection takes no expression" in text

    async def test_the_screens_one_action_is_the_surfaces(self, runner, screen) -> None:
        assert (await _one(runner, screen, "actions")).status == PASS
        _node(screen, "run")["act"]["press"] = "governance.approve"
        assert "not an action of the surface" in _text(await _one(runner, screen, "actions"))


def test_the_reference_view_is_inside_the_repository() -> None:
    view = _load(f"{VIEW}.view.futs.json")["view"]
    assert (REPO_ROOT / view["fvts_spec"]).is_file()
