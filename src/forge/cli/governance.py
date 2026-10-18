"""Spec integrity from the command line (BACKLOG FB-021).

    forge governance specs [--root DIR] [--pending]     hash state of every spec
    forge governance stamp SPEC --by WHO --reason TEXT   re-hash after an edit
    forge governance approve SPEC --by WHO               the owner's approval

``stamp`` wraps :func:`forge.governance.shared.runner.add_spec_hash`: it
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
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any

import typer

from forge.governance.shared.runner import (
    add_spec_hash,
    approve_spec_hash,
    compute_spec_hash,
    verify_spec_hash,
)

#: ``src/forge/governance``: every ``<framework>/specs/*.json`` under it is a spec.
SPEC_ROOT = Path(__file__).resolve().parent.parent / "governance"

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
    return sorted(root.glob("*/specs/*.json"))


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
        "framework": path.parent.parent.name,
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
    if old_hash == new_hash:
        typer.echo(
            f"{spec_file.name}: unchanged, hash {_short(old_hash)} already covers the content "
            f"(state {integrity.get('hash_state') or 'unknown'})."
        )
        return
    add_spec_hash(spec, source=source, changed_by=by, change_type=change_type, reason=reason)
    integrity = spec["integrity"]
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
