"""Spec integrity and conformance runs from the command line (FB-021, FB-083).

    forge governance specs [--root DIR] [--pending]     hash state of every spec
    forge governance stamp SPEC --by WHO --reason TEXT   re-hash after an edit
    forge governance approve SPEC --by WHO               the owner's approval
    forge governance run FRAMEWORK TARGET                one framework's checks on one spec

``stamp`` wraps :func:`forge_core.fxts.shared.runner.add_spec_hash`: it
recomputes the content hash, pushes the old one into ``change_history``
and leaves the spec ``pending_review`` with no approver.  ``approve`` wraps
:func:`approve_spec_hash` and refuses when the stored hash no longer covers
the content, so an approval always attests to exactly what is in the file.

Only the spec owner approves, on their own word; the command records the
name given to ``--by`` and nothing else, so it must be the owner who runs
it (see ``docs/governance/facts-developer-guide.md``).

Writes replace only the top-level ``integrity`` block in the file: the rest
keeps its bytes (key order, line wrapping, escaping), so the review diff of
an approval is the approval.

``run`` takes the framework (``fats``, ``facts``, ``fvts``, ``ftts``, ``fmts``, ``futs``) and a
target that is either a spec file or the id the framework checks identity
against (endpoint path, ``adapter_id``, ``view_id``, ``transport_id``,
``module_id``); an
id is looked up in the framework's spec directory.  The runner gets the
packaged schema, and the report prints as text or JSON (``--format``,
``--output``).  Exit status 1 when a check fails.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Annotated, Any

import typer

import forge_core.fxts as _fxts
from forge_core import contract
from forge_core.fxts.shared import schemas
from forge_core.fxts.shared.runner import (
    add_spec_hash,
    approve_spec_hash,
    compute_spec_hash,
    verify_spec_hash,
)

if TYPE_CHECKING:
    from collections.abc import Callable

    from forge_core.fxts.shared.runner import FxTSReport, FxTSRunner

#: ``forge-core/src/python/forge_core/fxts``: every ``<framework>/specs/*.json`` under it is a spec.
SPEC_ROOT = Path(_fxts.__file__).resolve().parent  # the frameworks, in forge-core
#: The governed lists have a schema of their own, released like a framework's (FB-234).
LISTS = "lists"
#: The checkout; the FTTS spec lives in its top-level ``specs/``.
REPO_ROOT = Path(__file__).resolve().parents[3]

#: Who or what made a change (the FACTS schema's ``change_history[].source``).
CHANGE_SOURCES = ("manual", "ci", "agent", "spec_update")
CHANGE_TYPES = ("structural", "content", "config")

_INTEGRITY_MARKER = '\n  "integrity": '


def utc_stamp(now: datetime | None = None) -> str:
    """Second-precision UTC timestamp in the ``...Z`` form the specs use."""
    return (now or datetime.now(UTC)).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_spec(path: Path) -> tuple[str, dict[str, Any]]:
    text = path.read_text(encoding="utf-8")
    return text, json.loads(text)


def render_integrity(text: str, integrity: dict[str, Any]) -> str:
    """Return ``text`` with its top-level ``integrity`` block replaced.

    The block is located textually (a two-space-indented top-level key, as
    every spec is written) and re-serialised in the file's own escaping
    style; nothing outside it changes.  A file without such a key is
    re-dumped whole.
    """
    ensure_ascii = text.isascii()
    if text.count(_INTEGRITY_MARKER) == 1:
        start = text.index(_INTEGRITY_MARKER) + len(_INTEGRITY_MARKER)
        _, end = json.JSONDecoder().raw_decode(text, start)
        block = json.dumps(integrity, indent=2, ensure_ascii=ensure_ascii).replace("\n", "\n  ")
        return text[:start] + block + text[end:]
    spec = json.loads(text)
    spec["integrity"] = integrity
    return json.dumps(spec, indent=2, ensure_ascii=ensure_ascii) + "\n"


def write_integrity(path: Path, text: str, integrity: dict[str, Any]) -> None:
    path.write_text(render_integrity(text, integrity), encoding="utf-8")


def spec_files(root: Path) -> list[Path]:
    """Every governed file: each framework's specs, and the governed lists (FB-153)."""
    # The real tree keeps the governed lists in the contract; any other root is self-contained.
    lists = contract.LISTS_DIR if root == SPEC_ROOT else root / "lists"
    return sorted(root.glob("*/specs/*.json")) + sorted(lists.glob("*.list.json"))


