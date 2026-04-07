"""FxTS core runner — base class for all spec-first governance runners.

Design principles (from UxTS lineage):
  1. Specs are the source of truth — they define what must exist.
  2. Schema-runner parity is mandatory — every field in a schema must be
     enforced by the runner. Silent ignore is prohibited.
  3. Runners produce structured verdicts with evidence, not bare pass/fail.
  4. A single unimplemented schema field causes HARD FAIL, not a skip.
  5. Hashing lock — every spec carries a self-contained integrity hash.
     Hash verification is independent from assertion execution: a spec can
     PASS assertions but have hash_verified=False (meaning it was modified).
     These are orthogonal signals.
"""

from __future__ import annotations

import abc
import hashlib
import json
from datetime import datetime, timezone
from forge._compat import StrEnum
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Verdict model
# ---------------------------------------------------------------------------

class VerdictStatus(StrEnum):
    """Outcome of a single spec check."""

    PASS = "PASS"
    FAIL = "FAIL"
    SKIP = "SKIP"
    ERROR = "ERROR"
    NOT_IMPLEMENTED = "NOT_IMPLEMENTED"


class SpecViolation(BaseModel):
    """A specific violation found during a spec check."""

    field: str
    expected: Any = None
    actual: Any = None
    message: str
    severity: str = "error"  # error | warning


class FxTSVerdict(BaseModel):
    """Result of a single spec check within a runner."""

    check_id: str
    spec_ref: str
    status: VerdictStatus
    message: str
    violations: list[SpecViolation] = Field(default_factory=list)
    evidence: dict[str, Any] = Field(default_factory=dict)
    duration_ms: float = 0.0


# ---------------------------------------------------------------------------
# Hashing lock — spec integrity verification (from UxTS lineage)
#
# Every FxTS spec can carry a self-contained integrity hash in its
# "integrity" block. The hash is computed over the canonical JSON
# representation of the spec *excluding* the hash field itself.
# Hash verification is INDEPENDENT from assertion execution:
#   - hash_verified=True  → spec matches its stored hash
#   - hash_verified=False → spec was modified since hash was computed
#   - hash_verified=None  → spec has no integrity block (no hash to check)
# This is an orthogonal signal from the verdict status.
# ---------------------------------------------------------------------------

SUPPORTED_HASH_METHODS = frozenset({"sha256-c14n-v1", "sha256-jcs"})

# Hash state enum — tracks whether a spec's hash has been approved, modified, etc.
# Mirrors UNTS status semantics from MDEMG.
HASH_STATES = frozenset({"approved", "modified", "pending_review", "reverted", "unknown"})

# Maximum number of history entries retained per spec (matches MDEMG UNTS MaxHistoryEntries)
MAX_HASH_HISTORY = 3


# ---------------------------------------------------------------------------
# Hash history models — adapted from MDEMG UNTS registry pattern
#
# UNTS maintains current + historical hash records per tracked file.
# In FxTS, each spec carries its own integrity block with:
#   - current hash + state (approved/modified/pending_review/reverted/unknown)
#   - previous_hash for single-step drift detection
#   - change_history array (last N entries) for audit trail
# This enables AI agent governance: detecting hallucinations, context loss,
# unauthorized changes, and non-compliant structural modifications.
# ---------------------------------------------------------------------------


class HashHistoryEntry(BaseModel):
    """A single entry in a spec's hash change history.

    Mirrors MDEMG UNTS HistoryEntry with additional fields for
    AI agent governance (changed_by, change_type, reason).
    """

    previous_hash: str  # Hash before this change
    new_hash: str  # Hash after this change
    changed_at: str  # ISO8601 timestamp
    source: str = "unknown"  # manual | ci | agent | revert | spec_update
    changed_by: str = ""  # Who made the change (agent ID, user, CI system)
    change_type: str = ""  # structural | content | config | revert
    reason: str = ""  # Why the change was made


