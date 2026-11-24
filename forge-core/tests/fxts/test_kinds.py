"""Every file has exactly one kind to governance: the rules are total and exclusive (FB-268).

The law: a file in a governed folder (an ``fxts`` folder of the hub or a module,
``forge-core/fxts``, ``forge-core/contract``) is exactly one governed kind or ``unknown``;
a file anywhere else is a test fixture, a stray (named as a governed file), or nothing to
governance. ``forge governance check`` refuses ``unknown`` and ``stray``.

What is enumerated, and why it is every case: ``kind_of`` reads only the path, and the
rules (``locations.RULES``) look at four things in it: the owner folder, the folders under
``fxts`` or the contract, the depth, and the file name. The grid crosses every owner, every
folder a rule names and some it does not, a folder nested one deeper than any rule allows,
and every file name a rule names, each in the wrong place too, plus hidden files and plain
files. Each path is classified by ``kind_of`` and by ``oracle`` below, written a second
time, independently of the rules' patterns; and no path may match two rules.

Able to fail: four broken rule sets must each be caught, with the path that shows it.

Skill: ``.claude/skills/verify-fxts-kinds``.
"""

from __future__ import annotations

import itertools
import re
from dataclasses import replace

import pytest

from forge_core.fxts import locations
from forge_core.fxts.locations import RULES, Kind, kind_of, matching_rules

SPEC_FWS = tuple(locations.SPEC_SUFFIXES)
CONTRACT_FWS = (*SPEC_FWS, "fhts")
OWNERS = ("forge-hub", "forge-modules/forge-x", "forge-modules/.hidden")
ELSEWHERE = (
    "docs",
    "forge-core",
    "forge-core/src/python/forge_core/fxts/facts",
    "forge-modules/forge-x",
    "forge-modules/forge-x/src/python/forge_x",
    "tests/governance/futs",
    "tests/governance/futs/fixtures",
    "forge-hub/tests/fixtures/more",
)
NAMES = (
    "forge-x.facts.json",
    "forge-x.fmts.json",
    "x.ftts.json",
    "x.widget.futs.json",
    "forge-x.fvts.json",
    "v1_health.json",
    "data.json",
    ".hidden.json",
    "x.list.json",
    "Thing.v1.schema.json",
    "Thing.v0.schema.json",
    "thing.v1.schema.json",
    "README.md",
    "accepted-gaps.json",
    *(f"{fw}.schema.json" for fw in (*CONTRACT_FWS, "lists", "zzts")),
    *(f"{fw}.v0.1.0.schema.json" for fw in ("facts", "fhts", "lists", "zzts")),
    "facts.v1.schema.json",
    "schema-registry.json",
    "adapter.proto",
    "Adapter.proto",
    "buf.yaml",
    "buf.gen.yaml",
    ".gitkeep",
    ".DS_Store",
    "notes.txt",
)


def _folders() -> list[str]:
    under_fxts = ["", *SPEC_FWS, "fhts", "zzts", "fvts/objects", "fats/nested", "fvts/objects/v2"]
    folders = [f"{owner}/fxts/{sub}".rstrip("/") for owner in OWNERS for sub in under_fxts]
    folders += ["forge-core/fxts", "forge-core/fxts/nested", "forge-core/contract"]
    contract = ["proto", "proto/v2", "lists", "lists/schema", "lists/schema/versions", "lists/old"]
    for fw in (*CONTRACT_FWS, "zzts"):
        contract += [f"fxts/{fw}", f"fxts/{fw}/schema", f"fxts/{fw}/schema/versions"]
    folders += [f"forge-core/contract/{sub}" for sub in contract]
    return folders + list(ELSEWHERE)


GRID = [f"{folder}/{name}" for folder, name in itertools.product(_folders(), NAMES)]


# -- the law, written a second time ------------------------------------------------------


def _spec_name(fw: str, name: str) -> bool:
    if name.startswith("."):
        return False
    if fw == "fats":
        others = (".facts.json", ".fmts.json", ".ftts.json", ".futs.json", ".fvts.json")
        return name.endswith(".json") and not name.endswith((*others, ".list.json", ".schema.json"))
    return name.endswith(f".{fw}.json")


def _object_name(name: str) -> bool:
    return re.fullmatch(r"[A-Z][A-Za-z0-9]*\.v[1-9][0-9]*\.schema\.json", name) is not None


def _version_name(fw: str, name: str) -> bool:
    return re.fullmatch(rf"{fw}\.v[0-9]+\.[0-9]+\.[0-9]+\.schema\.json", name) is not None