def schema_dir_of(spec_file: Path) -> Path | None:
    """The schema directory of the framework a spec file belongs to, when it has a registry."""
    framework = spec_file.resolve().parent.parent
    own = spec_file.resolve().parent / "schema"  # a governed list: the schema is beside it
    for candidate in (own, framework / "schema", contract.schema_dir(framework.name)):
        if (candidate / schemas.REGISTRY_NAME).is_file():
            return candidate
    return None


def schema_record(spec_file: Path, spec: dict[str, Any]) -> dict[str, str]:
    """``schema_version`` and ``schema_hash`` for a spec's integrity block (D-14, F-10).

    Empty for a spec outside a framework with registered schema versions. A spec that
    names a version that is not registered is refused: there is nothing to record.
    """
    schema_dir = schema_dir_of(spec_file)
    if schema_dir is None:
        return {}
    declared = spec.get("spec_version")
    row = schemas.find(schema_dir, declared) if isinstance(declared, str) else None
    if row is None:
        known = ", ".join(v.version for v in schemas.versions(schema_dir))
        typer.echo(
            f"{spec_file.name}: spec_version {declared!r} is not a registered "
            f"{schema_dir.parent.name} schema version (registered: {known})."
        )
        raise typer.Exit(code=1)
    return {"schema_version": row.version, "schema_hash": row.schema_hash}


def describe(path: Path) -> dict[str, Any] | None:
    """One row for ``specs``; ``None`` for a file without an integrity block."""
    try:
        _, spec = load_spec(path)
    except (OSError, ValueError):
        return None
    integrity = spec.get("integrity")
    if not isinstance(integrity, dict):
        return None
    verified, _ = verify_spec_hash(spec)
    return {
        "framework": "lists" if path.parent.name == "lists" else path.parent.parent.name,
        "spec": path.name,
        "hash_state": integrity.get("hash_state") or "unknown",
        "approved_by": integrity.get("approved_by") or "",
        "approved_at": integrity.get("approved_at") or "",
        "verified": verified,
        "spec_hash": integrity.get("spec_hash") or "",
        "path": path,
    }


def _short(digest: str) -> str:
    return digest[:12] if digest else "-"


# -- commands ---------------------------------------------------------------


def specs(
    root: Annotated[
        Path | None,
        typer.Option("--root", help="Root holding <framework>/specs/ (default: forge's own)"),
    ] = None,
    pending: Annotated[
        bool, typer.Option("--pending", help="Only specs whose hash is not approved")
    ] = False,
) -> None:
    """List every spec's hash state, approver and whether the hash still verifies."""
    rows = [row for p in spec_files(root or SPEC_ROOT) if (row := describe(p)) is not None]
    if pending:
        rows = [r for r in rows if r["hash_state"] != "approved" or not r["approved_by"]]
    if not rows:
        typer.echo("No specs with an integrity block found." if not pending else "Nothing pending.")
        return
    width = max(len(r["spec"]) for r in rows)
    typer.echo(
        f"{'FRAMEWORK':<9} {'SPEC':<{width}} {'STATE':<15} {'HASH':<13} {'OK':<3} APPROVED BY"
    )
    for r in rows:
        ok = {True: "yes", False: "NO", None: "-"}[r["verified"]]
        approver = f"{r['approved_by']} {r['approved_at']}".strip() or "-"
        typer.echo(
            f"{r['framework']:<9} {r['spec']:<{width}} {r['hash_state']:<15} "
            f"{_short(r['spec_hash']):<13} {ok:<3} {approver}"
        )
    waiting = sum(1 for r in rows if r["hash_state"] != "approved" or not r["approved_by"])
    broken = sum(1 for r in rows if r["verified"] is False)
    typer.echo(f"{len(rows)} spec(s): {waiting} awaiting approval, {broken} with a hash mismatch.")