class SpecIntegrityBlock(BaseModel):
    """Expanded integrity block for FxTS specs.

    Layer 1: Self-contained hash (existing — spec carries its own proof)
    Layer 2: State + history (new — adapted from UNTS for AI agent governance)

    The integrity block lives INSIDE the spec JSON, making each spec
    a portable, self-describing artifact with its own audit trail.
    """

    hash_method: str = "sha256-c14n-v1"
    spec_hash: str = ""  # Current hash (Layer 1)
    hash_state: str = "unknown"  # approved | modified | pending_review | reverted | unknown
    previous_hash: str | None = None  # Single-step drift detection
    approved_by: str = ""  # Who approved the current hash state
    approved_at: str = ""  # When hash state was last approved
    change_history: list[HashHistoryEntry] = Field(default_factory=list)  # Last N changes


def canonical_json_bytes(obj: Any) -> bytes:
    """Serialize JSON data into deterministic bytes.

    Uses sorted keys, compact separators, and ensure_ascii=True to produce
    the same byte sequence regardless of whitespace, key ordering, or
    platform Unicode handling in the source file. ASCII-escaping non-ASCII
    characters (e.g., em-dashes → \\u2014) ensures the canonical form is
    identical across all Python builds and JSON parsers.
    """
    return json.dumps(
        obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True,
    ).encode("utf-8")


def sha256_hex(data: bytes) -> str:
    """Compute SHA-256 hex digest of raw bytes."""
    return hashlib.sha256(data).hexdigest()


def sha256_hex_obj(obj: Any) -> str:
    """Compute SHA-256 hex digest of a JSON-serializable object."""
    return sha256_hex(canonical_json_bytes(obj))


def _drop_path(obj: dict[str, Any], path: tuple[str, ...]) -> None:
    """Remove a nested key from a dict by dotted path."""
    if len(path) == 1:
        obj.pop(path[0], None)
    elif path[0] in obj and isinstance(obj[path[0]], dict):
        _drop_path(obj[path[0]], path[1:])
        # Clean up empty parent dicts left behind
        if not obj[path[0]]:
            del obj[path[0]]


def compute_spec_hash(
    spec: dict[str, Any],
    hash_field_path: tuple[str, ...] = ("integrity",),
) -> str:
    """Compute deterministic SHA-256 hash for a spec, excluding the integrity block.

    The entire integrity block is excluded from the hash input because it
    contains self-referential fields (spec_hash, change_history[].new_hash)
    that would create a circular dependency. The integrity block is metadata
    ABOUT the spec, not governed content OF the spec.

    This matches the UxTS/UNTS hash convention: hash the specification
    content, store the proof in a separate integrity envelope.

    Args:
        spec: The full spec dict (including the integrity block).
        hash_field_path: Path to the block to exclude (default: entire integrity).

    Returns:
        Hex-encoded SHA-256 digest.
    """
    # Deep copy to avoid mutating the original
    spec_copy = json.loads(json.dumps(spec))
    _drop_path(spec_copy, hash_field_path)
    return sha256_hex_obj(spec_copy)


def verify_spec_hash(spec: dict[str, Any]) -> tuple[bool | None, str]:
    """Verify a spec's integrity hash.

    Returns:
        (hash_verified, message) where:
          - True, msg  → hash matches
          - False, msg → hash mismatch (spec was modified)
          - None, msg  → no integrity block in spec
    """
    integrity = spec.get("integrity")
    if integrity is None:
        return None, "No integrity block in spec — hash verification skipped."

    stored_hash = integrity.get("spec_hash")
    if stored_hash is None:
        return None, "Integrity block present but no spec_hash field."

    hash_method = integrity.get("hash_method", "sha256-c14n-v1")
    if hash_method not in SUPPORTED_HASH_METHODS:
        return False, f"Unsupported hash method: '{hash_method}'."

    computed = compute_spec_hash(spec)
    if computed == stored_hash:
        return True, "Spec hash verified — no modifications detected."

    return False, (
        f"Spec hash mismatch — spec was modified since hash was computed. "
        f"Stored: {stored_hash[:16]}… Computed: {computed[:16]}…"
    )


