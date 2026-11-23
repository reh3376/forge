"""The governance command finds specs in every folder that holds them (FB-200, D-17 A-3).

A spec lives with what it describes: the hub's own specs are in ``forge-hub/fxts``, the
modules' are still in forge-core's framework folders until FB-201. One listing, one count
per schema version and one lookup by id read both.
"""

from __future__ import annotations

from forge_hub import fxts as hub_fxts
from forge_hub.cli import governance


def test_the_hub_keeps_its_api_specs_in_its_own_folder() -> None:
    folder = hub_fxts.specs_dir("fats")
    assert folder == hub_fxts.FXTS_DIR / "fats"
    assert len(list(folder.glob("*.json"))) == 28
    assert not list((governance.SPEC_ROOT / "fats" / "specs").glob("*.json"))


def test_every_framework_is_looked_for_in_both_places() -> None:
    for name, framework in governance.FRAMEWORKS.items():
        assert framework.specs_dirs == (
            governance.SPEC_ROOT / name / "specs",
            hub_fxts.FXTS_DIR / name,
        )


def test_the_listing_names_the_framework_in_either_layout() -> None:
    files = governance.spec_files(governance.SPEC_ROOT)
    rows = [row for file in files if (row := governance.describe(file)) is not None]
    by_framework: dict[str, int] = {}
    for row in rows:
        by_framework[row["framework"]] = by_framework.get(row["framework"], 0) + 1
    assert by_framework["fats"] == 28
    assert "fxts" not in by_framework and "specs" not in by_framework
    assert set(by_framework) <= {*governance.FRAMEWORKS, governance.LISTS}
    hub_file = hub_fxts.specs_dir("fats") / "healthz.json"
    assert governance.framework_dir_of(hub_file).name == "fats"
    assert governance.framework_of(hub_file) == "fats"
    module_file = governance.SPEC_ROOT / "facts" / "specs" / "forge-wms.facts.json"
    assert governance.framework_dir_of(module_file).name == "facts"


def test_a_spec_of_the_hub_finds_its_frameworks_schema() -> None:
    hub_file = hub_fxts.specs_dir("fats") / "healthz.json"
    schema_dir = governance.schema_dir_of(hub_file)
    assert schema_dir is not None and schema_dir.parent.name == "fats"


def test_a_spec_is_found_by_its_id_wherever_it_lies() -> None:
    fats = governance.FRAMEWORKS["fats"]
    file, _, ident = governance.resolve_spec(fats, "/healthz")
    assert file.parent == hub_fxts.specs_dir("fats") and ident == "/healthz"
    facts = governance.FRAMEWORKS["facts"]
    file, _, _ = governance.resolve_spec(facts, "forge-wms")
    assert file.parent == governance.SPEC_ROOT / "facts" / "specs"


def test_no_spec_file_name_is_in_two_folders() -> None:
    """Two files of one name in one framework would make an id ambiguous."""
    for name, framework in governance.FRAMEWORKS.items():
        names = [file.name for file in governance.framework_specs(framework)]
        assert len(names) == len(set(names)), name


def test_the_hubs_index_is_generated_and_current() -> None:
    page = governance.HUB_INDEX_PATH
    assert page.is_file(), "run `forge governance index`"
    text = governance.render_hub_index()
    assert page.read_text(encoding="utf-8") == text, f"{page.name} is stale: run the command"
    assert "Do not edit." in text
    assert text.count("| [`") == len(list(hub_fxts.FXTS_DIR.glob("*/*.json")))
    assert "| [`healthz.json`](fats/healthz.json) | `/healthz` | 0.1.0 | approved |" in text


def test_the_index_command_covers_both_pages() -> None:
    pages = [page for page, _ in governance.index_pages()]
    assert governance.HUB_INDEX_PATH in pages and len(pages) == 2