def stamp(
    spec_file: Annotated[Path, typer.Argument(help="Spec file to re-hash")],
    by: Annotated[str, typer.Option("--by", help="Who made the change (agent id or user)")],
    reason: Annotated[str, typer.Option("--reason", help="What changed and why (FB-nnn: ...)")],
    source: Annotated[
        str, typer.Option("--source", help="manual | ci | agent | spec_update")
    ] = "manual",
    change_type: Annotated[
        str, typer.Option("--change-type", help="structural | content | config")
    ] = "content",
) -> None:
    """Recompute the hash after an edit: history entry, ``pending_review``, no approver."""
    if source not in CHANGE_SOURCES:
        raise typer.BadParameter(f"--source must be one of {', '.join(CHANGE_SOURCES)}")
    if change_type not in CHANGE_TYPES:
        raise typer.BadParameter(f"--change-type must be one of {', '.join(CHANGE_TYPES)}")
    if not spec_file.exists():
        typer.echo(f"Spec file not found: {spec_file}")
        raise typer.Exit(code=1)
    text, spec = load_spec(spec_file)
    integrity = spec.get("integrity") or {}
    old_hash = integrity.get("spec_hash") or ""
    new_hash = compute_spec_hash(spec)
    record = schema_record(spec_file, spec)
    if old_hash == new_hash:
        if record and any(integrity.get(key) != value for key, value in record.items()):
            # The record of the schema is not part of the hashed content: adding it to a
            # spec whose content is unchanged leaves its state and its approval as they are.
            integrity.update(record)
            write_integrity(spec_file, text, integrity)
            typer.echo(
                f"{spec_file.name}: content unchanged; now records schema "
                f"{record['schema_version']} ({_short(record['schema_hash'])})."
            )
            return
        typer.echo(
            f"{spec_file.name}: unchanged, hash {_short(old_hash)} already covers the content "
            f"(state {integrity.get('hash_state') or 'unknown'})."
        )
        return
    add_spec_hash(spec, source=source, changed_by=by, change_type=change_type, reason=reason)
    integrity = spec["integrity"]
    integrity.update(record)
    integrity["hash_state"] = "pending_review"
    integrity.pop("approved_by", None)
    integrity.pop("approved_at", None)
    if old_hash:  # add_spec_hash put the new entry first
        integrity["change_history"][0]["changed_at"] = utc_stamp()
    write_integrity(spec_file, text, integrity)
    typer.echo(
        f"{spec_file.name}: {_short(old_hash)} -> {_short(new_hash)} by {by}; pending_review. "
        f"Owner approves with: forge governance approve {spec_file} --by <owner>"
    )


def approve(
    spec_file: Annotated[Path, typer.Argument(help="Spec file to approve")],
    by: Annotated[str, typer.Option("--by", help="The approving owner (recorded as approved_by)")],
) -> None:
    """Approve the spec's current hash. Refused when the hash no longer covers the content."""
    if not spec_file.exists():
        typer.echo(f"Spec file not found: {spec_file}")
        raise typer.Exit(code=1)
    if not by.strip():
        raise typer.BadParameter("--by must name the approver")
    text, spec = load_spec(spec_file)
    integrity = spec.get("integrity") or {}
    if not integrity.get("spec_hash"):
        typer.echo(f"{spec_file.name}: no spec_hash to approve; stamp it first.")
        raise typer.Exit(code=1)
    verified, message = verify_spec_hash(spec)
    if not verified:
        typer.echo(
            f"{spec_file.name}: refused. {message} "
            f"Re-stamp first: forge governance stamp {spec_file} --by <who> --reason <why>"
        )
        raise typer.Exit(code=1)
    schema_dir = schema_dir_of(spec_file)
    if schema_dir is not None:
        problem = schemas.spec_schema_problem(schema_dir, spec)
        if problem:
            typer.echo(f"{spec_file.name}: refused. {problem}")
            raise typer.Exit(code=1)
    if integrity.get("hash_state") == "approved" and integrity.get("approved_by") == by:
        typer.echo(
            f"{spec_file.name}: already approved by {by} at {integrity.get('approved_at') or '?'}."
        )
        return
    approve_spec_hash(spec, approved_by=by)
    integrity = spec["integrity"]
    integrity["approved_at"] = utc_stamp()
    write_integrity(spec_file, text, integrity)
    typer.echo(
        f"{spec_file.name}: hash {_short(integrity['spec_hash'])} approved by {by} "
        f"at {integrity['approved_at']}."
    )


# -- run --------------------------------------------------------------------


def _fats_runner(schema: Path) -> FxTSRunner:
    from forge_core.fxts.fats.runners.fats_runner import FATSRunner

    return FATSRunner(schema_path=schema)


