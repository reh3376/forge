"""Schema versions for every FxTS framework (D-14 Q-5, F-2 and F-10; BACKLOG FB-151).

The owner's rules, signed 2026-11-18 (``docs/decisions/fxts-framework-baseline.md``):

* one id form, ``forge://fxts/<framework>/v<major.minor.patch>``;
* a released version is never edited, and every version is kept in the tree;
* each version's hash is recorded in a registry and approved by the owner;
* patch is wording only; minor adds something optional; major adds a required field or
  removes or narrows anything, and marks every spec for review;
* each spec records the schema version and hash it was approved against.

Layout, per framework, under ``src/forge/governance/<framework>/schema/``::

    <framework>.schema.json                    the current version (what authors edit)
    versions/<framework>.v<version>.schema.json  one frozen copy per released version
    schema-registry.json                       every version: file, hash, step, approval

The current file is always identical to the frozen copy of the highest version, so a
schema cannot change without a new version: :func:`registry_problems` fails first.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from itertools import pairwise
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from pathlib import Path

REGISTRY_NAME = "schema-registry.json"
HASH_METHOD = "sha256-c14n-v1"
ID_FORM = re.compile(r"^forge://fxts/(?P<framework>[a-z]+)/v(?P<version>\d+\.\d+\.\d+)$")

#: Ordered from least to most: the step a change needs.
STEPS = ("patch", "minor", "major")
#: A version that is in the registry and may have specs written against it, or one kept
#: only because history holds it (restored from the repository's history, no spec uses it).
STATES = ("pending_review", "approved", "historical")

#: Keys that carry wording only: changing them is a patch.
_WORDING = frozenset({"description", "title", "$comment", "examples", "default"})
#: Keys whose values are sub-schemas keyed by name.
_NAMED = ("properties", "$defs", "patternProperties")


def schema_hash(schema: dict[str, Any]) -> str:
    """The hash of a whole schema document, by the method spec hashes use."""
    from forge.governance.shared.runner import sha256_hex_obj

    return sha256_hex_obj(schema)


def parse_version(version: str) -> tuple[int, int, int]:
    major, minor, patch = (int(part) for part in version.split("."))
    return major, minor, patch


def step_between(old: str, new: str) -> str | None:
    """The step the version numbers declare, or ``None`` when ``new`` is not later."""
    a, b = parse_version(old), parse_version(new)
    if b <= a:
        return None
    if b[0] != a[0]:
        return "major"
    return "minor" if b[1] != a[1] else "patch"


def schema_id(framework: str, version: str) -> str:
    return f"forge://fxts/{framework}/v{version}"


@dataclass(frozen=True)
class SchemaVersion:
    """One row of a framework's registry."""

    framework: str
    version: str
    file: Path
    schema_hash: str
    hash_state: str
    approved_by: str
    approved_at: str
    step: str
    summary: str
    released_at: str

    @property
    def approved(self) -> bool:
        return self.hash_state == "approved" and bool(self.approved_by)

    def load(self) -> dict[str, Any]:
        return json.loads(self.file.read_text(encoding="utf-8"))


def frozen_name(framework: str, version: str) -> str:
    return f"versions/{framework}.v{version}.schema.json"


def read_registry(schema_dir: Path) -> dict[str, Any]:
    path = schema_dir / REGISTRY_NAME
    if not path.is_file():
        return {"framework": schema_dir.parent.name, "hash_method": HASH_METHOD, "versions": []}
    return json.loads(path.read_text(encoding="utf-8"))


