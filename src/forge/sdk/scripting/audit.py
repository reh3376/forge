"""Script audit trail — records every write operation from scripts.

Every ``forge.tag.write()`` and ``forge.db.query()`` call is logged with
full context: script name, trigger event, executing user (owner),
timestamp, old/new values, and RBAC check result.

The audit log is append-only and designed for compliance inspection.
It writes to both a structured logger (for real-time streaming) and
an in-memory buffer (for API queries).  In production, the logger
output is typically forwarded to the Forge hub's event store.

Design decisions:
    D1: Append-only — entries are never modified or deleted.
    D2: Each entry captures the full causal chain: which script,
        which trigger event, which handler, what was the old value,
        what is the new value, and was it allowed by RBAC.
    D3: The in-memory buffer has a configurable size limit (default
        10,000 entries).  When full, oldest entries are evicted.
        The permanent record is in the log output, not the buffer.
    D4: Audit entries are lightweight dataclasses, not Pydantic models,
        to minimize overhead on the hot write path.
"""

from __future__ import annotations

import json
import logging
from collections import deque
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("forge.audit")


# ---------------------------------------------------------------------------
# Audit entry model
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AuditEntry:
    """A single audit log entry for a script operation."""

    timestamp: str
    operation: str          # "tag_write", "tag_read", "db_query", "db_mutate"
    script_name: str
    script_owner: str
    handler_name: str
    trigger_type: str       # "tag_change", "timer", "event", "alarm", "api", "manual"
    target: str             # tag path or SQL query (truncated)
    old_value: Any = None
    new_value: Any = None
    rbac_allowed: bool = True
    rbac_reason: str = ""
    area: str = ""
    equipment_id: str = ""
    duration_ms: float = 0.0
    success: bool = True
    error: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ---------------------------------------------------------------------------
# Script execution context (thread-local-like context for audit)
# ---------------------------------------------------------------------------


@dataclass
class ScriptExecutionContext:
    """Context for the currently executing script handler.

    Set by the ScriptEngine before invoking a handler, cleared after.
    Allows forge.tag.write() and forge.db.query() to know which script
    and trigger is responsible for the operation.
    """

    script_name: str = ""
    script_owner: str = ""
    handler_name: str = ""
    trigger_type: str = ""
    trigger_detail: str = ""  # e.g., tag path that triggered the change


# Global execution context — set per-handler invocation
_current_context = ScriptExecutionContext()


def set_execution_context(ctx: ScriptExecutionContext) -> None:
    """Set the current script execution context (called by ScriptEngine)."""
    global _current_context
    _current_context = ctx


def get_execution_context() -> ScriptExecutionContext:
    """Get the current script execution context."""
    return _current_context


def clear_execution_context() -> None:
    """Clear the execution context (called after handler completes)."""
    global _current_context
    _current_context = ScriptExecutionContext()


# ---------------------------------------------------------------------------
# ScriptAuditTrail
# ---------------------------------------------------------------------------


