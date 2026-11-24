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

import re
from dataclasses import dataclass
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
    """The spec files of one framework from every folder, ordered by file name.

    Only a file named as a spec of that framework (``is_spec_name``) is one: a module spec
    put in an adapter folder is not run as an adapter spec (FB-268).
    """
    found = [
        file
        for folder in spec_dirs(framework, repo_root)
        for file in folder.glob(pattern)
        if is_spec_name(framework, file.name)
    ]
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


# -- what every file in a governed folder is (FB-268) ---------------------------------------

#: The frameworks whose specs live in ``fxts`` folders, and how a spec of each is named. An
#: API spec (FATS) has no suffix of its own: any ``.json`` in a ``fats`` folder that is not
#: named as another kind of governed file is one.
SPEC_SUFFIXES: dict[str, str] = {
    "facts": ".facts.json",
    "fats": ".json",
    "fmts": ".fmts.json",
    "ftts": ".ftts.json",
    "futs": ".futs.json",
    "fvts": ".fvts.json",
}
#: Suffixes that name a spec or a governed list wherever the file is: one outside the
#: governed folders is a stray.
STRAY_SUFFIXES = (*(s for s in SPEC_SUFFIXES.values() if s != ".json"), ".list.json")
#: Suffixes that name a governed file of a kind other than an API spec.
NAMED_SUFFIXES = (*STRAY_SUFFIXES, ".schema.json")
#: The frameworks that have a folder in the contract: those with specs, and the hash
#: framework, which has none (FB-279).
CONTRACT_FRAMEWORKS = (*SPEC_SUFFIXES, "fhts")
#: Where test fixtures live: samples for tests, never governed and never read by the hub.
FIXTURES = re.compile(r"(^|/)tests/(.+/)?fixtures/")


def is_spec_name(framework: str, name: str) -> bool:
    """Whether a file of this name in a framework's folder is a spec of that framework."""
    suffix = SPEC_SUFFIXES.get(framework)
    if suffix is None or not name.endswith(suffix) or name.startswith("."):
        return False
    return framework != "fats" or not name.endswith(NAMED_SUFFIXES)


@dataclass(frozen=True)
class Kind:
    """What a file is to governance.

    ``name`` is one of ``KINDS``. ``framework`` is set for a spec and for a framework's
    schema files; ``owner`` for what lives in an ``fxts`` folder (``forge-hub`` or the
    module's name).
    """

    name: str
    framework: str = ""
    owner: str = ""

    @property
    def governed(self) -> bool:
        return self.name in GOVERNED_KINDS


#: Every kind a governed folder may hold. Anything else in one is ``unknown``.
GOVERNED_KINDS = (
    "spec",
    "object-schema",
    "index",
    "accepted-gaps",
    "schema",
    "schema-version",
    "schema-registry",
    "governed-list",
    "proto",
    "proto-config",
    "placeholder",
)
#: What a file outside the governed folders is: a fixture of the tests, a governed kind of
#: file in the wrong place (a stray), or nothing to governance.
OTHER_KINDS = ("unknown", "fixture", "stray", "not-governed")
KINDS = GOVERNED_KINDS + OTHER_KINDS

_OWNER = rf"(?P<owner>{HUB_FOLDER}|{MODULES_FOLDER}/(?P<module>[^/.][^/]*))/{FXTS_FOLDER}"
_FW = "|".join(CONTRACT_FRAMEWORKS)
_CONTRACT = "forge-core/contract"


@dataclass(frozen=True)
class Rule:
    """One kind of governed file and where it may be: a pattern over the path from the
    repository root, and for a spec the framework whose naming rule it must also meet."""

    kind: str
    pattern: re.Pattern[str]
    spec_framework: str = ""

    def match(self, rel: str) -> Kind | None:
        found = self.pattern.fullmatch(rel)
        if found is None:
            return None
        if self.spec_framework and not is_spec_name(self.spec_framework, rel.rsplit("/", 1)[-1]):
            return None
        groups = found.groupdict()
        owner = groups.get("module") or (HUB_FOLDER if groups.get("owner") else "")
        return Kind(self.kind, self.spec_framework or groups.get("fw") or "", owner)