def write_registry(schema_dir: Path, registry: dict[str, Any]) -> None:
    registry["versions"] = sorted(
        registry["versions"], key=lambda row: parse_version(row["version"])
    )
    (schema_dir / REGISTRY_NAME).write_text(
        json.dumps(registry, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def versions(schema_dir: Path) -> list[SchemaVersion]:
    """Every registered version of the framework whose schema directory this is, oldest first."""
    registry = read_registry(schema_dir)
    framework = registry.get("framework") or schema_dir.parent.name
    return [
        SchemaVersion(
            framework=framework,
            version=row["version"],
            file=schema_dir / row["file"],
            schema_hash=row.get("schema_hash", ""),
            hash_state=row.get("hash_state", "pending_review"),
            approved_by=row.get("approved_by", ""),
            approved_at=row.get("approved_at", ""),
            step=row.get("step", ""),
            summary=row.get("summary", ""),
            released_at=row.get("released_at", ""),
        )
        for row in sorted(registry["versions"], key=lambda r: parse_version(r["version"]))
    ]


def find(schema_dir: Path, version: str) -> SchemaVersion | None:
    return next((v for v in versions(schema_dir) if v.version == version), None)


def latest(schema_dir: Path) -> SchemaVersion | None:
    """The highest version that is not kept for history only."""
    live = [v for v in versions(schema_dir) if v.hash_state != "historical"]
    return live[-1] if live else None


def current_file(schema_dir: Path) -> Path:
    return schema_dir / f"{schema_dir.parent.name}.schema.json"


def schema_for_spec(schema_dir: Path, spec: dict[str, Any]) -> Path:
    """The schema file a spec is written against: the version its ``spec_version`` names.

    A spec that names no registered version gets the current schema, whose ``const`` on
    ``spec_version`` then fails it with the versions that exist.
    """
    declared = spec.get("spec_version")
    row = find(schema_dir, declared) if isinstance(declared, str) else None
    if row is not None and row.file.is_file():
        return row.file
    return current_file(schema_dir)


# ---------------------------------------------------------------------------
# What changed between two versions, and the step it needs
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Change:
    path: str
    what: str
    step: str


def _is_version_marker(path: str) -> bool:
    """``$id`` and the ``const`` of ``spec_version`` change with every version by definition."""
    return path in ("$id", "properties.spec_version.const")


def _compare(old: Any, new: Any, path: str, out: list[Change]) -> None:
    if old == new or _is_version_marker(path):
        return
    key = path.rsplit(".", 1)[-1]
    if key in _WORDING:
        out.append(Change(path, "wording changed", "patch"))
        return
    if isinstance(old, dict) and isinstance(new, dict):
        _compare_objects(old, new, path, out)
        return
    if key == "required" and isinstance(old, list) and isinstance(new, list):
        for name in sorted(set(new) - set(old)):
            out.append(Change(f"{path}[{name}]", "now required", "major"))
        for name in sorted(set(old) - set(new)):
            out.append(Change(f"{path}[{name}]", "no longer required", "minor"))
        return
    if key == "enum" and isinstance(old, list) and isinstance(new, list):
        for value in [v for v in old if v not in new]:
            out.append(Change(f"{path}[{value}]", "value removed", "major"))
        for value in [v for v in new if v not in old]:
            out.append(Change(f"{path}[{value}]", "value added", "minor"))
        return
    # Anything else (a type, a bound, a pattern, a const, additionalProperties) narrows
    # or redefines what a spec may say, so it is treated as the largest step.
    out.append(Change(path, f"changed from {old!r} to {new!r}", "major"))


def _compare_objects(
    old: dict[str, Any], new: dict[str, Any], path: str, out: list[Change]
) -> None:
    named = path.rsplit(".", 1)[-1] in _NAMED
    for key in sorted(set(old) | set(new)):
        child = f"{path}.{key}" if path else key
        if _is_version_marker(child):
            continue
        if key in old and key in new:
            _compare(old[key], new[key], child, out)
        elif key in new:
            if key in _WORDING:
                out.append(Change(child, "wording added", "patch"))
            elif named or key in _NAMED:
                out.append(Change(child, "added", "minor"))
            elif key == "required":
                for name in new[key]:
                    out.append(Change(f"{child}[{name}]", "now required", "major"))
            else:
                out.append(Change(child, f"constraint added: {new[key]!r}", "major"))
        elif key in _WORDING:
            out.append(Change(child, "wording removed", "patch"))
        elif key == "required":
            for name in old[key]:
                out.append(Change(f"{child}[{name}]", "no longer required", "minor"))
        elif named or key in _NAMED:
            out.append(Change(child, "removed", "major"))
        else:
            out.append(Change(child, "constraint removed", "minor"))


def diff(old: dict[str, Any], new: dict[str, Any]) -> list[Change]:
    """Every difference between two schema versions, each with the step it needs."""
    out: list[Change] = []
    _compare(old, new, "", out)
    return out


def needed_step(changes: list[Change]) -> str | None:
    """The largest step among the changes; ``None`` when nothing but the version moved."""
    if not changes:
        return None
    return max((c.step for c in changes), key=STEPS.index)


# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------


def registry_problems(schema_dir: Path) -> list[str]:
    """Everything wrong with a framework's schema versions. Empty when it is in order."""
    framework = schema_dir.parent.name
    rows = versions(schema_dir)
    problems: list[str] = []
    if not rows:
        return [f"{framework}: no schema version is registered ({REGISTRY_NAME} is missing)"]
    seen: set[str] = set()
    for row in rows:
        label = f"{framework} {row.version}"
        if row.version in seen:
            problems.append(f"{label}: registered twice")
        seen.add(row.version)
        if row.hash_state not in STATES:
            problems.append(f"{label}: hash_state {row.hash_state!r} is not one of {STATES}")
        if row.hash_state == "approved" and not row.approved_by:
            problems.append(f"{label}: approved with no approver")
        if not row.file.is_file():
            problems.append(f"{label}: its file {row.file.name} is missing")
            continue
        schema = row.load()
        if schema_hash(schema) != row.schema_hash:
            problems.append(
                f"{label}: {row.file.name} no longer matches its recorded hash; a released "
                "version is never edited, a change is a new version"
            )
        if row.hash_state != "historical" and schema.get("$id") != schema_id(
            framework, row.version
        ):
            problems.append(
                f"{label}: $id is {schema.get('$id')!r}, not {schema_id(framework, row.version)!r}"
            )
    listed = {row.file.name for row in rows}
    versions_dir = schema_dir / "versions"
    if versions_dir.is_dir():
        for path in sorted(versions_dir.glob("*.json")):
            if path.name not in listed:
                problems.append(f"{framework}: {path.name} is not in the registry")
    head = latest(schema_dir)
    working = current_file(schema_dir)
    if head is None:
        problems.append(f"{framework}: no live version is registered")
    elif not working.is_file():
        problems.append(f"{framework}: {working.name} is missing")
    elif schema_hash(json.loads(working.read_text(encoding="utf-8"))) != head.schema_hash:
        problems.append(
            f"{framework}: {working.name} differs from version {head.version}; a schema change "
            f"needs a new version: forge governance schema-release {framework}"
        )
    live = [row for row in rows if row.hash_state != "historical" and row.file.is_file()]
    for before, after in pairwise(live):
        declared = step_between(before.version, after.version)
        needed = needed_step(diff(before.load(), after.load()))
        if needed and declared and STEPS.index(declared) < STEPS.index(needed):
            problems.append(
                f"{framework} {after.version}: a {declared} step from {before.version}, but its "
                f"changes need a {needed} step"
            )
    return problems


def spec_schema_problem(schema_dir: Path, spec: dict[str, Any]) -> str | None:
    """Why a spec's record of its schema does not stand, or ``None`` when it does (F-10)."""
    framework = schema_dir.parent.name
    integrity = spec.get("integrity")
    if not isinstance(integrity, dict):
        return "no integrity block, so no record of the schema it was approved against"
    recorded = integrity.get("schema_version")
    recorded_hash = integrity.get("schema_hash")
    if not recorded or not recorded_hash:
        return (
            "the spec does not record the schema version and hash it was approved against; stamp it"
        )
    if spec.get("spec_version") != recorded:
        return (
            f"spec_version is {spec.get('spec_version')!r} but the spec was stamped against "
            f"schema {recorded}; stamp it again"
        )
    row = find(schema_dir, recorded)
    if row is None:
        known = ", ".join(v.version for v in versions(schema_dir)) or "none"
        return f"schema version {recorded} is not registered for {framework} (registered: {known})"
    if row.schema_hash != recorded_hash:
        return (
            f"schema {recorded} has hash {row.schema_hash[:12]}, the spec was approved against "
            f"{recorded_hash[:12]}: the schema changed since; the spec needs review"
        )
    if not row.approved:
        return (
            f"schema {framework} {recorded} is {row.hash_state}: the owner has not approved its "
            "hash"
        )
    head = latest(schema_dir)
    if head is not None and parse_version(head.version)[0] > parse_version(recorded)[0]:
        return (
            f"schema {framework} is at {head.version}, a major step past {recorded}: the spec "
            f"needs review (forge governance migrate-spec <spec> --to {head.version})"
        )
    return None


# ---------------------------------------------------------------------------
# Changes to the registry
# ---------------------------------------------------------------------------


def release(schema_dir: Path, *, summary: str, released_at: str) -> SchemaVersion:
    """Register the current schema file as a new version, awaiting the owner's approval.

    The file's ``$id`` names the version. It must be later than every registered one, and
    the step its number declares must be at least the step its changes need.
    """
    framework = schema_dir.parent.name
    working = current_file(schema_dir)
    schema = json.loads(working.read_text(encoding="utf-8"))
    match = ID_FORM.match(str(schema.get("$id", "")))
    if not match or match["framework"] != framework:
        msg = f"$id is {schema.get('$id')!r}; it must be {schema_id(framework, '<version>')}"
        raise ValueError(msg)
    version = match["version"]
    const = schema.get("properties", {}).get("spec_version", {}).get("const")
    if const != version:
        msg = f"properties.spec_version.const is {const!r}; it must be {version!r}, as in $id"
        raise ValueError(msg)
    head = latest(schema_dir)
    step = "baseline"
    if head is not None:
        if schema_hash(schema) == head.schema_hash:
            msg = f"{working.name} is version {head.version} unchanged; there is nothing to release"
            raise ValueError(msg)
        declared = step_between(head.version, version)
        if declared is None:
            msg = (
                f"{working.name} has changed but its $id still says {version}; the registered "
                f"version is {head.version}. Raise the version in $id and in spec_version"
            )
            raise ValueError(msg)
        needed = needed_step(diff(head.load(), schema)) or "patch"
        if STEPS.index(declared) < STEPS.index(needed):
            msg = f"{head.version} -> {version} is a {declared} step; these changes need {needed}"
            raise ValueError(msg)
        step = declared
    frozen = schema_dir / frozen_name(framework, version)
    frozen.parent.mkdir(exist_ok=True)
    frozen.write_text(working.read_text(encoding="utf-8"), encoding="utf-8")
    registry = read_registry(schema_dir)
    registry["versions"].append(
        {
            "version": version,
            "file": frozen_name(framework, version),
            "schema_hash": schema_hash(schema),
            "hash_state": "pending_review",
            "step": step,
            "summary": summary,
            "released_at": released_at,
        }
    )
    write_registry(schema_dir, registry)
    found = find(schema_dir, version)
    assert found is not None
    return found


def approve(schema_dir: Path, version: str, *, by: str, at: str) -> SchemaVersion:
    """Record the owner's approval of one version's hash. Refused when the file changed."""
    row = find(schema_dir, version)
    if row is None:
        msg = f"{schema_dir.parent.name} has no registered version {version}"
        raise ValueError(msg)
    if row.hash_state == "historical":
        msg = f"{version} is kept for history only; no spec is written against it"
        raise ValueError(msg)
    if schema_hash(row.load()) != row.schema_hash:
        msg = f"{row.file.name} no longer matches its recorded hash; nothing to approve"
        raise ValueError(msg)
    registry = read_registry(schema_dir)
    for entry in registry["versions"]:
        if entry["version"] == version:
            entry["hash_state"] = "approved"
            entry["approved_by"] = by
            entry["approved_at"] = at
    write_registry(schema_dir, registry)
    found = find(schema_dir, version)
    assert found is not None
    return found
