"""forge-core's index of its governed files is generated, and current (D-17 A-2)."""

from __future__ import annotations

from forge_core.fxts import index
from forge_core.fxts.shared import lists, schemas


def test_the_page_is_current() -> None:
    assert index.INDEX_PATH.is_file(), "run `forge governance index`"
    assert index.is_current(), "forge-core/fxts/README.md is stale: run `forge governance index`"


def test_it_lists_every_governed_list() -> None:
    page = index.render()
    for name in lists.ALL_NAMES:
        assert f"| [`{name}`](../contract/lists/{name}.list.json) |" in page


def test_it_lists_every_schema_version_and_marks_the_current_one() -> None:
    page = index.render()
    rows = 0
    for framework, schema_dir in index._schema_dirs():
        head = schemas.latest(schema_dir)
        assert head is not None, framework
        for row in schemas.versions(schema_dir):
            mark = "*" if row.version == head.version else ""
            assert f"| {framework} | {row.version}{mark} | {row.step} |" in page
            rows += 1
    assert rows >= 14
    assert "| lists | 0.2.0* |" in page  # the current list format, marked


def test_nothing_in_it_is_typed_by_hand() -> None:
    """The page says so, and rendering twice gives the same text."""
    assert "Do not edit." in index.render()
    assert index.render() == index.render()
