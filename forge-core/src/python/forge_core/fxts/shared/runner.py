"""FxTS core runner — base class for all spec-first governance runners.

Design principles (from UxTS lineage):
  1. Specs are the source of truth — they define what must exist.
  2. Schema-runner parity is mandatory — every field in a schema must be
     enforced by the runner. Silent ignore is prohibited.
  3. Runners produce structured verdicts with evidence, not bare pass/fail.
  4. A single unimplemented schema field causes HARD FAIL, not a skip.
     A check that did not run is reported as not run and the run does not
     pass (D-14, F-7): see ``VerdictStatus`` and ``outcome_of``.
  5. Hashing lock — every spec carries a self-contained integrity hash.
     Hash verification is independent from assertion execution: a spec can
     PASS assertions but have hash_verified=False (meaning it was modified).
     These are orthogonal signals.
"""

from __future__ import annotations

import abc
import functools
import hashlib
import json
import re
import traceback
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from pathlib import Path
from typing import TYPE_CHECKING, Any, ClassVar
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, computed_field

if TYPE_CHECKING:
    from collections.abc import Iterable

# ---------------------------------------------------------------------------
# Verdict model
# ---------------------------------------------------------------------------


class VerdictStatus(StrEnum):
    """Outcome of a single spec check.

    There is no status that means "skipped": a check either observed what it is for
    (``PASS``, ``FAIL``), broke while trying (``ERROR``), has no implementation behind a
    field the schema declares (``NOT_IMPLEMENTED``), did not run (``NOT_RUN``), or is
    not enforced by a waiver in the spec (``WAIVED``). The last two are never counted
    as passed (D-14, F-7; BACKLOG FB-265).
    """

    PASS = "PASS"
    FAIL = "FAIL"
    ERROR = "ERROR"
    NOT_IMPLEMENTED = "NOT_IMPLEMENTED"
    NOT_RUN = "NOT_RUN"
    WAIVED = "WAIVED"


class RunOutcome(StrEnum):
    """What a whole run showed.

    ``PASS``: every check ran and passed. ``FAIL``: a check failed or broke, or there
    was no check at all. ``INCOMPLETE``: nothing failed, and at least one check did not
    run or is waived, so the run does not show that the spec is met.
    """

    PASS = "PASS"
    FAIL = "FAIL"
    INCOMPLETE = "INCOMPLETE"


#: A verdict with one of these fails the run.
FAILING_STATUSES = frozenset(
    {VerdictStatus.FAIL, VerdictStatus.ERROR, VerdictStatus.NOT_IMPLEMENTED}
)
#: A verdict with one of these observed nothing: the run cannot pass with it.
UNOBSERVED_STATUSES = frozenset({VerdictStatus.NOT_RUN, VerdictStatus.WAIVED})


def outcome_of(statuses: Iterable[VerdictStatus]) -> RunOutcome:
    """The outcome of a run with these verdict statuses.

    The one place the rule is written. A run with no verdicts fails: a run that checked
    nothing has shown nothing.
    """
    seen = set(statuses)
    if not seen or seen & FAILING_STATUSES:
        return RunOutcome.FAIL
    if seen & UNOBSERVED_STATUSES:
        return RunOutcome.INCOMPLETE
    return RunOutcome.PASS


class SpecViolation(BaseModel):
    """A specific violation found during a spec check."""

    field: str
    expected: Any = None
    actual: Any = None
    message: str
    severity: str = "error"  # error | warning


class EvidenceKind(StrEnum):
    """What a verdict rests on (D-19, AE-1).

    ``SELF``: the spec against itself or its own schema. ``FILE``: against another
    governed or repository file (another spec, a manifest, a governed list, a schema
    registry, the backlog, the names of files). ``ARTIFACT``: against the real thing: code
    imported or introspected, the app built in process, the proto, the module run through
    the conformance kit. ``NONE``: nothing was observed, because the check did not run,
    is waived, or looks at the runner rather than the spec.
    """

    SELF = "self"
    FILE = "file"
    ARTIFACT = "artifact"
    NONE = "none"


#: From weakest to strongest.
EVIDENCE_ORDER: tuple[EvidenceKind, ...] = (
    EvidenceKind.NONE,
    EvidenceKind.SELF,
    EvidenceKind.FILE,
    EvidenceKind.ARTIFACT,
)