def _facts_runner(schema: Path) -> FxTSRunner:
    from forge_core.fxts.facts.runners.facts_runner import FACTSRunner

    return FACTSRunner(schema_path=schema)


def _fvts_runner(schema: Path) -> FxTSRunner:
    from forge_core.fxts.fvts.runners.fvts_runner import FVTSRunner

    return FVTSRunner(schema_path=schema)


def _ftts_runner(schema: Path) -> FxTSRunner:
    from forge_core.fxts.ftts.runners.ftts_runner import FTTSRunner

    return FTTSRunner(schema_path=schema)


def _futs_runner(schema: Path) -> FxTSRunner:
    from forge_core.fxts.futs.runners.futs_runner import FUTSRunner

    return FUTSRunner(schema_path=schema)


def _fmts_runner(schema: Path) -> FxTSRunner:
    from forge import conformance
    from forge_core.fxts.fmts.runners.fmts_runner import FMTSRunner

    return FMTSRunner(schema_path=schema, conformance_kit=conformance)


@dataclass(frozen=True)
class Framework:
    """How the CLI finds, identifies and runs one framework's specs."""

    label: str
    specs_dir: Path
    pattern: str
    schema: Path
    identity: tuple[str, ...]  # path of the id the runner checks the target against
    make_runner: Callable[[Path], FxTSRunner]
    live: bool  # the runner takes a ``live`` flag


FRAMEWORKS: dict[str, Framework] = {
    "fats": Framework(
        "FATS",
        SPEC_ROOT / "fats" / "specs",
        "*.json",
        contract.schema_path("fats"),
        ("endpoint",),
        _fats_runner,
        live=True,
    ),
    "facts": Framework(
        "FACTS",
        SPEC_ROOT / "facts" / "specs",
        "*.facts.json",
        contract.schema_path("facts"),
        ("adapter_identity", "adapter_id"),
        _facts_runner,
        live=True,
    ),
    "fvts": Framework(
        "FVTS",
        SPEC_ROOT / "fvts" / "specs",
        "*.fvts.json",
        contract.schema_path("fvts"),
        ("view_identity", "view_id"),
        _fvts_runner,
        live=False,
    ),
    "ftts": Framework(
        "FTTS",
        SPEC_ROOT / "ftts" / "specs",
        "*.ftts.json",
        contract.schema_path("ftts"),
        ("transport_identity", "transport_id"),
        _ftts_runner,
        live=True,
    ),
    "futs": Framework(
        "FUTS",
        SPEC_ROOT / "futs" / "specs",
        "*.futs.json",
        contract.schema_path("futs"),
        ("identity", "id"),
        _futs_runner,
        live=False,
    ),
    "fmts": Framework(
        "FMTS",
        SPEC_ROOT / "fmts" / "specs",
        "*.fmts.json",
        contract.schema_path("fmts"),
        ("module_identity", "module_id"),
        _fmts_runner,
        live=False,
    ),
}


def identity_of(spec: dict[str, Any], path: tuple[str, ...]) -> str:
    node: Any = spec
    for key in path:
        node = node.get(key) if isinstance(node, dict) else None
    return node if isinstance(node, str) else ""


def resolve_spec(
    framework: Framework, target: str, specs_dir: Path | None = None
) -> tuple[Path, dict[str, Any], str]:
    """``(file, spec, id)`` for a target that is a spec file or an id.

    A file is taken as is and its id read from the spec.  An id is matched
    against the identity field of every spec in the directory.
    """
    path = Path(target)
    if path.is_file():
        spec = json.loads(path.read_text(encoding="utf-8"))
        return path, spec, identity_of(spec, framework.identity) or path.stem
    directory = specs_dir or framework.specs_dir
    for file in sorted(directory.glob(framework.pattern)):
        try:
            spec = json.loads(file.read_text(encoding="utf-8"))
        except ValueError:
            continue
        if identity_of(spec, framework.identity) == target:
            return file, spec, target
    msg = f"no {framework.label} spec for '{target}' in {directory} (pass a spec file instead)"
    raise FileNotFoundError(msg)


async def run_framework(
    name: str, target: str, *, specs_dir: Path | None = None, live: bool = False
) -> FxTSReport:
    """Run one framework's checks on one spec; the report names the file it ran."""
    framework = FRAMEWORKS[name]
    file, spec, ident = resolve_spec(framework, target, specs_dir)
    # The spec is validated against the schema version it declares (D-14, Q-5).
    runner = framework.make_runner(schemas.schema_for_spec(framework.schema.parent, spec))
    kwargs: dict[str, Any] = {"spec": spec}
    if framework.live:
        kwargs["live"] = live
    report = await runner.run(target=ident, **kwargs)
    report.metadata["spec_file"] = str(file)
    return report


