"""ERPI record builder — assemble ContextualRecords from raw events.

Takes a raw ERPI message envelope + its extracted RecordContext and
produces a complete ContextualRecord with source attribution, timestamps,
value preservation, and lineage tracking.

The payload is preserved as-is in the value.raw field (JSON-serialized).
ERPI messages carry structured entity data, not sensor readings, so the
engineering_units field is not applicable and quality defaults to GOOD.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)

logger = logging.getLogger(__name__)

_SOURCE_SYSTEM = "whk-erpi"
_SCHEMA_REF = "forge://schemas/whk-erpi/v0.1.0"


def build_contextual_record(
    *,
    raw_event: dict[str, Any],
    context: RecordContext,
    adapter_id: str,
    adapter_version: str,
) -> ContextualRecord:
    """Assemble a ContextualRecord from a raw ERPI message envelope.

    Args:
        raw_event: Full ERPI RabbitMQ message envelope.
        context: Pre-built RecordContext from context.build_record_context().
        adapter_id: Adapter manifest ID (whk-erpi).
        adapter_version: Adapter manifest version.

    Returns:
        A fully populated ContextualRecord ready for hub ingestion.
    """
    envelope = raw_event.get("data", raw_event)
    payload = envelope.get("data", {})
    record_name = str(envelope.get("recordName", "unknown"))
    event_type = str(envelope.get("event_type", "unknown"))
    global_id = payload.get("globalId") or payload.get("global_id") or ""

    # ── Timestamps ─────────────────────────────────────────────
    source_time = _parse_timestamp(
        payload.get("updatedAt")
        or payload.get("createdAt")
        or payload.get("updated_at")
        or payload.get("created_at")
    )
    now = datetime.now(tz=timezone.utc)

    # ── Tag Path ───────────────────────────────────────────────
    # Format: erpi.<entity_type>.<event_type>.<global_id>
    tag_path = f"erpi.{record_name.lower()}.{event_type}"
    if global_id:
        tag_path = f"{tag_path}.{global_id}"

    # ── Connection ID ──────────────────────────────────────────
    # Identify which RabbitMQ exchange this came from
    connection_id = f"wh.whk01.distillery01.{record_name.lower()}"

    # ── Build Record ───────────────────────────────────────────
    return ContextualRecord(
        source=RecordSource(
            adapter_id=adapter_id,
            system=_SOURCE_SYSTEM,
            tag_path=tag_path,
            connection_id=connection_id,
        ),
        timestamp=RecordTimestamp(
            source_time=source_time,
            server_time=now,
            ingestion_time=now,
        ),
        value=RecordValue(
            raw=json.dumps(payload, default=str, ensure_ascii=False),
            engineering_units=None,
            quality=QualityCode.GOOD,
            data_type="json",
        ),
        context=context,
        lineage=RecordLineage(
            schema_ref=_SCHEMA_REF,
            adapter_id=adapter_id,
            adapter_version=adapter_version,
            transformation_chain=[
                f"erpi.v1.{record_name}",
                "forge.adapters.whk_erpi.context.build_record_context",
                "forge.adapters.whk_erpi.record_builder.build_contextual_record",
            ],
        ),
    )


def _parse_timestamp(value: Any) -> datetime:
    """Parse an ISO timestamp string, falling back to now(utc)."""
    if value is None:
        return datetime.now(tz=timezone.utc)
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        s = str(value)
        # Handle common ISO formats from NestJS/Prisma
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        logger.warning("Could not parse timestamp %r — using now(utc)", value)
        return datetime.now(tz=timezone.utc)