#: One thing a verdict reached: ``file:<path in the repository>`` or ``artifact:<what>``
#: (a module imported, the app built in process, the proto, the conformance kit's run).
REACHED_FORM = re.compile(r"^(file|artifact):\S.*$")

_REPO = Path(__file__).resolve().parents[6]


def reached_file(path: Path | str) -> str:
    """``file:<path>`` for a file a check read, relative to the repository when it is in
    it (a report never carries the machine's own paths)."""
    path = Path(path)
    try:
        shown = path.resolve().relative_to(_REPO).as_posix()
    except ValueError:
        shown = path.name
    return f"file:{shown}"


class FxTSVerdict(BaseModel):
    """Result of a single spec check within a runner."""

    check_id: str
    spec_ref: str
    status: VerdictStatus
    message: str
    violations: list[SpecViolation] = Field(default_factory=list)
    evidence: dict[str, Any] = Field(default_factory=dict)
    duration_ms: float = 0.0
    #: What the check reached beyond the spec: ``file:<path>`` or ``artifact:<what>``
    #: (``REACHED_FORM``). A check that reached nothing names nothing (D-19 step 2).
    reached: list[str] = Field(default_factory=list)
    #: Set by the runner base (``FxTSRunner.with_evidence``) from the check's declaration
    #: and what the verdict names as reached; a runner never sets it by hand (D-19, AE-1).
    evidence_kind: EvidenceKind | None = None


_PLACEHOLDER = re.compile(r"\{[a-z_]+\}")


@dataclass(frozen=True)
class Check:
    """One check a runner can give, declared as data (D-19, AE-2).

    ``id`` is the verdict's check id, or a form with ``{name}`` placeholders for an id
    built at run time (``facts:lifecycle-{field}``). ``covers`` are JSON pointers into a
    spec of the framework, the properties the check looks at; empty for a check of the
    framework itself rather than a spec (``fvts:enum-parity``). ``kind`` is the evidence
    the check reaches when it runs.
    """

    id: str
    covers: tuple[str, ...]
    kind: EvidenceKind
    note: str = ""

    @property
    def is_pattern(self) -> bool:
        return bool(_PLACEHOLDER.search(self.id))

    def matches(self, check_id: str) -> bool:
        if not self.is_pattern:
            return check_id == self.id
        parts = _PLACEHOLDER.split(self.id)
        return re.fullmatch(r"\S+?".join(re.escape(part) for part in parts), check_id) is not None