def verify_spec_integrity(spec: dict[str, Any]) -> dict[str, Any]:
    """Full integrity verification including hash state and history analysis.

    Goes beyond simple hash match/mismatch to analyze the integrity block's
    state, history, and approval status. Designed for AI agent governance —
    catches unauthorized changes, unapproved modifications, and drift.

    Returns a dict with:
        hash_verified: bool | None — current hash matches stored hash
        hash_state: str — current state (approved/modified/pending_review/reverted/unknown)
        state_approved: bool — whether the current state has been approved
        previous_hash: str | None — last known good hash
        history_depth: int — number of history entries
        warnings: list[str] — governance warnings (e.g. unapproved changes)
        message: str — human-readable summary
    """
    integrity = spec.get("integrity")
    if integrity is None:
        return {
            "hash_verified": None,
            "hash_state": "unknown",
            "state_approved": False,
            "previous_hash": None,
            "history_depth": 0,
            "warnings": [],
            "message": "No integrity block — hash verification skipped.",
        }

    hash_verified, hash_msg = verify_spec_hash(spec)
    hash_state = integrity.get("hash_state", "unknown")
    previous_hash = integrity.get("previous_hash")
    change_history = integrity.get("change_history", [])
    approved_by = integrity.get("approved_by", "")
    _approved_at = integrity.get("approved_at", "")  # extracted for future staleness check

    warnings: list[str] = []

    # Governance warnings for AI agent oversight
    if hash_verified is False:
        warnings.append(
            "HASH MISMATCH: Spec content does not match stored hash. "
            "Possible unauthorized modification or agent hallucination."
        )

    if hash_state == "modified" and not approved_by:
        warnings.append(
            "UNAPPROVED CHANGE: Hash state is 'modified' with no approval. "
            "This change has not been reviewed by an authorized actor."
        )

    if hash_state == "reverted":
        warnings.append(
            "REVERTED: Spec was reverted to a previous hash. "
            "Verify the revert was intentional and the target hash is correct."
        )

    # Check for rapid changes (possible agent context loss / thrashing)
    if len(change_history) >= MAX_HASH_HISTORY:
        warnings.append(
            f"HIGH CHURN: {len(change_history)} changes in history (max retained: "
            f"{MAX_HASH_HISTORY}). Possible agent context loss or repeated modifications."
        )

    # Check for agent-sourced changes without approval
    agent_changes = [
        h for h in change_history if h.get("source") == "agent"
    ]
    if agent_changes and hash_state != "approved":
        warnings.append(
            f"AGENT CHANGES PENDING REVIEW: {len(agent_changes)} change(s) "
            f"from AI agents have not been approved."
        )

    state_approved = hash_state == "approved" and bool(approved_by)
    message = hash_msg
    if warnings:
        message += " | " + " | ".join(warnings)

    return {
        "hash_verified": hash_verified,
        "hash_state": hash_state,
        "state_approved": state_approved,
        "previous_hash": previous_hash,
        "history_depth": len(change_history),
        "warnings": warnings,
        "message": message,
    }


def add_spec_hash(
    spec: dict[str, Any],
    hash_method: str = "sha256-c14n-v1",
    *,
    source: str = "manual",
    changed_by: str = "",
    change_type: str = "",
    reason: str = "",
) -> dict[str, Any]:
    """Add or update the integrity hash on a spec.

    When updating an existing hash, the old hash is pushed into
    change_history and previous_hash, creating an audit trail.
    Hash state is set to "modified" on any change (pending human/CI approval).

    Args:
        spec: The full spec dict.
        hash_method: Hash algorithm identifier.
        source: Who/what triggered the change (manual, ci, agent, spec_update).
        changed_by: Identifier of the actor (agent ID, username, CI job).
        change_type: Category of change (structural, content, config).
        reason: Human-readable reason for the change.

    Returns the modified spec dict (also mutates in place).
    """
    if hash_method not in SUPPORTED_HASH_METHODS:
        msg = f"Unsupported hash method: '{hash_method}'"
        raise ValueError(msg)

    computed = compute_spec_hash(spec)
    integrity = spec.get("integrity", {})
    old_hash = integrity.get("spec_hash")

    # If hash changed, push old value into history
    if old_hash and old_hash != computed:
        now = datetime.now(timezone.utc).isoformat()
        history_entry = {
            "previous_hash": old_hash,
            "new_hash": computed,
            "changed_at": now,
            "source": source,
            "changed_by": changed_by,
            "change_type": change_type,
            "reason": reason,
        }
        change_history = integrity.get("change_history", [])
        change_history.insert(0, history_entry)
        # Trim to max history entries
        integrity["change_history"] = change_history[:MAX_HASH_HISTORY]
        integrity["previous_hash"] = old_hash
        integrity["hash_state"] = "modified"
    elif not old_hash:
        # First hash — no history, state is approved (initial stamp)
        integrity["hash_state"] = "approved"
        integrity["previous_hash"] = None
        integrity.setdefault("change_history", [])

    integrity["hash_method"] = hash_method
    integrity["spec_hash"] = computed
    spec["integrity"] = integrity
    return spec


