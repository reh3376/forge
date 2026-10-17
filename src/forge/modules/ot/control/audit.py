"""Control write audit trail.

Every write attempt — whether confirmed, rejected, or failed — is
recorded in the audit trail.  This module provides:

1. ``WriteAuditLogger`` — a WriteListener that receives every WriteResult
   and dispatches it to configured audit sinks (contextual records into
   the hub ingest pipeline, MQTT, log).
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
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge.modules.ot.control.models import WriteOrigin, WriteResult, WriteStatus

if TYPE_CHECKING:
    from collections.abc import Callable

OT_ADAPTER_ID = "forge-ot-module"
OT_ADAPTER_VERSION = "0.1.0"
OT_SCHEMA_REF = "forge://schemas/ot-module/v0.1.0"
CONTROL_WRITE_PREFIX = "ot.control.write"

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


def _parse_time(value: Any, default: datetime) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if isinstance(value, str) and value:
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError:
            return default
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    return default


def write_result_to_record(
    record: dict[str, Any],
    *,
    adapter_id: str = OT_ADAPTER_ID,
    adapter_version: str = OT_ADAPTER_VERSION,
    schema_ref: str = OT_SCHEMA_REF,
    system: str = "forge-ot",
    site: str | None = None,
    now: datetime | None = None,
) -> ContextualRecord:
    """Turn a ``WriteResult.to_dict()`` into the ContextualRecord the hub stores.

    Conventions match the changeover orchestrator's audit records: the
    source tag is ``ot.control.write.<plc tag path>``, the whole decision
    chain is the raw value, quality follows the outcome (CONFIRMED → GOOD,
    UNCONFIRMED → UNCERTAIN, anything else → BAD) and ``context.extra``
    carries ``event_type = "control.write"`` with the status, role, reason,
    origin, reason code, review timing, batch and request ids for filtering.
    """
    now = now or datetime.now(UTC)
    status = str(record.get("status") or WriteStatus.PENDING.value)
    if status == WriteStatus.CONFIRMED.value:
        quality = QualityCode.GOOD
    elif status == WriteStatus.UNCONFIRMED.value:
        quality = QualityCode.UNCERTAIN
    else:
        quality = QualityCode.BAD
    tag_path = str(record.get("tag_path") or "")
    requested_at = _parse_time(record.get("timestamp"), now)
    completed_at = _parse_time(record.get("completed_at"), now)
    extra: dict[str, Any] = {
        "event_type": "control.write",
        "entity_type": "ControlWrite",
        "target_tag_path": tag_path,
        "write_status": status,
        "write_role": record.get("role"),
        "write_reason": record.get("reason"),
        "write_origin": record.get("origin") or WriteOrigin.OPERATOR.value,
        "write_requested_by": record.get("requestor"),
        "request_id": record.get("request_id"),
        "event_timestamp": completed_at.isoformat(),
    }
    for key in ("batch_id", "interlock_rule_id", "reason_code", "staged_at", "stage_attempt"):
        if record.get(key):
            extra[key] = record[key]
    error = (
        record.get("validation_error")
        or record.get("review_error")
        or record.get("interlock_error")
        or record.get("auth_error")
        or record.get("write_error")
        or record.get("readback_error")
    )
    if error:
        extra["error"] = error
    return ContextualRecord(
        source=RecordSource(
            adapter_id=adapter_id,
            system=system,
            tag_path=f"{CONTROL_WRITE_PREFIX}.{tag_path}",
        ),
        timestamp=RecordTimestamp(source_time=requested_at, server_time=completed_at),
        value=RecordValue(raw=dict(record), quality=quality, data_type="object"),
        context=RecordContext(
            area=record.get("area") or None,
            equipment_id=record.get("equipment_id") or None,
            site=site,
            operator_id=record.get("requestor") or None,
            extra=extra,
        ),
        lineage=RecordLineage(
            schema_ref=schema_ref,
            adapter_id=adapter_id,
            adapter_version=adapter_version,
            transformation_chain=["ot:control-write-engine"],
        ),
    )


class ContextualRecordAuditSink:
    """Hands every write result to a record sink as a ContextualRecord (FB-066).

    ``record_sink`` is anything with ``async write_batch(list[ContextualRecord])``
    — the hub's ``IngestPipeline`` in production, so control writes land in
    the same store as the data they changed.
    """

    def __init__(
        self,
        record_sink: Any,
        *,
        adapter_id: str = OT_ADAPTER_ID,
        adapter_version: str = OT_ADAPTER_VERSION,
        schema_ref: str = OT_SCHEMA_REF,
        system: str = "forge-ot",
        site: str | None = None,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self._sink = record_sink
        self._adapter_id = adapter_id
        self._adapter_version = adapter_version
        self._schema_ref = schema_ref
        self._system = system
        self._site = site
        self._now = now or (lambda: datetime.now(UTC))
        self.records_written = 0

    def to_record(self, record: dict[str, Any]) -> ContextualRecord:
        return write_result_to_record(
            record,
            adapter_id=self._adapter_id,
            adapter_version=self._adapter_version,
            schema_ref=self._schema_ref,
            system=self._system,
            site=self._site,
            now=self._now(),
        )

    async def write_audit_record(self, record: dict[str, Any]) -> None:
        await self._sink.write_batch([self.to_record(record)])
        self.records_written += 1


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