#: The checks the runner base gives in every framework; ``{framework}`` is the
#: framework's name in lower case.
SHARED_CHECKS: tuple[Check, ...] = (
    Check("{framework}:hash-verified", ("/integrity/spec_hash",), EvidenceKind.SELF),
    Check("{framework}:hash-approved", ("/integrity/hash_state",), EvidenceKind.SELF),
    Check(
        "{framework}:schema-current",
        ("/integrity/schema_version",),
        EvidenceKind.FILE,
        "against the schema registry and the released schema file",
    ),
    Check("{framework}:runner-error", (), EvidenceKind.NONE, "the runner broke; nothing observed"),
    Check(
        "parity:{field}",
        (),
        EvidenceKind.NONE,
        "the framework's schema against its runner, not a spec",
    ),
    Check(
        "{framework}:evidence-{section}",
        (),
        EvidenceKind.NONE,
        "claims of the spec that no check of the real thing reached in this run (D-19, AE-4)",
    ),
)


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
        obj,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
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
    agent_changes = [h for h in change_history if h.get("source") == "agent"]
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
        now = datetime.now(UTC).isoformat()
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

    now = datetime.now(UTC).isoformat()
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
    now = datetime.now(UTC).isoformat()
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

    total_hashed: int = 0  # Specs with hash field defined
    verified: int = 0  # Stored hash matches computed hash
    mismatched: int = 0  # Stored hash does NOT match
    no_hash: int = 0  # Specs with no integrity block
    approved: int = 0  # Specs in "approved" hash state
    modified_unapproved: int = 0  # Specs modified but not yet approved
    reverted: int = 0  # Specs in "reverted" state
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
    started_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    finished_at: datetime | None = None
    verdicts: list[FxTSVerdict] = Field(default_factory=list)
    hash_verified: bool | None = None  # True=match, False=mismatch, None=no hash
    hash_message: str = ""
    integrity: IntegrityReport = Field(default_factory=IntegrityReport)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def outcome(self) -> RunOutcome:
        """PASS, FAIL or INCOMPLETE: see :func:`outcome_of`. Written into the JSON report."""
        return outcome_of(v.status for v in self.verdicts)

    @property
    def passed(self) -> bool:
        """True only when every check ran and passed. Not run and waived are not passed."""
        return self.outcome is RunOutcome.PASS

    @property
    def failed(self) -> bool:
        """True when a check failed or broke, or the run has no verdict at all."""
        return self.outcome is RunOutcome.FAIL

    @property
    def failures(self) -> list[FxTSVerdict]:
        return [v for v in self.verdicts if v.status in FAILING_STATUSES]

    @property
    def not_run(self) -> list[FxTSVerdict]:
        return [v for v in self.verdicts if v.status == VerdictStatus.NOT_RUN]

    @property
    def waived(self) -> list[FxTSVerdict]:
        return [v for v in self.verdicts if v.status == VerdictStatus.WAIVED]

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
        return sum(1 for v in self.verdicts if v.status == VerdictStatus.NOT_IMPLEMENTED)

    def summary(self) -> str:
        """Human-readable one-line summary: the outcome, then every count that is not zero."""
        hash_flag = ""
        if self.hash_verified is False:
            hash_flag = " [HASH MISMATCH]"
        elif self.hash_verified is None:
            hash_flag = " [NO HASH]"
        if not self.verdicts:
            counts = "no check ran"
        else:
            counts = f"{self.pass_count}/{self.total} checks passed"
            for count, word in (
                (len(self.failures), "failed"),
                (len(self.not_run), "not run"),
                (len(self.waived), "waived"),
            ):
                if count:
                    counts += f", {count} {word}"
        return f"[{self.outcome}] {self.framework} — {self.target}: {counts}{hash_flag}"

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
    async def _run_checks(self, target: str, **kwargs: Any) -> list[FxTSVerdict]:
        """Execute framework-specific checks. Must be implemented by subclass."""

    #: Every check this framework's runner gives, besides the shared ones (D-19, AE-2).
    CHECKS: ClassVar[tuple[Check, ...]] = ()

    def declared_checks(self) -> tuple[Check, ...]:
        """The shared checks, named for this framework, then the framework's own."""
        name = self.framework.lower()
        shared = tuple(
            Check(c.id.replace("{framework}", name), c.covers, c.kind, c.note)
            for c in SHARED_CHECKS
        )
        return shared + tuple(self.CHECKS)

    def declaration_of(self, check_id: str) -> Check | None:
        """The declaration a verdict's id matches: an exact id first, then a pattern."""
        declared = self.declared_checks()
        exact = [c for c in declared if not c.is_pattern and c.id == check_id]
        if exact:
            return exact[0]
        return next((c for c in declared if c.is_pattern and c.matches(check_id)), None)

    def with_evidence(self, verdict: FxTSVerdict) -> FxTSVerdict:
        """The verdict with its kind of evidence, from its declaration (D-19, AE-1, AE-2).

        A verdict whose id is declared nowhere becomes an error naming the id, so a check
        cannot be added without saying what it rests on. A check that did not run or is
        waived observed nothing, whatever it would have reached.
        """
        declared = self.declaration_of(verdict.check_id)
        if declared is None:
            return verdict.model_copy(
                update={
                    "status": VerdictStatus.ERROR,
                    "evidence_kind": EvidenceKind.NONE,
                    "message": (
                        f"undeclared check: '{verdict.check_id}' is not declared in "
                        f"{type(self).__name__}.CHECKS (D-19, AE-2). It said "
                        f"{verdict.status}: {verdict.message}"
                    ),
                    "evidence": {**verdict.evidence, "undeclared": True},
                }
            )
        if verdict.status in (VerdictStatus.NOT_RUN, VerdictStatus.WAIVED):
            return verdict.model_copy(update={"evidence_kind": EvidenceKind.NONE})
        malformed = [r for r in verdict.reached if not REACHED_FORM.match(r)]
        if malformed:
            return verdict.model_copy(
                update={
                    "status": VerdictStatus.ERROR,
                    "evidence_kind": EvidenceKind.NONE,
                    "message": (
                        f"'{verdict.check_id}' names what it reached as {malformed}, not as "
                        f"file:<path> or artifact:<what> (D-19 step 2). It said "
                        f"{verdict.status}: {verdict.message}"
                    ),
                }
            )
        return verdict.model_copy(
            update={"evidence_kind": evidence_kind_of(declared.kind, verdict.reached)}
        )

    def evidence_findings(
        self, spec: dict[str, Any] | None, verdicts: list[FxTSVerdict]
    ) -> list[FxTSVerdict]:
        """One ``<fw>:evidence-<section>`` verdict, not run, for each top-level section of
        the spec that holds a claim no check of the real thing reached in this run
        (D-19, AE-3, AE-4).

        The marks are read from the latest schema version the owner approved, whatever
        version the spec was approved against; with none approved every top-level
        property is a claim. A claim the spec does not make (the property is absent)
        gives nothing. A claim is reached when a verdict of kind ``artifact`` in this run
        comes from a check declared to cover it or a property above it. ``[]`` for a
        runner with no registered framework schema (a test double).
        """
        from forge_core.fxts.shared import schemas

        if spec is None or self._schema_path is None:
            return []
        schema_dir = self._schema_path.parent
        if schema_dir.name == "versions":
            schema_dir = schema_dir.parent
        if not (schema_dir / schemas.REGISTRY_NAME).is_file():
            return []
        source = schemas.marks_version(schema_dir)
        if source is not None:
            units = _cached_units(str(source.file), source.schema_hash, True)
            marks_from = f"{self.framework} {source.version}"
        else:
            head = schemas.latest(schema_dir)
            units = _cached_units(str(head.file), head.schema_hash, False) if head else ()
            marks_from = f"{self.framework}: no approved version, every top-level property a claim"
        covers = [
            pointer
            for v in verdicts
            if v.evidence_kind is EvidenceKind.ARTIFACT
            and (declared := self.declaration_of(v.check_id)) is not None
            for pointer in declared.covers
        ]
        uncovered: dict[str, list[str]] = {}
        for pointer, mark in units:
            if mark != "claim" or not _present(spec, pointer):
                continue
            if any(c == "" or c == pointer or pointer.startswith(c + "/") for c in covers):
                continue
            uncovered.setdefault(pointer.split("/")[1], []).append(pointer)
        name = self.framework.lower()
        return [
            FxTSVerdict(
                check_id=f"{name}:evidence-{schemas.section_id(section)}",
                spec_ref=f"{self.framework}/{section}",
                status=VerdictStatus.NOT_RUN,
                message=(
                    f"NOT RUN: no check of the real thing reached {', '.join(pointers)} in this "
                    f"run; the spec's claim there is checked only against itself or other "
                    f"files. The accepted gap for {name}:evidence-{schemas.section_id(section)} "
                    f"names the backlog item that adds the check (`forge governance gaps`; "
                    f"D-19, AE-4; marks from {marks_from})."
                ),
                evidence={"uncovered": pointers, "marks_from": marks_from},
            )
            for section, pointers in uncovered.items()
        ]

    @abc.abstractmethod
    def implemented_fields(self) -> set[str]:
        """Return the set of schema fields this runner enforces.

        Used to verify schema-runner parity. If a field exists in the
        schema but is not in this set, the run will HARD FAIL.
        """

    def integrity_verdicts(self, spec: dict[str, Any]) -> list[FxTSVerdict]:
        """The two verdicts every framework gives for a spec's hash (D-14, F-4).

        ``<fw>:hash-verified`` fails when the spec's content does not match its recorded
        hash; ``<fw>:hash-approved`` fails when the hash is not approved by the owner.
        A spec with no integrity block fails both: a spec that can change without
        anyone's approval is not a governed spec. One implementation for all
        frameworks; a runner that wants them at a fixed place in its report calls
        this itself, and ``run`` adds them for any runner that did not.
        """
        prefix = self.framework.lower()
        ref = self.framework

        def verdict(
            check: str,
            spec_ref: str,
            failure: SpecViolation | None,
            ok: str,
            evidence: dict[str, Any] | None = None,
        ) -> FxTSVerdict:
            return FxTSVerdict(
                check_id=f"{prefix}:{check}",
                spec_ref=f"{ref}/{spec_ref}",
                status=VerdictStatus.FAIL if failure else VerdictStatus.PASS,
                message=f"1 violation(s): {failure.message}" if failure else ok,
                violations=[failure] if failure else [],
                evidence=evidence or {},
            )

        integrity = spec.get("integrity")
        if not isinstance(integrity, dict):
            missing = SpecViolation(
                field="integrity",
                message=f"no integrity block; every {ref} spec carries an FHTS hash",
            )
            return [
                verdict("hash-verified", "integrity/spec_hash", missing, ""),
                verdict("hash-approved", "integrity/hash_state", missing, ""),
            ]
        verified, hash_message = verify_spec_hash(spec)
        mismatch = (
            None
            if verified is True
            else SpecViolation(field="integrity.spec_hash", message=hash_message)
        )
        state = integrity.get("hash_state", "unknown")
        approved_by = integrity.get("approved_by") or ""
        unapproved = None
        if state != "approved" or not approved_by:
            unapproved = SpecViolation(
                field="integrity.hash_state",
                expected="approved (with approved_by)",
                actual=f"{state} / approved_by={approved_by!r}",
                message=(
                    f"hash_state is '{state}' (approved_by={approved_by!r}); the spec is "
                    "not binding until the owner approves it"
                ),
            )
        return [
            verdict("hash-verified", "integrity/spec_hash", mismatch, hash_message),
            verdict(
                "hash-approved",
                "integrity/hash_state",
                unapproved,
                f"hash_state is 'approved' by {approved_by}.",
                {"hash_state": state, "approved_by": approved_by},
            ),
        ]

    def schema_for(self, spec: dict[str, Any]) -> dict[str, Any] | None:
        """The schema a spec is held to: the registered version its ``spec_version`` names.

        A spec written against an earlier minor or patch version stays valid (D-14, Q-5),
        so it is validated against that version's frozen schema, not against the current
        one. A spec that names no registered version gets the runner's own schema, whose
        ``const`` on ``spec_version`` then fails it.
        """
        from forge_core.fxts.shared import schemas

        if self._schema_path is None:
            return None
        schema_dir = self._schema_path.parent
        if schema_dir.name == "versions":
            schema_dir = schema_dir.parent
        if not (schema_dir / schemas.REGISTRY_NAME).is_file():
            return self.schema
        path = schemas.schema_for_spec(schema_dir, spec)
        if path == self._schema_path:
            return self.schema
        return load_schema(path)

    def schema_verdict(self, spec: dict[str, Any]) -> FxTSVerdict | None:
        """``<fw>:schema-current``: the spec's record of its schema stands (D-14, F-10).

        Fails when the spec does not record the schema version and hash it was approved
        against, when that version's hash has changed or is not approved by the owner,
        or when the schema has moved a major step past it. ``None`` for a runner whose
        schema is not a registered framework schema (a test double).
        """
        from forge_core.fxts.shared import schemas

        if self._schema_path is None:
            return None
        schema_dir = self._schema_path.parent
        if schema_dir.name == "versions":
            schema_dir = schema_dir.parent
        if not (schema_dir / schemas.REGISTRY_NAME).is_file():
            return None
        problem = schemas.spec_schema_problem(schema_dir, spec)
        integrity = spec.get("integrity") if isinstance(spec.get("integrity"), dict) else {}
        recorded = integrity.get("schema_version", "")
        violation = (
            SpecViolation(field="integrity.schema_version", message=problem) if problem else None
        )
        return FxTSVerdict(
            check_id=f"{self.framework.lower()}:schema-current",
            spec_ref=f"{self.framework}/integrity/schema_version",
            status=VerdictStatus.FAIL if violation else VerdictStatus.PASS,
            message=(
                f"1 violation(s): {problem}"
                if problem
                else f"approved against schema {recorded}, whose hash the owner approved."
            ),
            violations=[violation] if violation else [],
            evidence={"schema_version": recorded},
            reached=[
                reached_file(schema_dir / schemas.REGISTRY_NAME),
                *(
                    [reached_file(found.file)]
                    if (found := schemas.find(schema_dir, str(recorded))) is not None
                    else []
                ),
            ],
        )

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
            parity_violations = check_schema_runner_parity(self.schema, self.implemented_fields())
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

        # Framework-specific checks (always execute, regardless of hash result).
        # A check that raises is a failed run with its cause, never a traceback with no
        # report and never a pass (FB-265).
        try:
            report.verdicts.extend(await self._run_checks(target, **kwargs))
        except Exception as exc:
            where = traceback.extract_tb(exc.__traceback__)[-1]
            report.verdicts.append(
                FxTSVerdict(
                    check_id=f"{self.framework.lower()}:runner-error",
                    spec_ref=f"{self.framework}/runner",
                    status=VerdictStatus.ERROR,
                    message=(
                        f"The runner broke before it finished its checks: "
                        f"{type(exc).__name__}: {exc}"
                    ),
                    evidence={
                        "exception": type(exc).__name__,
                        "at": f"{Path(where.filename).name}:{where.lineno} in {where.name}",
                    },
                )
            )

        # Every framework fails a spec whose hash does not verify or is not approved
        # (D-14, F-4). A runner that placed the two verdicts itself is left as it is.
        placed = {v.check_id for v in report.verdicts}
        if spec is not None and f"{self.framework.lower()}:hash-verified" not in placed:
            report.verdicts.extend(self.integrity_verdicts(spec))
        if spec is not None and f"{self.framework.lower()}:schema-current" not in placed:
            report.verdicts.append(
                self.schema_verdict(spec)
                or FxTSVerdict(
                    check_id=f"{self.framework.lower()}:schema-current",
                    spec_ref=f"{self.framework}/integrity/schema_version",
                    status=VerdictStatus.NOT_RUN,
                    message=(
                        "NOT RUN: this runner was given no registered framework schema, so "
                        "the spec's record of its schema version could not be checked."
                    ),
                )
            )

        report.verdicts = [self.with_evidence(v) for v in report.verdicts]
        # What the spec claims that nothing real was checked against (D-19, AE-4). A fault
        # here is the runner's error, never a run with no findings.
        try:
            findings = self.evidence_findings(spec, report.verdicts)
        except Exception as exc:
            findings = [
                FxTSVerdict(
                    check_id=f"{self.framework.lower()}:runner-error",
                    spec_ref=f"{self.framework}/runner",
                    status=VerdictStatus.ERROR,
                    message=(
                        "The runner broke while finding the claims no check of the real "
                        f"thing reached: {type(exc).__name__}: {exc}"
                    ),
                    evidence={"exception": type(exc).__name__},
                )
            ]
        report.verdicts.extend(self.with_evidence(v) for v in findings)
        report.finished_at = datetime.now(UTC)
        return report