def emit_report(report: FxTSReport, fmt: str, output: Path | None) -> None:
    """Print the report (text or JSON) and optionally write the JSON to ``output``."""
    if output is not None:
        output.write_text(report.to_json() + "\n", encoding="utf-8")
    if fmt == "json":
        typer.echo(report.to_json())
        return
    typer.echo(report.summary())
    if not report.passed:
        typer.echo("\nFailed checks:")
        for v in report.verdicts:
            if v.status not in ("PASS", "SKIP"):
                typer.echo(f"  [{v.status}] {v.check_id}: {v.message}")
                for violation in v.violations:
                    typer.echo(f"    -> {violation.field}: {violation.message}")
    else:
        typer.echo("All checks passed.")
    skipped = [v for v in report.verdicts if v.status == "SKIP"]
    if skipped:
        # A skipped check is not a passed one: a waiver or an unverified claim is
        # named on every run, never folded into "passed".
        typer.echo("\nNot checked:")
        for v in skipped:
            typer.echo(f"  [SKIP] {v.check_id}: {v.message}")
    if output is not None:
        typer.echo(f"JSON report written to {output}")


# -- schema versions (D-14 Q-5, FB-151) ---------------------------------------


def _framework_schema_dir(name: str) -> Path:
    key = name.lower()
    if key == LISTS:
        return contract.LISTS_DIR / "schema"
    if key not in FRAMEWORKS:
        known = ", ".join([*FRAMEWORKS, LISTS])
        raise typer.BadParameter(f"unknown framework '{name}' (known: {known})")
    return FRAMEWORKS[key].schema.parent


def schema_rows(names: list[str] | None = None) -> list[dict[str, Any]]:
    """One row per registered schema version, with how many specs are written against it."""
    rows: list[dict[str, Any]] = []
    for name in names or [*sorted(FRAMEWORKS), LISTS]:
        schema_dir = _framework_schema_dir(name)
        head = schemas.latest(schema_dir)
        counts: dict[str, int] = {}
        if name == LISTS:
            written = sorted(contract.LISTS_DIR.glob("*.list.json"))
        else:
            written = sorted(FRAMEWORKS[name].specs_dir.glob(FRAMEWORKS[name].pattern))
        for file in written:
            declared = json.loads(file.read_text(encoding="utf-8")).get("spec_version", "")
            counts[declared] = counts.get(declared, 0) + 1
        rows.extend(
            {
                "framework": name,
                "version": row.version,
                "current": head is not None and row.version == head.version,
                "step": row.step,
                "hash_state": row.hash_state,
                "approved_by": row.approved_by,
                "approved_at": row.approved_at,
                "schema_hash": row.schema_hash,
                "specs": counts.get(row.version, 0),
                "summary": row.summary,
            }
            for row in schemas.versions(schema_dir)
        )
    return rows


def schema_problems(names: list[str] | None = None) -> list[str]:
    return [
        problem
        for name in names or [*sorted(FRAMEWORKS), LISTS]
        for problem in schemas.registry_problems(_framework_schema_dir(name))
    ]


def schemas_command(
    framework: Annotated[
        str | None, typer.Argument(help="One framework (default: every framework)")
    ] = None,
    as_json: Annotated[bool, typer.Option("--json", help="Machine-readable output")] = False,
) -> None:
    """List every schema version: step, approval state, hash, and the specs written against it."""
    names = None
    if framework:
        _framework_schema_dir(framework)
        names = [framework.lower()]
    rows = schema_rows(names)
    problems = schema_problems(names)
    if as_json:
        typer.echo(json.dumps({"versions": rows, "problems": problems}, indent=2))
    else:
        typer.echo(
            f"{'FRAMEWORK':<9} {'VERSION':<9} {'STEP':<9} {'STATE':<15} {'HASH':<13} "
            f"{'SPECS':<5} APPROVED"
        )
        for r in rows:
            mark = "*" if r["current"] else " "
            approver = f"{r['approved_by']} {r['approved_at']}".strip() or "-"
            typer.echo(
                f"{r['framework']:<9} {r['version'] + mark:<9} {r['step']:<9} "
                f"{r['hash_state']:<15} {_short(r['schema_hash']):<13} {r['specs']:<5} {approver}"
            )
        waiting = sum(1 for r in rows if r["hash_state"] == "pending_review")
        typer.echo(
            f"{len(rows)} version(s), * is current: {waiting} awaiting approval, "
            f"{len(problems)} problem(s)."
        )
        for problem in problems:
            typer.echo(f"  PROBLEM {problem}")
    if problems:
        raise typer.Exit(code=1)


