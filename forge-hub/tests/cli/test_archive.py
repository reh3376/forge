"""The archive is an index into the history, not a copy of old content (D-17 §10, A-4)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from typer.testing import CliRunner

from forge_hub.cli import archive
from forge_hub.cli.main import app

REPO = Path(__file__).resolve().parents[3]
runner = CliRunner()


def _archives() -> list[archive.Archive]:
    return archive.load_archives(REPO)


def test_the_root_has_an_archive_with_the_first_rows() -> None:
    found = {a.directory.as_posix(): a for a in _archives()}
    assert "." in found
    ids = {entry["id"] for entry in found["."].entries}
    assert {"fvts-0-1-0-review-package", "mes-bridge-sidecar", "top-level-cli-copy"} <= ids
    assert sum(len(entry["paths"]) for entry in found["."].entries) == 29


def test_every_index_is_well_formed() -> None:
    for found in _archives():
        assert archive.problems(found) == [], found.directory


def test_a_malformed_row_is_named() -> None:
    entry = {
        "id": "Not An Id",
        "name": "",
        "purpose": "p",
        "retired": "yesterday",
        "reason": "r",
        "replaced_by": None,
        "commit": "abc",
        "paths": [],
    }
    found = archive.problems(archive.Archive(Path(), {"entries": [entry, {"id": "x"}]}))
    text = "\n".join(found)
    for expected in ("kebab-case", "40-character", "not a date", "non-empty list", "name is empty"):
        assert expected in text
    assert "entries[1]: missing" in text


def test_nothing_retired_is_back_in_the_tree() -> None:
    """The content is not kept: a retired path that exists again is an error."""
    for found in _archives():
        assert archive.still_in_tree(found, REPO) == [], found.directory


def test_every_row_points_at_something_the_history_holds() -> None:
    if not archive.history_is_complete(REPO):
        pytest.skip("shallow clone: the commits the archive names are not all present here")
    for found in _archives():
        assert archive.missing_from_history(found, REPO) == [], found.directory


def test_each_generated_page_is_current() -> None:
    """Written once in archive.json, generated above (D-17 A-2): `forge archive index`."""
    for found in _archives():
        page = REPO / found.directory / "archive" / archive.README_NAME
        assert page.is_file(), f"{page} is missing: run `forge archive index`"
        assert page.read_text(encoding="utf-8") == archive.render(found), (
            f"{page} is stale: run `forge archive index`"
        )


def test_an_archive_holds_only_its_index_and_its_page() -> None:
    for found in _archives():
        names = {p.name for p in (REPO / found.directory / "archive").iterdir()}
        assert names == {archive.INDEX_NAME, archive.README_NAME}, found.directory


def test_major_directories_are_found_as_they_appear(tmp_path: Path) -> None:
    assert archive.major_directories(tmp_path) == [Path()]
    (tmp_path / "forge-hub").mkdir()
    (tmp_path / "forge-modules" / "forge-ot" / "archive").mkdir(parents=True)
    index = {"scope": "forge-ot", "entries": []}
    (tmp_path / "forge-modules" / "forge-ot" / "archive" / "archive.json").write_text(
        json.dumps(index), encoding="utf-8"
    )
    assert archive.major_directories(tmp_path) == [
        Path(),
        Path("forge-hub"),
        Path("forge-modules/forge-ot"),
    ]
    loaded = archive.load_archives(tmp_path)
    assert [a.directory for a in loaded] == [Path("forge-modules/forge-ot")]
    assert "# Archive of forge-ot" in archive.render(loaded[0])


def test_the_command_lists_and_shows() -> None:
    listed = runner.invoke(app, ["archive", "list"])
    assert listed.exit_code == 0 and "top-level-cli-copy" in listed.output
    several = runner.invoke(app, ["archive", "show", "mes-bridge-sidecar"])
    assert several.exit_code == 0 and "choose one with --path" in several.output
    unknown = runner.invoke(app, ["archive", "show", "no-such-row"])
    assert unknown.exit_code == 1
    wrong = runner.invoke(app, ["archive", "show", "top-level-cli-copy", "--path", "README.md"])
    assert wrong.exit_code == 1


def test_the_command_reads_a_retired_file_from_the_history() -> None:
    if not archive.history_is_complete(REPO):
        pytest.skip("shallow clone: the commits the archive names are not all present here")
    shown = runner.invoke(app, ["archive", "show", "top-level-cli-copy"])
    assert shown.exit_code == 0 and "Forge CLI" in shown.output