def oracle(rel: str) -> Kind:
    *folder, name = rel.split("/")
    owner = ""
    rest: list[str] | None = None
    if folder[:2] == ["forge-hub", "fxts"]:
        owner, rest = "forge-hub", folder[2:]
    elif (
        len(folder) >= 3
        and folder[0] == "forge-modules"
        and folder[2] == "fxts"
        and not folder[1].startswith(".")
    ):
        owner, rest = folder[1], folder[3:]
    if rest is not None:
        if rest == [] and name == "README.md" and owner == "forge-hub":
            return Kind("index")
        if len(rest) == 1 and rest[0] in SPEC_FWS and _spec_name(rest[0], name):
            return Kind("spec", rest[0], owner)
        if rest == ["fvts", "objects"] and _object_name(name):
            return Kind("object-schema", "", owner)
        return Kind("unknown")
    if folder[:2] == ["forge-core", "fxts"]:
        if folder == ["forge-core", "fxts"] and name == "README.md":
            return Kind("index")
        if folder == ["forge-core", "fxts"] and name == "accepted-gaps.json":
            return Kind("accepted-gaps")
        return Kind("unknown")
    if folder[:2] == ["forge-core", "contract"]:
        sub = folder[2:]
        if sub == ["proto"] and re.fullmatch(r"[a-z][a-z0-9_]*\.proto", name):
            return Kind("proto")
        if sub == ["proto"] and name in ("buf.yaml", "buf.gen.yaml"):
            return Kind("proto-config")
        if sub == ["lists"] and re.fullmatch(r"[a-z][a-z0-9-]*\.list\.json", name):
            return Kind("governed-list")
        for fw, schema_folder in [("lists", ["lists", "schema"])] + [
            (fw, ["fxts", fw, "schema"]) for fw in CONTRACT_FWS
        ]:
            if sub == schema_folder and name == f"{fw}.schema.json":
                return Kind("schema", fw)
            if sub == schema_folder and name == "schema-registry.json":
                return Kind("schema-registry", fw)
            if sub == [*schema_folder, "versions"] and _version_name(fw, name):
                return Kind("schema-version", fw)
            if sub == schema_folder and name == ".gitkeep" and fw != "lists":
                return Kind("placeholder", fw)
        return Kind("unknown")
    named = name.endswith((".facts.json", ".fmts.json", ".ftts.json", ".futs.json", ".fvts.json"))
    named = (
        named or name.endswith(".list.json") or (folder[-1:] == ["objects"] and _object_name(name))
    )
    if "tests" in folder and "fixtures" in folder[folder.index("tests") :]:
        return Kind("fixture") if named or name.endswith(".json") else Kind("not-governed")
    return Kind("stray") if named else Kind("not-governed")


def counterexample(rules: tuple[locations.Rule, ...] = RULES) -> str | None:
    original = locations.RULES
    locations.RULES = rules
    try:
        for rel in GRID:
            matched = matching_rules(rel)
            if len(matched) > 1:
                return f"{rel} matches {len(matched)} rules: {matched}"
            got, want = kind_of(rel), oracle(rel)
            if got != want:
                return f"{rel} is {got}; it must be {want}"
    finally:
        locations.RULES = original
    return None


# -- the law -----------------------------------------------------------------------------


def test_the_grid_reaches_every_rule_and_every_kind() -> None:
    assert len(GRID) == len(_folders()) * len(NAMES) > 2500
    reached = {kind_of(rel).name for rel in GRID}
    assert reached == set(locations.KINDS), set(locations.KINDS) - reached
    for rule in RULES:
        assert any(rule.match(rel) for rel in GRID), f"no path in the grid reaches {rule}"


def test_every_path_has_exactly_one_kind() -> None:
    assert counterexample() is None


def test_the_kinds_are_the_ones_named() -> None:
    assert set(locations.GOVERNED_KINDS).isdisjoint(locations.OTHER_KINDS)
    assert {rule.kind for rule in RULES} == set(locations.GOVERNED_KINDS)
    for rel in GRID:
        kind = kind_of(rel)
        assert kind.name in locations.KINDS
        assert kind.governed is (kind.name in locations.GOVERNED_KINDS)


def test_the_repository_today_has_nothing_unknown_or_stray() -> None:
    """Read from the real tree; the gate reads the same through git."""
    import subprocess

    files = subprocess.run(
        [
            "git",
            "-C",
            str(locations.REPO_ROOT),
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
        ],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split()
    odd = [
        (rel, kind_of(rel).name)
        for rel in files
        if "node_modules" not in rel.split("/") and kind_of(rel).name in ("unknown", "stray")
    ]
    assert odd == []


def test_a_spec_of_one_framework_is_never_found_as_another() -> None:
    for fw, other in itertools.product(SPEC_FWS, SPEC_FWS):
        name = f"forge-x.{other}.json" if other != "fats" else "v1_x.json"
        assert locations.is_spec_name(fw, name) is (fw == other), (fw, name)


# -- able to fail ------------------------------------------------------------------------


def _without_name_rule(rules: tuple[locations.Rule, ...]) -> tuple[locations.Rule, ...]:
    """The API rule takes any file in a fats folder, as the glob ``*.json`` did."""
    return tuple(replace(r, spec_framework="") if r.spec_framework == "fats" else r for r in rules)


def _nested_objects(rules: tuple[locations.Rule, ...]) -> tuple[locations.Rule, ...]:
    out = []
    for rule in rules:
        if rule.kind == "object-schema":
            loose = rule.pattern.pattern.replace("/fvts/objects/", "/fvts/objects/(?:[^/]+/)?")
            rule = replace(rule, pattern=re.compile(loose))
        out.append(rule)
    return tuple(out)


def _any_readme_is_an_index(rules: tuple[locations.Rule, ...]) -> tuple[locations.Rule, ...]:
    return (*rules, locations.Rule("index", re.compile(r".+/fxts/README\.md")))


def _gitkeep_anywhere(rules: tuple[locations.Rule, ...]) -> tuple[locations.Rule, ...]:
    return (*rules, locations.Rule("placeholder", re.compile(r"forge-core/contract/.+/\.gitkeep")))


@pytest.mark.parametrize(
    ("broken", "says"),
    [
        (_without_name_rule, "forge-hub/fxts/fats/forge-x.facts.json is"),
        (_nested_objects, "forge-hub/fxts/fvts/objects/v2/Thing.v1.schema.json is"),
        (_any_readme_is_an_index, "forge-hub/fxts/README.md matches 2 rules"),
        (_gitkeep_anywhere, "forge-core/contract/proto/.gitkeep is"),
    ],
    ids=["no-name-rule", "nested-objects", "overlapping-index", "overlapping-placeholder"],
)
def test_a_broken_rule_set_is_caught(broken, says: str) -> None:
    found = counterexample(broken(RULES))
    assert found is not None and found.startswith(says), found