def _version_row(schema_dir: Path, version: str) -> schemas.SchemaVersion:
    row = schemas.find(schema_dir, version)
    if row is None:
        known = ", ".join(v.version for v in schemas.versions(schema_dir)) or "none"
        typer.echo(
            f"{schema_dir.parent.name} has no schema version {version} (registered: {known})"
        )
        raise typer.Exit(code=1)
    return row


def schema_diff(
    framework: Annotated[str, typer.Argument(help="fats | facts | fvts | ftts | fmts | futs")],
    old: Annotated[str, typer.Argument(help="The earlier version, e.g. 0.1.0")],
    new: Annotated[
        str | None,
        typer.Argument(help="The later version (default: the schema file as it is now)"),
    ] = None,
) -> None:
    """Show what changed between two schema versions and the version step each change needs."""
    schema_dir = _framework_schema_dir(framework)
    before = _version_row(schema_dir, old).load()
    if new is None:
        after = json.loads(schemas.current_file(schema_dir).read_text(encoding="utf-8"))
        label = "the working file"
    else:
        after = _version_row(schema_dir, new).load()
        label = new
    changes = schemas.diff(before, after)
    if not changes:
        typer.echo(f"{framework} {old} -> {label}: no difference beyond the version.")
        return
    for change in changes:
        typer.echo(f"  [{change.step:<5}] {change.path}: {change.what}")
    typer.echo(
        f"{framework} {old} -> {label}: {len(changes)} change(s); "
        f"they need a {schemas.needed_step(changes)} step."
    )


def schema_release(
    framework: Annotated[str, typer.Argument(help="fats | facts | fvts | ftts | fmts | futs")],
    summary: Annotated[str, typer.Option("--summary", help="What changed and why (FB-nnn: ...)")],
) -> None:
    """Register the edited schema file as a new version, awaiting the owner's approval.

    Raise the version in the file's ``$id`` and in ``spec_version`` first. The step the
    number declares must be at least the step the changes need.
    """
    schema_dir = _framework_schema_dir(framework)
    try:
        row = schemas.release(schema_dir, summary=summary, released_at=utc_stamp())
    except ValueError as exc:
        typer.echo(f"{framework}: refused. {exc}")
        raise typer.Exit(code=1) from exc
    typer.echo(
        f"{framework} {row.version}: released as a {row.step} step, hash "
        f"{_short(row.schema_hash)}, pending_review. Owner approves with: "
        f"forge governance schema-approve {framework} {row.version} --by <owner>"
    )


def schema_approve(
    framework: Annotated[str, typer.Argument(help="fats | facts | fvts | ftts | fmts | futs")],
    version: Annotated[str, typer.Argument(help="The version to approve, e.g. 0.2.0")],
    by: Annotated[str, typer.Option("--by", help="The approving owner (recorded as approved_by)")],
) -> None:
    """Approve one schema version's hash. The owner's command, on their word."""
    if not by.strip():
        raise typer.BadParameter("--by must name the approver")
    schema_dir = _framework_schema_dir(framework)
    try:
        row = schemas.approve(schema_dir, version, by=by, at=utc_stamp())
    except ValueError as exc:
        typer.echo(f"{framework} {version}: refused. {exc}")
        raise typer.Exit(code=1) from exc
    typer.echo(
        f"{framework} {row.version}: hash {_short(row.schema_hash)} approved by {by} "
        f"at {row.approved_at}."
    )


def framework_of(spec_file: Path) -> str | None:
    """The framework a spec file belongs to: by its directory, then by its name."""
    resolved = spec_file.resolve()
    for name, framework in FRAMEWORKS.items():
        if resolved.parent == framework.specs_dir.resolve():
            return name
    stem = spec_file.name.lower()
    return next((name for name in FRAMEWORKS if f".{name}." in stem or name in stem), None)