#: The rules, as data. Each place a governed file may be is one rule, and a file in a
#: governed folder must match exactly one of them (``kind_of``).
RULES: tuple[Rule, ...] = (
    *(Rule("spec", re.compile(rf"{_OWNER}/{fw}/[^/]+"), fw) for fw in SPEC_SUFFIXES),
    Rule(
        "object-schema",
        re.compile(rf"{_OWNER}/fvts/objects/[A-Z][A-Za-z0-9]*\.v[1-9][0-9]*\.schema\.json"),
    ),
    Rule("index", re.compile(rf"(?:{HUB_FOLDER}|forge-core)/{FXTS_FOLDER}/README\.md")),
    Rule("accepted-gaps", re.compile(rf"forge-core/{FXTS_FOLDER}/accepted-gaps\.json")),
    Rule("schema", re.compile(rf"{_CONTRACT}/fxts/(?P<fw>{_FW})/schema/(?P=fw)\.schema\.json")),
    Rule("schema", re.compile(rf"{_CONTRACT}/(?P<fw>lists)/schema/(?P=fw)\.schema\.json")),
    Rule(
        "schema-version",
        re.compile(
            rf"{_CONTRACT}/fxts/(?P<fw>{_FW})/schema/versions/(?P=fw)\.v\d+\.\d+\.\d+\.schema\.json"
        ),
    ),
    Rule(
        "schema-version",
        re.compile(
            rf"{_CONTRACT}/(?P<fw>lists)/schema/versions/(?P=fw)\.v\d+\.\d+\.\d+\.schema\.json"
        ),
    ),
    Rule(
        "schema-registry",
        re.compile(rf"{_CONTRACT}/fxts/(?P<fw>{_FW})/schema/schema-registry\.json"),
    ),
    Rule("schema-registry", re.compile(rf"{_CONTRACT}/(?P<fw>lists)/schema/schema-registry\.json")),
    Rule("governed-list", re.compile(rf"{_CONTRACT}/lists/[a-z][a-z0-9-]*\.list\.json")),
    Rule("proto", re.compile(rf"{_CONTRACT}/proto/[a-z][a-z0-9_]*\.proto")),
    Rule("proto-config", re.compile(rf"{_CONTRACT}/proto/buf(?:\.gen)?\.yaml")),
    Rule("placeholder", re.compile(rf"{_CONTRACT}/fxts/(?P<fw>{_FW})/schema/\.gitkeep")),
)
_GOVERNED_PLACE = re.compile(rf"(?:{_OWNER}|forge-core/{FXTS_FOLDER}|{_CONTRACT})/.+")


def is_governed_place(rel: str) -> bool:
    """Whether a path is inside a folder whose every file must be a governed kind."""
    return _GOVERNED_PLACE.fullmatch(rel) is not None


def matching_rules(rel: str) -> list[Kind]:
    """Every rule's answer for a path: none, one, or (a defect of the rules) several."""
    return [kind for rule in RULES if (kind := rule.match(rel)) is not None]


def kind_of(rel: str) -> Kind:
    """What a file is, from its path relative to the repository root (``/`` separated).

    Total: every path has exactly one kind. In a governed folder it is the one rule that
    matches, or ``unknown``. Elsewhere it is a ``fixture`` under ``tests/**/fixtures/``, a
    ``stray`` when it is named as a governed file, or ``not-governed``. A file elsewhere
    that is not named as one but carries a spec's hash is found by reading it, which this
    does not do (``forge_hub.cli.governance.closed_set_problems``).
    """
    if is_governed_place(rel):
        found = matching_rules(rel)
        if len(found) > 1:  # the rules overlap: a defect of RULES, never of the file
            raise ValueError(f"{rel}: more than one kind: {found}")
        return found[0] if found else Kind("unknown")
    name = rel.rsplit("/", 1)[-1]
    named = name.endswith(STRAY_SUFFIXES) or re.search(
        r"/objects/[A-Z][A-Za-z0-9]*\.v[1-9][0-9]*\.schema\.json$", rel
    )
    if FIXTURES.search(rel):
        return Kind("fixture") if named or name.endswith(".json") else Kind("not-governed")
    return Kind("stray") if named else Kind("not-governed")
