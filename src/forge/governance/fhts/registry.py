"""FHTS Hash Verification Registry.

Adapted from MDEMG ``internal/unts/registry.go``.

The registry is the central store for hash verification state across all
FxTS frameworks.  Each spec tracked by any framework (FATS, FACTS, FQTS, …)
can be registered here.  The registry provides:

  * Current hash + status per tracked spec
  * Last ``MAX_HISTORY`` historical hash values with change metadata
  * Verify-now (recompute on-disk hash vs expected)
  * Revert to a previous hash from history
  * Approve / reject hash state transitions
  * JSON file persistence (git-friendly, CI-friendly)

Design goals:
  1. **Self-contained** — registry is a single JSON file, no external DB.
  2. **AI agent governance** — every change records who/what/why so that
     unauthorized modifications by coding agents are detectable.
  3. **Framework-agnostic** — any FxTS framework can register specs.
"""

from __future__ import annotations

import json
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from forge.governance.shared.runner import (
    MAX_HASH_HISTORY,
    compute_spec_hash,
)

# ---------------------------------------------------------------------------
# Status enum values (strings, not a StrEnum — for JSON compat)
# ---------------------------------------------------------------------------

VERIFIED = "verified"
MISMATCH = "mismatch"
UNKNOWN = "unknown"
REVERTED = "reverted"

VALID_STATUSES = frozenset({VERIFIED, MISMATCH, UNKNOWN, REVERTED})

# Sources that can trigger a hash change
VALID_SOURCES = frozenset({
    "manifest", "spec", "revert", "manual", "ci", "agent", "spec_update",
})


# ---------------------------------------------------------------------------
# Data models — mirrors MDEMG UNTS FileRecord / HistoryEntry
# ---------------------------------------------------------------------------


class RegistryHistoryEntry(BaseModel):
    """A single historical hash value for a tracked file.

    Mirrors MDEMG UNTS ``HistoryEntry`` with additional governance fields.
    """

    hash: str
    updated_at: str  # ISO8601
    source: str = "unknown"  # manifest | spec | revert | manual | ci | agent
    changed_by: str = ""  # Actor identifier
    reason: str = ""  # Why the change happened


class TrackedFileRecord(BaseModel):
    """Verification state for a single tracked spec or file.

    Mirrors MDEMG UNTS ``FileRecord``.
    """

    path: str  # Repository-relative path
    framework: str  # fats | facts | fqts | fsts | flts | fnts | fots | fpts | fdts
    current_hash: str  # SHA-256 hex
    status: str = UNKNOWN  # verified | mismatch | unknown | reverted
    updated_at: str = ""  # ISO8601
    history: list[RegistryHistoryEntry] = Field(default_factory=list)
    source_ref: str = ""  # Where this hash is enforced (spec file, manifest, etc.)
    approved_by: str = ""  # Who approved current state
    approved_at: str = ""  # When approved


class RegistryFile(BaseModel):
    """Top-level JSON structure for the persisted registry.

    Stored at ``governance/fhts/specs/fhts-registry.json``.
    """

    version: str = "1.0.0"
    updated_at: str = ""
    description: str = (
        "FHTS Hash Verification Registry — tracks all hash-verified "
        "specs across Forge governance frameworks"
    )
    files: list[TrackedFileRecord] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Registry implementation
# ---------------------------------------------------------------------------