def validation_errors(spec: dict[str, Any], schema: dict[str, Any]) -> list[str]:
    import jsonschema

    validator = jsonschema.Draft202012Validator(schema)
    return [
        f"{'/'.join(str(part) for part in error.absolute_path) or '<root>'}: {error.message}"
        for error in sorted(validator.iter_errors(spec), key=lambda e: list(e.absolute_path))
    ]


def validate_spec(
    spec_file: Annotated[Path, typer.Argument(help="Path to the spec file to validate")],
    schema_version: Annotated[
        str | None,
        typer.Option(
            "--schema-version",
            help="Validate against this registered version instead of the one the spec declares",
        ),
    ] = None,
) -> None:
    """Validate a spec against the schema version it declares, or a named one."""
    if not spec_file.exists():
        typer.echo(f"Spec file not found: {spec_file}")
        raise typer.Exit(code=1)
    name = framework_of(spec_file)
    if name is None:
        typer.echo("Cannot determine framework from the file's directory or name.")
        raise typer.Exit(code=1)
    _, spec = load_spec(spec_file)
    schema_dir = FRAMEWORKS[name].schema.parent
    if schema_version is not None:
        schema_file = _version_row(schema_dir, schema_version).file
        against = schema_version
    else:
        schema_file = schemas.schema_for_spec(schema_dir, spec)
        against = json.loads(schema_file.read_text(encoding="utf-8")).get("$id", "?")
    errors = validation_errors(spec, json.loads(schema_file.read_text(encoding="utf-8")))
    if schema_version is not None:
        # The spec says which version it is written for; that one line is expected to differ.
        errors = [e for e in errors if not e.startswith("spec_version:")]
    if errors:
        typer.echo(f"[FAIL] {spec_file.name} against {name.upper()} schema {against}:")
        for error in errors:
            typer.echo(f"  -> {error}")
        raise typer.Exit(code=1)
    typer.echo(f"[PASS] {spec_file.name} conforms to {name.upper()} schema {against}.")


def migrate_spec(
    spec_file: Annotated[Path, typer.Argument(help="Spec file to move to a later schema version")],
    to: Annotated[str, typer.Option("--to", help="The registered schema version to move to")],
    by: Annotated[str, typer.Option("--by", help="Who made the change (agent id or user)")],
    reason: Annotated[
        str | None, typer.Option("--reason", help="Why (default: names the two versions)")
    ] = None,
    source: Annotated[
        str, typer.Option("--source", help="manual | ci | agent | spec_update")
    ] = "manual",
) -> None:
    """Move a spec to a later schema version: set ``spec_version``, validate, re-stamp.

    A spec that does not conform to the target version is left untouched and every
    violation is listed: those are the edits a major step asks of its author.
    """
    if not spec_file.exists():
        typer.echo(f"Spec file not found: {spec_file}")
        raise typer.Exit(code=1)
    name = framework_of(spec_file)
    if name is None:
        typer.echo("Cannot determine framework from the file's directory or name.")
        raise typer.Exit(code=1)
    schema_dir = FRAMEWORKS[name].schema.parent
    target = _version_row(schema_dir, to)
    text, spec = load_spec(spec_file)
    declared = str(spec.get("spec_version", ""))
    if declared == to:
        typer.echo(f"{spec_file.name}: already written against {name} {to}.")
        return
    if schemas.find(schema_dir, declared) and schemas.step_between(declared, to) is None:
        typer.echo(f"{spec_file.name}: refused. {to} is not later than {declared}.")
        raise typer.Exit(code=1)
    candidate = {**spec, "spec_version": to}
    errors = validation_errors(candidate, target.load())
    if errors:
        typer.echo(f"{spec_file.name}: does not conform to {name} {to}; nothing was changed:")
        for error in errors:
            typer.echo(f"  -> {error}")
        raise typer.Exit(code=1)
    needle = f'"spec_version": "{declared}"'
    if text.count(needle) != 1:
        typer.echo(f"{spec_file.name}: refused. Could not find its one spec_version line.")
        raise typer.Exit(code=1)
    spec_file.write_text(text.replace(needle, f'"spec_version": "{to}"'), encoding="utf-8")
    stamp(
        spec_file,
        by=by,
        reason=reason or f"schema {name} {declared} -> {to}",
        source=source,
        change_type="structural",
    )
