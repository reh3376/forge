"""The governed lists specs choose from (owner, 2026-11-19; BACKLOG FB-153).

Module functions, application-side protocols, data classes and pruning strategies are
each a list file, hashed and approved like a spec. A list can grow by one approved
change, with no schema version.
"""

from __future__ import annotations

import json
import shutil
from typing import TYPE_CHECKING, Any

import pytest

from forge.cli.governance import SPEC_ROOT, spec_files
from forge_core.fxts.shared import lists
from forge_core.fxts.shared.runner import add_spec_hash, approve_spec_hash

if TYPE_CHECKING:
    from pathlib import Path


@pytest.mark.parametrize("name", lists.ALL_NAMES)
def test_every_list_verifies_and_is_approved_by_the_owner(name: str) -> None:
    governed = lists.load(name)
    assert governed.problems == []
    assert governed.usable and governed.document["integrity"]["approved_by"] == "reh3376"


def test_the_lists_are_listed_with_the_specs() -> None:
    listed = {path.name for path in spec_files(SPEC_ROOT)}
    assert {f"{name}{lists.SUFFIX}" for name in lists.ALL_NAMES} <= listed
    on_disk = {path.name for path in lists.LISTS_DIR.glob("*.json")}
    assert on_disk == {f"{name}{lists.SUFFIX}" for name in lists.ALL_NAMES}


def test_the_first_lists_are_the_owners_answers() -> None:
    assert lists.load(lists.MODULE_FUNCTIONS).ids == {
        "mes", "wms", "cmms", "erp", "nms", "ims", "historian", "scanner", "ot", "display",
        "creds", "mpc", "qms", "lims",
    }  # fmt: skip
    assert lists.load(lists.APPLICATION_PROTOCOLS).ids == {
        "rest", "graphql", "mqtt", "opc-ua", "sql", "amqp", "file",
    }  # fmt: skip
    assert lists.load(lists.DATA_CLASSES).ids == {
        "raw", "curated", "historical", "control", "write-back", "audit", "alarm", "status",
        "config", "live", "request", "artifact", "security",
    }  # fmt: skip
    pruning = lists.load(lists.PRUNING_STRATEGIES)
    assert pruning.ids == {"drop-oldest", "by-class-priority"}
    assert [e["id"] for e in pruning.entries if e.get("default")] == ["drop-oldest"]


def test_each_parent_data_class_has_the_rule_the_owner_gave_it() -> None:
    classes = lists.load(lists.DATA_CLASSES)

    def rule(class_id: str) -> tuple[Any, ...]:
        entry = classes.entry(class_id)
        assert entry is not None
        return entry["direction"], entry["delivery"], entry["stored"], entry["expires"]

    # a command: down, at most once, never stored, expires
    assert rule("control") == ("down", "at-most-once", False, True)
    assert classes.entry("control")["links"] == ["hub-to-module"]
    # a business write-back: once and only once, kept, does not expire as a command does
    assert rule("write-back") == ("down", "once-only", True, False)
    assert rule("raw") == ("up", "at-least-once", True, False)
    assert rule("audit") == ("up", "at-least-once", True, False)
    assert rule("live") == ("up", "latest-wins", False, True)
    assert rule("security")[2] is False  # never stored


def _copy(tmp_path: Path) -> Path:
    copy = tmp_path / "lists"
    shutil.copytree(lists.LISTS_DIR, copy)
    return copy


def _rewrite(directory: Path, name: str, change: Any, *, approve: bool = True) -> None:
    path = lists.list_path(name, directory)
    document = json.loads(path.read_text(encoding="utf-8"))
    change(document)
    document.pop("integrity", None)
    add_spec_hash(document, changed_by="test")
    if approve:
        approve_spec_hash(document, approved_by="test-owner")
    else:
        document["integrity"]["hash_state"] = "pending_review"
        document["integrity"].pop("approved_by", None)
    path.write_text(json.dumps(document), encoding="utf-8")


