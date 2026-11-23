"""Governed lists: values a spec chooses from, that can grow without a schema version.

The owner, 2026-11-19 (FB-153): the module functions, the application-side protocols, the
data classes and the pruning strategies are each "a governed list file", hashed and
approved like a spec. A schema says only that a field takes an entry of a list; the runner
checks it. Adding an entry is one approved change to the list: no schema version, no spec
touched.

A list is ``forge-core/src/python/forge_core/fxts/lists/<name>.list.json`` with ``list``, ``title``,
``description``, ``entries`` (each with an ``id`` and a ``description``) and the same
``integrity`` block a spec carries. ``forge governance stamp`` and ``approve`` work on it.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

LISTS_DIR = Path(__file__).resolve().parent.parent / "lists"
SUFFIX = ".list.json"
ENTRY_ID = re.compile(r"^[a-z][a-z0-9-]*$")

MODULE_FUNCTIONS = "module-functions"
APPLICATION_PROTOCOLS = "application-protocols"
DATA_CLASSES = "data-classes"
PRUNING_STRATEGIES = "pruning-strategies"
CONTAINER_KINDS = "container-kinds"
#: The lists a module spec (FMTS) chooses from.
NAMES = (MODULE_FUNCTIONS, APPLICATION_PROTOCOLS, DATA_CLASSES, PRUNING_STRATEGIES)
#: Every governed list in the tree.
ALL_NAMES = (*NAMES, CONTAINER_KINDS)


@dataclass(frozen=True)
class GovernedList:
    name: str
    path: Path
    document: dict[str, Any]
    problems: list[str] = field(default_factory=list)

    @property
    def entries(self) -> list[dict[str, Any]]:
        entries = self.document.get("entries")
        return entries if isinstance(entries, list) else []

    @property
    def ids(self) -> set[str]:
        return {str(entry.get("id")) for entry in self.entries if isinstance(entry, dict)}

    def entry(self, entry_id: str) -> dict[str, Any] | None:
        return next((e for e in self.entries if e.get("id") == entry_id), None)

    @property
    def usable(self) -> bool:
        """Its content matches its hash and the owner approved it."""
        return not self.problems


def list_path(name: str, lists_dir: Path | None = None) -> Path:
    return (lists_dir or LISTS_DIR) / f"{name}{SUFFIX}"


def _shape_problems(name: str, document: dict[str, Any]) -> list[str]:
    problems = []
    if document.get("list") != name:
        problems.append(f"{name}: its 'list' field is {document.get('list')!r}")
    entries = document.get("entries")
    if not isinstance(entries, list) or not entries:
        return [*problems, f"{name}: it has no entries"]
    seen: set[str] = set()
    for index, entry in enumerate(entries):
        entry_id = entry.get("id") if isinstance(entry, dict) else None
        if not isinstance(entry_id, str) or not all(
            ENTRY_ID.match(part) for part in entry_id.split(".")
        ):
            problems.append(f"{name}: entry {index} has no usable id ({entry_id!r})")
            continue
        if entry_id in seen:
            problems.append(f"{name}: {entry_id} is listed twice")
        seen.add(entry_id)
        if not str(entry.get("description") or "").strip():
            problems.append(f"{name}: {entry_id} has no description")
    return problems


def _data_class_problems(document: dict[str, Any]) -> list[str]:
    """Each parent has exactly one rule; a sub-class names a parent and restates no rule."""
    name = DATA_CLASSES
    problems = []
    entries = [e for e in document.get("entries", []) if isinstance(e, dict)]
    parents = {e["id"] for e in entries if e.get("parent") is None and "id" in e}
    rules = ("direction", "links", "delivery", "stored", "expires")
    for entry in entries:
        entry_id = str(entry.get("id"))
        parent = entry.get("parent")
        if parent is None:
            if "." in entry_id:
                problems.append(f"{name}: {entry_id} has a dotted id but no parent")
            if entry.get("direction") not in document.get("directions", []):
                problems.append(f"{name}: {entry_id} has no known direction")
            if entry.get("delivery") not in document.get("deliveries", []):
                problems.append(f"{name}: {entry_id} has no known delivery rule")
            links = entry.get("links")
            if not isinstance(links, list) or not links:
                problems.append(f"{name}: {entry_id} names no link it may travel")
            elif set(links) - set(document.get("links", [])):
                problems.append(f"{name}: {entry_id} names an unknown link")
            for key in ("stored", "expires"):
                if not isinstance(entry.get(key), bool):
                    problems.append(f"{name}: {entry_id} does not say whether it is {key}")
        else:
            if parent not in parents:
                problems.append(f"{name}: {entry_id} names the unknown parent {parent!r}")
            if not entry_id.startswith(f"{parent}.") or entry_id.count(".") != 1:
                problems.append(f"{name}: {entry_id} is not named {parent}.<child>")
            restated = [key for key in rules if key in entry]
            if restated:
                problems.append(
                    f"{name}: {entry_id} restates {restated}; a sub-class inherits its "
                    "parent's rules and may only tighten its numbers"
                )
    return problems


def load(name: str, lists_dir: Path | None = None) -> GovernedList:
    """A governed list with everything wrong with it; ``usable`` when nothing is."""
    from forge_core.fxts.shared.runner import verify_spec_hash

    path = list_path(name, lists_dir)
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return GovernedList(name, path, {}, [f"{name}: not readable as JSON: {exc}"])
    problems = _shape_problems(name, document)
    if name == DATA_CLASSES:
        problems += _data_class_problems(document)
    integrity = document.get("integrity")
    if not isinstance(integrity, dict) or not integrity.get("spec_hash"):
        problems.append(f"{name}: it carries no hash; stamp it")
    else:
        verified, message = verify_spec_hash(document)
        if verified is not True:
            problems.append(f"{name}: {message}")
        if integrity.get("hash_state") != "approved" or not integrity.get("approved_by"):
            problems.append(
                f"{name}: its hash is {integrity.get('hash_state') or 'unknown'}, not approved "
                "by the owner"
            )
    return GovernedList(name, path, document, problems)


def data_class_parent(class_id: str) -> str:
    return class_id.split(".", 1)[0]