class ScriptAuditTrail:
    """Append-only audit trail for script operations.

    Logs to both a structured logger and an in-memory ring buffer.
    """

    def __init__(self, max_buffer_size: int = 10_000) -> None:
        self._buffer: deque[AuditEntry] = deque(maxlen=max_buffer_size)
        self._total_entries: int = 0
        self._total_denied: int = 0

    @property
    def buffer_size(self) -> int:
        return len(self._buffer)

    @property
    def total_entries(self) -> int:
        return self._total_entries

    @property
    def total_denied(self) -> int:
        return self._total_denied

    def record_tag_write(
        self,
        tag_path: str,
        old_value: Any,
        new_value: Any,
        *,
        rbac_allowed: bool = True,
        rbac_reason: str = "",
        area: str = "",
        equipment_id: str = "",
        success: bool = True,
        error: str = "",
        duration_ms: float = 0.0,
    ) -> AuditEntry:
        """Record a tag write operation."""
        ctx = get_execution_context()
        entry = AuditEntry(
            timestamp=datetime.now(tz=timezone.utc).isoformat(),
            operation="tag_write",
            script_name=ctx.script_name,
            script_owner=ctx.script_owner,
            handler_name=ctx.handler_name,
            trigger_type=ctx.trigger_type,
            target=tag_path,
            old_value=_safe_serialize(old_value),
            new_value=_safe_serialize(new_value),
            rbac_allowed=rbac_allowed,
            rbac_reason=rbac_reason,
            area=area,
            equipment_id=equipment_id,
            success=success,
            error=error,
            duration_ms=duration_ms,
        )
        self._append(entry)
        return entry

    def record_db_query(
        self,
        sql: str,
        *,
        is_mutation: bool = False,
        db_name: str = "default",
        rbac_allowed: bool = True,
        rbac_reason: str = "",
        row_count: int = 0,
        success: bool = True,
        error: str = "",
        duration_ms: float = 0.0,
    ) -> AuditEntry:
        """Record a database query or mutation."""
        ctx = get_execution_context()
        entry = AuditEntry(
            timestamp=datetime.now(tz=timezone.utc).isoformat(),
            operation="db_mutate" if is_mutation else "db_query",
            script_name=ctx.script_name,
            script_owner=ctx.script_owner,
            handler_name=ctx.handler_name,
            trigger_type=ctx.trigger_type,
            target=_truncate_sql(sql),
            new_value={"row_count": row_count, "db": db_name},
            rbac_allowed=rbac_allowed,
            rbac_reason=rbac_reason,
            success=success,
            error=error,
            duration_ms=duration_ms,
        )
        self._append(entry)
        return entry

    def record_tag_read(
        self,
        tag_path: str,
        value: Any,
        *,
        duration_ms: float = 0.0,
    ) -> AuditEntry:
        """Record a tag read (optional — for high-audit environments)."""
        ctx = get_execution_context()
        entry = AuditEntry(
            timestamp=datetime.now(tz=timezone.utc).isoformat(),
            operation="tag_read",
            script_name=ctx.script_name,
            script_owner=ctx.script_owner,
            handler_name=ctx.handler_name,
            trigger_type=ctx.trigger_type,
            target=tag_path,
            new_value=_safe_serialize(value),
            duration_ms=duration_ms,
        )
        self._append(entry)
        return entry

    def _append(self, entry: AuditEntry) -> None:
        """Append entry to buffer and emit to logger."""
        self._buffer.append(entry)
        self._total_entries += 1
        if not entry.rbac_allowed:
            self._total_denied += 1

        # Structured log emission
        log_data = {
            "audit": True,
            "op": entry.operation,
            "script": entry.script_name,
            "owner": entry.script_owner,
            "target": entry.target,
            "allowed": entry.rbac_allowed,
        }
        if not entry.rbac_allowed:
            logger.warning("RBAC DENIED: %s", json.dumps(log_data, default=str))
        elif not entry.success:
            logger.error("SCRIPT ERROR: %s", json.dumps(log_data, default=str))
        else:
            logger.info("AUDIT: %s", json.dumps(log_data, default=str))

    def query(
        self,
        *,
        script_name: str | None = None,
        operation: str | None = None,
        owner: str | None = None,
        limit: int = 100,
        denied_only: bool = False,
    ) -> list[AuditEntry]:
        """Query the audit buffer with optional filters."""
        results = []
        for entry in reversed(self._buffer):
            if script_name and entry.script_name != script_name:
                continue
            if operation and entry.operation != operation:
                continue
            if owner and entry.script_owner != owner:
                continue
            if denied_only and entry.rbac_allowed:
                continue
            results.append(entry)
            if len(results) >= limit:
                break
        return results

    def get_stats(self) -> dict[str, Any]:
        """Return audit trail statistics."""
        return {
            "total_entries": self._total_entries,
            "buffer_size": self.buffer_size,
            "total_denied": self._total_denied,
            "operations": _count_by_field(self._buffer, "operation"),
            "scripts": _count_by_field(self._buffer, "script_name"),
        }

    def clear_buffer(self) -> None:
        """Clear the in-memory buffer (does not affect log output)."""
        self._buffer.clear()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _safe_serialize(value: Any) -> Any:
    """Make a value JSON-serializable for audit logging."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    try:
        json.dumps(value, default=str)
        return value
    except (TypeError, ValueError):
        return str(value)


def _truncate_sql(sql: str, max_length: int = 200) -> str:
    """Truncate SQL for audit logging (don't log huge queries)."""
    sql = sql.strip()
    if len(sql) <= max_length:
        return sql
    return sql[:max_length] + "..."


def _count_by_field(entries: deque, field_name: str) -> dict[str, int]:
    """Count entries grouped by a field value."""
    counts: dict[str, int] = {}
    for entry in entries:
        val = getattr(entry, field_name, "unknown")
        counts[val] = counts.get(val, 0) + 1
    return counts