def evidence_kind_of(declared: EvidenceKind, reached: list[str]) -> EvidenceKind:
    """The kind a verdict that ran rests on: the strongest thing it names as reached
    (``self`` when it names nothing), never stronger than its check's declaration."""
    named = [
        EvidenceKind.ARTIFACT if r.startswith("artifact:") else EvidenceKind.FILE for r in reached
    ]
    strongest = max(named, key=EVIDENCE_ORDER.index, default=EvidenceKind.SELF)
    return min(declared, strongest, key=EVIDENCE_ORDER.index)


@functools.cache
def _cached_units(file: str, schema_hash: str, honour_marks: bool) -> tuple[tuple[str, str], ...]:
    """A released version's units; a released version never changes, and its hash is part
    of the key."""
    from forge_core.fxts.shared import schemas

    schema = json.loads(Path(file).read_text(encoding="utf-8"))
    return tuple(schemas.mark_units(schema, honour_marks=honour_marks))


def _present(spec: dict[str, Any], pointer: str) -> bool:
    """Whether the spec says something at a pointer: every step is an object holding the
    next name, and the value is not null."""
    node: Any = spec
    for segment in pointer.strip("/").split("/"):
        if not isinstance(node, dict) or segment not in node:
            return False
        node = node[segment]
    return node is not None