def approve_spec_hash(
    spec: dict[str, Any],
    approved_by: str = "",
) -> dict[str, Any]:
    """Mark a spec's current hash as approved.

    Called after a human or authorized CI process reviews a hash change.
    This transitions hash_state from "modified" or "pending_review" to "approved".

    Returns the modified spec dict (also mutates in place).
    """
    integrity = spec.get("integrity", {})
    if not integrity.get("spec_hash"):
        msg = "Cannot approve: spec has no hash. Run add_spec_hash first."
        raise ValueError(msg)

    now = datetime.now(timezone.utc).isoformat()
    integrity["hash_state"] = "approved"
    integrity["approved_by"] = approved_by
    integrity["approved_at"] = now
    spec["integrity"] = integrity
    return spec


def revert_spec_hash(
    spec: dict[str, Any],
    target_hash: str | None = None,
    *,
    reverted_by: str = "",
    reason: str = "",
) -> dict[str, Any]:
    """Revert a spec's hash to a previous value from its change history.

    If target_hash is None, reverts to the most recent previous_hash.
    The current hash is pushed into history with source="revert".

    Mirrors MDEMG UNTS RevertToPreviousHash RPC.

    Returns the modified spec dict (also mutates in place).
    """
    integrity = spec.get("integrity", {})
    current_hash = integrity.get("spec_hash")
    if not current_hash:
        msg = "Cannot revert: spec has no hash."
        raise ValueError(msg)

    # Determine target
    if target_hash is None:
        target_hash = integrity.get("previous_hash")
    if not target_hash:
        msg = "Cannot revert: no previous hash available."
        raise ValueError(msg)

    # Verify target exists in history or is the previous_hash
    history = integrity.get("change_history", [])
    known_hashes = {integrity.get("previous_hash")}
    for entry in history:
        known_hashes.add(entry.get("previous_hash"))
        known_hashes.add(entry.get("new_hash"))
    known_hashes.discard(None)

    if target_hash not in known_hashes:
        msg = f"Target hash not found in history: {target_hash[:16]}…"
        raise ValueError(msg)

    # Push current into history as a revert entry
    now = datetime.now(timezone.utc).isoformat()
    revert_entry = {
        "previous_hash": current_hash,
        "new_hash": target_hash,
        "changed_at": now,
        "source": "revert",
        "changed_by": reverted_by,
        "change_type": "revert",
        "reason": reason or f"Reverted to {target_hash[:16]}…",
    }
    history.insert(0, revert_entry)
    integrity["change_history"] = history[:MAX_HASH_HISTORY]
    integrity["previous_hash"] = current_hash
    integrity["spec_hash"] = target_hash
    integrity["hash_state"] = "reverted"
    spec["integrity"] = integrity
    return spec


class IntegrityReport(BaseModel):
    """Aggregate integrity statistics across specs in a run.

    Extended from simple counters to include hash state governance
    signals adapted from MDEMG UNTS.
    """

    total_hashed: int = 0    # Specs with hash field defined
    verified: int = 0        # Stored hash matches computed hash
    mismatched: int = 0      # Stored hash does NOT match
    no_hash: int = 0         # Specs with no integrity block
    approved: int = 0        # Specs in "approved" hash state
    modified_unapproved: int = 0  # Specs modified but not yet approved
    reverted: int = 0        # Specs in "reverted" state
    agent_changes_pending: int = 0  # Agent-sourced changes awaiting approval
    warnings: list[str] = Field(default_factory=list)  # Governance warnings