class FHTSRegistry:
    """In-memory hash verification registry with JSON file persistence.

    Thread-safe.  Mirrors MDEMG ``internal/unts/registry.go``.

    Usage::

        registry = FHTSRegistry(base_path=Path("src/forge/governance"))
        registry.load()  # Load from fhts/specs/fhts-registry.json

        registry.register("facts/specs/whk-wms.facts.json", "facts", hash, "whk-wms spec")
        results = registry.verify_all()
        registry.save()
    """

    REGISTRY_FILENAME = "fhts/specs/fhts-registry.json"

    def __init__(self, base_path: Path | str) -> None:
        self._base_path = Path(base_path)
        self._files: dict[str, TrackedFileRecord] = {}
        self._lock = threading.RLock()

    # -- Persistence --------------------------------------------------------

    def load(self) -> None:
        """Load registry from disk.  Missing file is OK (empty registry)."""
        with self._lock:
            registry_path = self._base_path / self.REGISTRY_FILENAME
            if not registry_path.exists():
                return

            data = json.loads(registry_path.read_text(encoding="utf-8"))
            rf = RegistryFile(**data)
            self._files = {f.path: f for f in rf.files}

    def save(self) -> None:
        """Persist registry to disk as formatted JSON."""
        with self._lock:
            rf = RegistryFile(
                updated_at=datetime.now(UTC).isoformat(),
                files=list(self._files.values()),
            )
            registry_path = self._base_path / self.REGISTRY_FILENAME
            registry_path.parent.mkdir(parents=True, exist_ok=True)
            registry_path.write_text(
                rf.model_dump_json(indent=2) + "\n",
                encoding="utf-8",
            )

    # -- Query --------------------------------------------------------------

    def get(self, path: str) -> TrackedFileRecord | None:
        """Get a tracked file record by path."""
        with self._lock:
            return self._files.get(path)

    def list_files(
        self,
        framework: str = "",
        status: str = "",
    ) -> list[TrackedFileRecord]:
        """List tracked files, optionally filtered by framework and/or status."""
        with self._lock:
            result = []
            for f in self._files.values():
                if framework and f.framework != framework:
                    continue
                if status and f.status != status:
                    continue
                result.append(f)
            return result

    def get_history(self, path: str) -> list[RegistryHistoryEntry]:
        """Get hash change history for a tracked file."""
        with self._lock:
            record = self._files.get(path)
            if record is None:
                return []
            return list(record.history)

    # -- Mutations ----------------------------------------------------------

    def register(
        self,
        path: str,
        framework: str,
        initial_hash: str,
        source_ref: str = "",
        source: str = "manual",
        changed_by: str = "",
    ) -> TrackedFileRecord:
        """Register a new file or update an existing one.

        If the file exists and the hash changed, the old hash is pushed
        into history (maintaining the last ``MAX_HASH_HISTORY`` entries).
        """
        with self._lock:
            now = datetime.now(UTC).isoformat()

            if path in self._files:
                existing = self._files[path]
                if existing.current_hash != initial_hash:
                    # Push current to history
                    existing.history.insert(
                        0,
                        RegistryHistoryEntry(
                            hash=existing.current_hash,
                            updated_at=existing.updated_at,
                            source=source,
                            changed_by=changed_by,
                        ),
                    )
                    existing.history = existing.history[:MAX_HASH_HISTORY]
                    existing.current_hash = initial_hash
                    existing.updated_at = now
                    existing.status = UNKNOWN
                if source_ref:
                    existing.source_ref = source_ref
                return existing

            record = TrackedFileRecord(
                path=path,
                framework=framework,
                current_hash=initial_hash,
                status=UNKNOWN,
                updated_at=now,
                source_ref=source_ref,
            )
            self._files[path] = record
            return record

    def update_hash(
        self,
        path: str,
        new_hash: str,
        source: str = "manual",
        changed_by: str = "",
        reason: str = "",
    ) -> TrackedFileRecord:
        """Update expected hash for a tracked file.

        Pushes old hash into history.  Mirrors MDEMG UNTS ``UpdateHash``.
        """
        with self._lock:
            record = self._files.get(path)
            if record is None:
                msg = f"File not tracked: {path}"
                raise KeyError(msg)

            now = datetime.now(UTC).isoformat()
            record.history.insert(
                0,
                RegistryHistoryEntry(
                    hash=record.current_hash,
                    updated_at=record.updated_at,
                    source=source,
                    changed_by=changed_by,
                    reason=reason,
                ),
            )
            record.history = record.history[:MAX_HASH_HISTORY]
            record.current_hash = new_hash
            record.updated_at = now
            record.status = UNKNOWN
            record.approved_by = ""
            record.approved_at = ""
            return record

    def revert_hash(
        self,
        path: str,
        target_hash: str | None = None,
        reverted_by: str = "",
        reason: str = "",
    ) -> TrackedFileRecord:
        """Revert to a previous hash value from history.

        If ``target_hash`` is None, reverts to the most recent history entry.
        Mirrors MDEMG UNTS ``RevertHash``.
        """
        with self._lock:
            record = self._files.get(path)
            if record is None:
                msg = f"File not tracked: {path}"
                raise KeyError(msg)

            if target_hash is None:
                if not record.history:
                    msg = f"No history available for revert: {path}"
                    raise ValueError(msg)
                target_hash = record.history[0].hash
            else:
                # Verify target exists in history
                known = {h.hash for h in record.history}
                if target_hash not in known:
                    msg = f"Target hash not in history: {target_hash[:16]}…"
                    raise ValueError(msg)

            now = datetime.now(UTC).isoformat()
            record.history.insert(
                0,
                RegistryHistoryEntry(
                    hash=record.current_hash,
                    updated_at=record.updated_at,
                    source="revert",
                    changed_by=reverted_by,
                    reason=reason or f"Reverted to {target_hash[:16]}…",
                ),
            )
            record.history = record.history[:MAX_HASH_HISTORY]
            record.current_hash = target_hash
            record.updated_at = now
            record.status = REVERTED
            return record

    def approve(
        self,
        path: str,
        approved_by: str = "",
    ) -> TrackedFileRecord:
        """Mark a tracked file's current hash as approved."""
        with self._lock:
            record = self._files.get(path)
            if record is None:
                msg = f"File not tracked: {path}"
                raise KeyError(msg)

            now = datetime.now(UTC).isoformat()
            record.approved_by = approved_by
            record.approved_at = now
            # Status stays as-is (verified/mismatch) — approval is orthogonal
            return record

    # -- Verification -------------------------------------------------------

    def verify(self, path: str) -> dict[str, Any]:
        """Verify a single tracked file against its on-disk content.

        Reads the spec JSON from disk, computes its hash (excluding the
        integrity block's spec_hash field), and compares to the expected hash.

        Returns a result dict with path, status, expected_hash, actual_hash.
        """
        with self._lock:
            record = self._files.get(path)
            if record is None:
                msg = f"File not tracked: {path}"
                raise KeyError(msg)

            full_path = self._base_path / path
            now = datetime.now(UTC).isoformat()

            try:
                spec = json.loads(full_path.read_text(encoding="utf-8"))
            except (FileNotFoundError, json.JSONDecodeError) as exc:
                record.status = UNKNOWN
                record.updated_at = now
                return {
                    "path": path,
                    "status": UNKNOWN,
                    "expected_hash": record.current_hash,
                    "actual_hash": "",
                    "error": str(exc),
                }

            actual_hash = compute_spec_hash(spec)
            record.updated_at = now

            if actual_hash == record.current_hash:
                record.status = VERIFIED
            else:
                record.status = MISMATCH

            return {
                "path": path,
                "status": record.status,
                "expected_hash": record.current_hash,
                "actual_hash": actual_hash,
            }

    def verify_all(self, framework: str = "") -> list[dict[str, Any]]:
        """Verify all tracked files (optionally filtered by framework)."""
        paths = [
            f.path for f in self._files.values()
            if not framework or f.framework == framework
        ]
        return [self.verify(p) for p in paths]

    # -- Scanning -----------------------------------------------------------

    def scan_framework_specs(
        self,
        framework: str,
        spec_dir: Path,
        glob_pattern: str = "*.json",
    ) -> int:
        """Scan a framework's spec directory and register all spec files.

        Reads each JSON file, computes its hash, and registers it.
        Returns the number of newly registered or updated files.

        Mirrors MDEMG UNTS scanner functionality.
        """
        count = 0
        for spec_path in sorted(spec_dir.glob(glob_pattern)):
            if not spec_path.is_file():
                continue
            try:
                spec = json.loads(spec_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                continue

            spec_hash = compute_spec_hash(spec)
            rel_path = str(spec_path.relative_to(self._base_path))
            self.register(
                path=rel_path,
                framework=framework,
                initial_hash=spec_hash,
                source_ref=spec_path.name,
                source="spec",
            )
            count += 1

        return count

    # -- Reporting ----------------------------------------------------------

    def summary(self) -> dict[str, int]:
        """Return aggregate counts by status."""
        with self._lock:
            counts: dict[str, int] = {
                "total": len(self._files),
                VERIFIED: 0,
                MISMATCH: 0,
                UNKNOWN: 0,
                REVERTED: 0,
            }
            for f in self._files.values():
                if f.status in counts:
                    counts[f.status] += 1
            return counts
