"""The governance command finds specs in every folder that holds them (FB-200, FB-201).

A spec lives with what it describes (D-17 A-3): the hub's own specs are in
``forge-hub/fxts``, a module's in ``forge-modules/<module>/fxts``, one folder per framework.
forge-core holds none. One listing, one count per schema version and one lookup by id read
all of them.
"""

from __future__ import annotations

from forge_core.fxts import locations
from forge_hub import fxts as hub_fxts
from forge_hub.cli import governance


def test_the_hub_keeps_its_api_specs_in_its_own_folder() -> None:
    folder = hub_fxts.specs_dir("fats")
    assert folder == hub_fxts.FXTS_DIR / "fats"
    assert len(list(folder.glob("*.json"))) == 28


def test_forge_core_holds_no_spec() -> None:
    """Its framework folders hold code and no ``specs`` folder (FB-201)."""
    assert not list(governance.SPEC_ROOT.glob("*/specs/*.json"))
    assert not list(governance.SPEC_ROOT.rglob("*.f?ts.json"))


def test_every_module_keeps_its_own_specs() -> None:
    folders = {path.parent.name for path in locations.fxts_folders()}
    assert {"forge-hub", "forge-ot", "forge-wms", "forge-mes", "forge-display"} <= folders
    assert locations.owner_of(locations.spec_path("facts", "forge-wms.facts.json")) == "forge-wms"
    assert locations.owner_of(locations.spec_path("fvts", "forge-hub.fvts.json")) == "forge-hub"
    widgets = [file for file in locations.spec_files("futs") if ".widget." in file.name]
    assert len(widgets) == 12 and {locations.owner_of(file) for file in widgets} == {
        "forge-display"
    }
    for module in ("forge-ot", "forge-wms"):
        for file in (locations.REPO_ROOT / "forge-modules" / module / "fxts").glob("*/*.json"):
            assert file.name.startswith(module), f"{file} is in another module's folder"


def test_every_framework_is_looked_for_in_every_fxts_folder() -> None:
    for name, framework in governance.FRAMEWORKS.items():
        assert framework.specs_dirs == tuple(locations.spec_dirs(name))
        assert all(
            folder.name == name and folder.parent.name == "fxts" for folder in framework.specs_dirs
        )
    assert hub_fxts.specs_dir("fats") in governance.FRAMEWORKS["fats"].specs_dirs


def test_the_listing_names_the_framework_and_sees_every_spec() -> None:
    files = governance.spec_files(governance.SPEC_ROOT)
    rows = [row for file in files if (row := governance.describe(file)) is not None]
    by_framework: dict[str, int] = {}
    for row in rows:
        by_framework[row["framework"]] = by_framework.get(row["framework"], 0) + 1
    assert by_framework == {
        "facts": 9, "fats": 28, "fmts": 9, "ftts": 1, "futs": 17, "fvts": 2, "lists": 6,
    }  # fmt: skip
    hub_file = hub_fxts.specs_dir("fats") / "healthz.json"
    assert governance.framework_dir_of(hub_file).name == "fats"
    assert governance.framework_of(hub_file) == "fats"
    module_file = locations.spec_path("facts", "forge-wms.facts.json")
    assert governance.framework_dir_of(module_file).name == "facts"
    assert governance.framework_of(module_file) == "facts"


def test_a_spec_finds_its_frameworks_schema_wherever_it_lies() -> None:
    for file in (
        hub_fxts.specs_dir("fats") / "healthz.json",
        locations.spec_path("fmts", "forge-ot.fmts.json"),
    ):
        schema_dir = governance.schema_dir_of(file)
        assert schema_dir is not None and schema_dir.parent.name == file.parent.name


def test_a_spec_is_found_by_its_id_wherever_it_lies() -> None:
    fats = governance.FRAMEWORKS["fats"]
    file, _, ident = governance.resolve_spec(fats, "/healthz")
    assert file.parent == hub_fxts.specs_dir("fats") and ident == "/healthz"
    facts = governance.FRAMEWORKS["facts"]
    file, _, _ = governance.resolve_spec(facts, "forge-wms")
    assert locations.owner_of(file) == "forge-wms"


def test_no_spec_file_name_is_in_two_folders() -> None:
    """Two files of one name in one framework would make an id ambiguous."""
    for name in governance.FRAMEWORKS:
        assert locations.duplicates(name) == [], name


def test_a_missing_spec_is_an_error_that_names_where_it_looked() -> None:
    import pytest

    assert locations.find_spec("facts", "no-such.facts.json") is None
    with pytest.raises(FileNotFoundError, match=r"no facts spec named no-such\.facts\.json in "):
        locations.spec_path("facts", "no-such.facts.json")


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