# ---------------------------------------------------------------------------
# Report model
# ---------------------------------------------------------------------------

class FxTSReport(BaseModel):
    """Structured conformance report produced by a runner execution."""

    report_id: UUID = Field(default_factory=uuid4)
    framework: str  # e.g., "FATS", "FACTS", "FQTS"
    runner_version: str
    target: str  # what was checked (adapter_id, endpoint path, etc.)
    started_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    finished_at: datetime | None = None
    verdicts: list[FxTSVerdict] = Field(default_factory=list)
    hash_verified: bool | None = None  # True=match, False=mismatch, None=no hash
    hash_message: str = ""
    integrity: IntegrityReport = Field(default_factory=IntegrityReport)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @property
    def passed(self) -> bool:
        """True only if every verdict is PASS or SKIP."""
        return all(
            v.status in (VerdictStatus.PASS, VerdictStatus.SKIP)
            for v in self.verdicts
        )

    @property
    def total(self) -> int:
        return len(self.verdicts)

    @property
    def pass_count(self) -> int:
        return sum(1 for v in self.verdicts if v.status == VerdictStatus.PASS)

    @property
    def fail_count(self) -> int:
        return sum(1 for v in self.verdicts if v.status == VerdictStatus.FAIL)

    @property
    def error_count(self) -> int:
        return sum(1 for v in self.verdicts if v.status == VerdictStatus.ERROR)

    @property
    def not_implemented_count(self) -> int:
        return sum(
            1 for v in self.verdicts
            if v.status == VerdictStatus.NOT_IMPLEMENTED
        )

    def summary(self) -> str:
        """Human-readable one-line summary."""
        status = "PASS" if self.passed else "FAIL"
        hash_flag = ""
        if self.hash_verified is False:
            hash_flag = " [HASH MISMATCH]"
        elif self.hash_verified is None:
            hash_flag = " [NO HASH]"
        return (
            f"[{status}] {self.framework} — {self.target}: "
            f"{self.pass_count}/{self.total} checks passed{hash_flag}"
        )

    def to_json(self, indent: int = 2) -> str:
        """Serialize to JSON for CI artifacts."""
        return self.model_dump_json(indent=indent)


# ---------------------------------------------------------------------------
# Schema loader
# ---------------------------------------------------------------------------

def load_schema(schema_path: Path) -> dict[str, Any]:
    """Load and return a JSON schema file.

    Raises FileNotFoundError if the schema does not exist,
    and json.JSONDecodeError if the schema is malformed.
    """
    with schema_path.open() as f:
        return json.load(f)


def check_schema_runner_parity(
    schema: dict[str, Any],
    implemented_fields: set[str],
) -> list[SpecViolation]:
    """Verify schema-runner parity — every schema field must be covered.

    Returns a list of violations for any schema field that the runner
    has not declared as implemented. This enforces the hard rule that
    silent ignore of schema fields is prohibited.
    """
    violations: list[SpecViolation] = []

    schema_fields = set()
    properties = schema.get("properties", {})
    for field_name in properties:
        schema_fields.add(field_name)

    # Also check required fields in nested definitions
    for _def_name, definition in schema.get("$defs", {}).items():
        for field_name in definition.get("properties", {}):
            schema_fields.add(f"$.{field_name}")

    unimplemented = schema_fields - implemented_fields
    for field in sorted(unimplemented):
        violations.append(
            SpecViolation(
                field=field,
                message=(
                    f"Schema field '{field}' has no runner enforcement. "
                    "Schema-runner parity violation — silent ignore prohibited."
                ),
                severity="error",
            )
        )

    return violations


# ---------------------------------------------------------------------------
# Abstract runner base
# ---------------------------------------------------------------------------

