"""Control write audit trail.

Every write attempt — whether confirmed, rejected, or failed — is
recorded in the audit trail.  This module provides:

1. ``WriteAuditLogger`` — a WriteListener that receives every WriteResult
   and dispatches it to configured audit sinks (contextual records,
   MQTT, file log, etc.).
2. ``WriteAuditQuery`` — query interface over the write journal for
   recent audit records, filtered by tag, requestor, status, or time.

Design notes:
- The audit logger is a WriteListener attached to ControlWriteEngine.
  It does not intercept or modify the write chain — it only records
  outcomes.
- Audit records are dispatched asynchronously to sinks.  Sink failures
  are logged but never block the write response.
- The query interface wraps ControlWriteEngine.get_journal() with
  filtering.  Long-term audit storage is handled by external sinks
  (e.g., a time-series database or contextual record writer).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Protocol, runtime_checkable

from forge.modules.ot.control.models import WriteResult, WriteStatus

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Audit sink protocol
# ---------------------------------------------------------------------------


@runtime_checkable
class AuditSink(Protocol):
    """Receives audit records for external persistence."""

    async def write_audit_record(self, record: dict[str, Any]) -> None: ...


# ---------------------------------------------------------------------------
# Built-in sinks
# ---------------------------------------------------------------------------


class ContextualRecordAuditSink:
    """Writes audit records via the contextual record writer.

    Produces records with ``record_type: "control_write_audit"`` and
    ``source_module: "ot"``.
    """

    def __init__(self, writer: Any) -> None:
        self._writer = writer

    async def write_audit_record(self, record: dict[str, Any]) -> None:
        cr_record = {
            "record_type": "control_write_audit",
            "source_module": "ot",
            "request_id": record.get("request_id", ""),
            "tag_path": record.get("tag_path", ""),
            "status": record.get("status", ""),
            "requestor": record.get("requestor", ""),
            "role": record.get("role", ""),
            "timestamp": record.get("timestamp", ""),
            "context": {
                "requested_value": record.get("requested_value"),
                "old_value": record.get("old_value"),
                "new_value": record.get("new_value"),
                "validation_passed": record.get("validation_passed"),
                "interlock_passed": record.get("interlock_passed"),
                "auth_passed": record.get("auth_passed"),
                "readback_matched": record.get("readback_matched"),
                "area": record.get("area", ""),
                "equipment_id": record.get("equipment_id", ""),
                "reason": record.get("reason", ""),
            },
        }
        await self._writer.write(cr_record)


class MqttAuditSink:
    """Publishes audit records to MQTT.

    Topic: ``{prefix}/{area}/ot/control/audit/{request_id}``
    """

    def __init__(self, mqtt_client: Any, topic_prefix: str = "") -> None:
        self._mqtt = mqtt_client
        self._prefix = topic_prefix

    async def write_audit_record(self, record: dict[str, Any]) -> None:
        import json

        area = record.get("area", "") or "global"
        request_id = record.get("request_id", "unknown")
        prefix = self._prefix or "forge"

        topic = f"{prefix}/{area}/ot/control/audit/{request_id}"
        payload = json.dumps(record, default=str)

        await self._mqtt.publish(topic, payload, qos=1, retain=False)


class LogAuditSink:
    """Logs audit records to Python logging (structured)."""

    def __init__(self, log_level: int = logging.INFO) -> None:
        self._level = log_level
        self._logger = logging.getLogger("forge.ot.control.audit")

    async def write_audit_record(self, record: dict[str, Any]) -> None:
        status = record.get("status", "UNKNOWN")
        tag = record.get("tag_path", "?")
        requestor = record.get("requestor", "?")
        req_id = record.get("request_id", "?")

        self._logger.log(
            self._level,
            "WRITE_AUDIT | %s | tag=%s | requestor=%s | id=%s",
            status,
            tag,
            requestor,
            req_id,
        )


# ---------------------------------------------------------------------------
# Write audit logger (WriteListener)
# ---------------------------------------------------------------------------


class WriteAuditLogger:
    """Listens to write results and dispatches to audit sinks.

    Attach to ControlWriteEngine via ``engine.add_listener(audit_logger)``.
    """

    def __init__(self) -> None:
        self._sinks: list[AuditSink] = []

    def add_sink(self, sink: AuditSink) -> None:
        self._sinks.append(sink)

    def remove_sink(self, sink: AuditSink) -> None:
        self._sinks = [s for s in self._sinks if s is not sink]

    @property
    def sink_count(self) -> int:
        return len(self._sinks)

    async def on_write_result(self, result: WriteResult) -> None:
        """Called by ControlWriteEngine for every write attempt."""
        record = result.to_dict()

        for sink in self._sinks:
            try:
                await sink.write_audit_record(record)
            except Exception as exc:
                logger.error(
                    "Audit sink %s failed for request %s: %s",
                    type(sink).__name__,
                    record.get("request_id", "?"),
                    exc,
                )


# ---------------------------------------------------------------------------
# Write audit query
# ---------------------------------------------------------------------------


class WriteAuditQuery:
    """Query interface for control write audit records.

    Wraps the ControlWriteEngine's journal with filtering.
    """

    def __init__(self, engine: Any) -> None:
        self._engine = engine

    def query(
        self,
        limit: int = 100,
        tag_path: str | None = None,
        requestor: str | None = None,
        status: str | None = None,
        area: str | None = None,
        since: datetime | None = None,
    ) -> list[dict[str, Any]]:
        """Return filtered audit records from the journal."""
        records = self._engine.get_journal(limit=limit * 3)  # Over-fetch for filtering

        filtered = []
        for record in records:
            if tag_path and record.get("tag_path") != tag_path:
                continue
            if requestor and record.get("requestor") != requestor:
                continue
            if status and record.get("status") != status:
                continue
            if area and record.get("area") != area:
                continue
            if since:
                ts_str = record.get("timestamp", "")
                if ts_str:
                    try:
                        ts = datetime.fromisoformat(ts_str)
                        if ts < since:
                            continue
                    except (ValueError, TypeError):
                        pass

            filtered.append(record)
            if len(filtered) >= limit:
                break

        return filtered

    def get_stats(self) -> dict[str, Any]:
        """Return write engine statistics."""
        return self._engine.get_stats()
