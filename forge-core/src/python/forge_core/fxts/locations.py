"""Where specs lie (D-17 §10.3, A-3): in the ``fxts`` folder of what they describe.

A spec lives with what it describes. The hub's own specs are in ``forge-hub/fxts``; a
module's are in ``forge-modules/<module>/fxts``. Inside an ``fxts`` folder there is one
folder per framework. forge-core has no specs of its own: its governed files are the
contract.

This is knowledge of the repository's standard structure, which forge-core defines; it
imports nothing of a hub or a module. The folders are found from the checkout (and from
the image, which has the same layout). Every function takes the root, so a test can hand
it a tree of its own.
"""

from __future__ import annotations

from pathlib import Path

#: The checkout: ``forge-core/src/python/forge_core/fxts/locations.py`` is five folders in.
REPO_ROOT = Path(__file__).resolve().parents[5]
HUB_FOLDER = "forge-hub"
MODULES_FOLDER = "forge-modules"
FXTS_FOLDER = "fxts"


def fxts_folders(repo_root: Path = REPO_ROOT) -> list[Path]:
    """Every ``fxts`` folder that exists: the hub's, then each module's by module name."""
    found = [repo_root / HUB_FOLDER / FXTS_FOLDER]
    modules = repo_root / MODULES_FOLDER
    if modules.is_dir():
        found += sorted(path / FXTS_FOLDER for path in modules.iterdir() if path.is_dir())
    return [path for path in found if path.is_dir()]


def spec_dirs(framework: str, repo_root: Path = REPO_ROOT) -> list[Path]:
    """Every folder that holds specs of one framework."""
    return [path / framework for path in fxts_folders(repo_root) if (path / framework).is_dir()]


def spec_files(framework: str, pattern: str = "*.json", repo_root: Path = REPO_ROOT) -> list[Path]:
    """The spec files of one framework from every folder, ordered by file name."""
    found = [file for folder in spec_dirs(framework, repo_root) for file in folder.glob(pattern)]
    return sorted(found, key=lambda path: path.name)


def find_spec(framework: str, name: str, repo_root: Path = REPO_ROOT) -> Path | None:
    """The one spec file of that name, wherever its owner keeps it; None when there is none.

    A file name is the spec's identity within its framework, so two files of one name are a
    defect: the first by folder order is returned and ``duplicates`` reports the rest.
    """
    for folder in spec_dirs(framework, repo_root):
        if (folder / name).is_file():
            return folder / name
    return None


def spec_path(framework: str, name: str, repo_root: Path = REPO_ROOT) -> Path:
    """The spec file of that name; an error naming the folders searched when there is none."""
    found = find_spec(framework, name, repo_root)
    if found is None:
        where = ", ".join(str(folder) for folder in spec_dirs(framework, repo_root)) or "no folder"
        raise FileNotFoundError(f"no {framework} spec named {name} in {where}")
    return found


def duplicates(framework: str, repo_root: Path = REPO_ROOT) -> list[str]:
    """File names that occur in more than one folder of a framework."""
    names = [file.name for file in spec_files(framework, repo_root=repo_root)]
    return sorted({name for name in names if names.count(name) > 1})


def owner_of(spec_file: Path) -> str:
    """The folder a spec belongs to: ``forge-hub`` or the module's name."""
    return spec_file.resolve().parent.parent.parent.name