class TestAListThatCannotBeUsed:
    def test_an_edit_without_a_stamp(self, tmp_path: Path) -> None:
        copy = _copy(tmp_path)
        path = lists.list_path(lists.APPLICATION_PROTOCOLS, copy)
        document = json.loads(path.read_text(encoding="utf-8"))
        document["entries"].append({"id": "soap", "description": "Added by hand."})
        path.write_text(json.dumps(document), encoding="utf-8")
        governed = lists.load(lists.APPLICATION_PROTOCOLS, copy)
        assert not governed.usable and "soap" in governed.ids  # present, but not trusted

    def test_a_stamped_change_the_owner_has_not_approved(self, tmp_path: Path) -> None:
        copy = _copy(tmp_path)
        _rewrite(
            copy,
            lists.MODULE_FUNCTIONS,
            lambda d: d["entries"].append({"id": "hr", "description": "Human resources."}),
            approve=False,
        )
        (problem,) = lists.load(lists.MODULE_FUNCTIONS, copy).problems
        assert "not approved by the owner" in problem

    def test_a_missing_list_or_one_with_no_hash(self, tmp_path: Path) -> None:
        assert "not readable" in lists.load(lists.MODULE_FUNCTIONS, tmp_path).problems[0]
        copy = _copy(tmp_path)
        path = lists.list_path(lists.MODULE_FUNCTIONS, copy)
        document = json.loads(path.read_text(encoding="utf-8"))
        del document["integrity"]
        path.write_text(json.dumps(document), encoding="utf-8")
        assert any("no hash" in p for p in lists.load(lists.MODULE_FUNCTIONS, copy).problems)

    @pytest.mark.parametrize(
        ("change", "expected"),
        [
            (lambda d: d["entries"].append(dict(d["entries"][0])), "listed twice"),
            (lambda d: d["entries"].append({"id": "Bad Id", "description": "x"}), "no usable id"),
            (lambda d: d["entries"].append({"id": "hr"}), "no description"),
            (lambda d: d.update(entries=[]), "no entries"),
            (lambda d: d.update(list="other"), "'list' field"),
        ],
        ids=["duplicate", "bad-id", "no-description", "empty", "wrong-name"],
    )
    def test_a_malformed_list(self, tmp_path: Path, change: Any, expected: str) -> None:
        copy = _copy(tmp_path)
        _rewrite(copy, lists.MODULE_FUNCTIONS, change)
        assert any(expected in p for p in lists.load(lists.MODULE_FUNCTIONS, copy).problems)


class TestSubClasses:
    """A class is parent.child; a sub-class inherits and may only tighten."""

    def test_a_sub_class_of_a_known_parent_is_accepted(self, tmp_path: Path) -> None:
        copy = _copy(tmp_path)
        child = {"id": "control.setpoint", "parent": "control", "description": "A setpoint."}
        _rewrite(copy, lists.DATA_CLASSES, lambda d: d["entries"].append(child))
        governed = lists.load(lists.DATA_CLASSES, copy)
        assert governed.problems == [] and "control.setpoint" in governed.ids
        assert lists.data_class_parent("control.setpoint") == "control"

    @pytest.mark.parametrize(
        ("child", "expected"),
        [
            ({"id": "ghost.value", "parent": "ghost", "description": "x"}, "unknown parent"),
            ({"id": "setpoint", "parent": "control", "description": "x"}, "not named control."),
            (
                {"id": "control.a.b", "parent": "control", "description": "x"},
                "not named control.",
            ),
            (
                {"id": "control.kept", "parent": "control", "stored": True, "description": "x"},
                "may only tighten",
            ),
            (
                {
                    "id": "raw.fast",
                    "parent": "raw",
                    "delivery": "latest-wins",
                    "description": "x",
                },
                "may only tighten",
            ),
        ],
        ids=["unknown-parent", "not-dotted", "too-deep", "loosens-stored", "changes-delivery"],
    )
    def test_a_sub_class_cannot_break_the_rule(
        self, tmp_path: Path, child: dict[str, Any], expected: str
    ) -> None:
        copy = _copy(tmp_path)
        _rewrite(copy, lists.DATA_CLASSES, lambda d: d["entries"].append(child))
        assert any(expected in p for p in lists.load(lists.DATA_CLASSES, copy).problems)

    def test_a_parent_states_every_rule(self, tmp_path: Path) -> None:
        copy = _copy(tmp_path)
        parent = {"id": "telemetry", "parent": None, "description": "No rules given."}
        _rewrite(copy, lists.DATA_CLASSES, lambda d: d["entries"].append(parent))
        problems = " ".join(lists.load(lists.DATA_CLASSES, copy).problems)
        for expected in ("no known direction", "no known delivery rule", "names no link", "stored"):
            assert expected in problems