class FxTSRunner(abc.ABC):
    """Base class for all FxTS framework runners.

    Subclasses implement ``_run_checks()`` to perform framework-specific
    validation. The base class handles schema loading, parity checking,
    and report assembly.

    Usage:
        runner = MyFATSRunner(schema_path="governance/fats/schema/fats.schema.json")
        report = await runner.run(target="my-adapter-id")
        if not report.passed:
            for v in report.verdicts:
                if v.status != VerdictStatus.PASS:
                    print(v)
    """

    framework: str  # Set by subclass, e.g. "FATS"
    version: str = "0.1.0"

    def __init__(self, schema_path: Path | str | None = None) -> None:
        self._schema_path = Path(schema_path) if schema_path else None
        self._schema: dict[str, Any] | None = None

    @property
    def schema(self) -> dict[str, Any] | None:
        """Lazy-load schema on first access."""
        if self._schema is None and self._schema_path is not None:
            self._schema = load_schema(self._schema_path)
        return self._schema

    @abc.abstractmethod
    async def _run_checks(
        self, target: str, **kwargs: Any
    ) -> list[FxTSVerdict]:
        """Execute framework-specific checks. Must be implemented by subclass."""

    @abc.abstractmethod
    def implemented_fields(self) -> set[str]:
        """Return the set of schema fields this runner enforces.

        Used to verify schema-runner parity. If a field exists in the
        schema but is not in this set, the run will HARD FAIL.
        """

    async def run(self, target: str, **kwargs: Any) -> FxTSReport:
        """Execute the full runner pipeline.

        1. Load schema (if configured).
        2. Check schema-runner parity.
        3. Verify spec integrity hash (independent from assertions).
        4. Execute framework-specific checks.
        5. Assemble and return the report.

        Hash verification (step 3) is INDEPENDENT from assertion execution
        (step 4). A spec can PASS all assertions but have hash_verified=False
        if it was modified since its hash was computed. These are orthogonal
        governance signals inherited from the UxTS hashing lock pattern.
        """
        report = FxTSReport(
            framework=self.framework,
            runner_version=self.version,
            target=target,
        )

        # Schema-runner parity check (hard requirement)
        if self.schema is not None:
            parity_violations = check_schema_runner_parity(
                self.schema, self.implemented_fields()
            )
            if parity_violations:
                for violation in parity_violations:
                    report.verdicts.append(
                        FxTSVerdict(
                            check_id=f"parity:{violation.field}",
                            spec_ref=f"{self.framework}/schema-runner-parity",
                            status=VerdictStatus.NOT_IMPLEMENTED,
                            message=violation.message,
                            violations=[violation],
                        )
                    )

        # Spec integrity verification (independent from assertions)
        # The spec dict is passed via kwargs["spec"] by framework runners.
        # Hash result does NOT affect verdict status — it's a separate signal.
        # Uses full integrity analysis (hash + state + history) adapted from
        # MDEMG UNTS for AI agent governance.
        spec: dict[str, Any] | None = kwargs.get("spec")
        if spec is not None:
            integrity_result = verify_spec_integrity(spec)
            report.hash_verified = integrity_result["hash_verified"]
            report.hash_message = integrity_result["message"]

            # Update aggregate integrity counters
            if integrity_result["hash_verified"] is True:
                report.integrity.total_hashed += 1
                report.integrity.verified += 1
            elif integrity_result["hash_verified"] is False:
                report.integrity.total_hashed += 1
                report.integrity.mismatched += 1
            else:
                report.integrity.no_hash += 1

            # Hash state governance counters
            hash_state = integrity_result["hash_state"]
            if hash_state == "approved":
                report.integrity.approved += 1
            elif hash_state == "modified" and not integrity_result["state_approved"]:
                report.integrity.modified_unapproved += 1
            elif hash_state == "reverted":
                report.integrity.reverted += 1

            # Propagate governance warnings
            report.integrity.warnings.extend(integrity_result["warnings"])

        # Framework-specific checks (always execute, regardless of hash result)
        verdicts = await self._run_checks(target, **kwargs)
        report.verdicts.extend(verdicts)

        report.finished_at = datetime.now(timezone.utc)
        return report
