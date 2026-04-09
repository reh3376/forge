"""CMMS record builder — assemble ContextualRecords from raw events.

Takes a raw CMMS message (GraphQL response or RabbitMQ envelope) + its
extracted RecordContext and produces a complete ContextualRecord with
source attribution, timestamps, value preservation, and lineage tracking.

The payload is preserved as-is in the value.raw field (JSON-serialized).
CMMS messages carry structured maintenance entity data, not sensor readings,
so the engineering_units field is not applicable and quality defaults to GOOD.
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

_SOURCE_SYSTEM = "whk-cmms"
_SCHEMA_REF = "forge://schemas/whk-cmms/v0.1.0"


def build_contextual_record(
    *,
    raw_event: dict[str, Any],
    context: RecordContext,
    adapter_id: str,
    adapter_version: str,
) -> ContextualRecord:
    """Assemble a ContextualRecord from a raw CMMS message envelope.

    Args:
        raw_event: Full CMMS RabbitMQ message envelope or GraphQL response.
        context: Pre-built RecordContext from context.build_record_context().
        adapter_id: Adapter manifest ID (whk-cmms).
        adapter_version: Adapter manifest version.

    Returns:
        A fully populated ContextualRecord ready for hub ingestion.
    """
    # Handle both GraphQL responses and RabbitMQ envelopes
    envelope = raw_event.get("data", raw_event)
    if "data" in envelope:
        payload = envelope.get("data", {})
    else:
        payload = envelope

    entity_type = str(payload.get("entity_type") or payload.get("__typename") or "unknown")
    event_type = str(payload.get("event_type", "query"))
    global_id = payload.get("globalId") or payload.get("global_id") or str(payload.get("id", ""))

    # ── Timestamps ─────────────────────────────────────────────────
    source_time = _parse_timestamp(
        payload.get("updatedAt")
        or payload.get("createdAt")
        or payload.get("updated_at")
        or payload.get("created_at")
    )
    now = datetime.now(tz=timezone.utc)

    # ── Tag Path ───────────────────────────────────────────────────
    # Format: cmms.<entity_type>.<event_type>.<id>
    tag_path = f"cmms.{entity_type.lower()}.{event_type}"
    if global_id:
        tag_path = f"{tag_path}.{global_id}"

    # ── Connection ID ──────────────────────────────────────────────
    # Identify the data source (GraphQL query or RabbitMQ exchange)
    connection_id = f"whk.cmms.{entity_type.lower()}"

    # ── Build Record ───────────────────────────────────────────────
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
                f"cmms.v1.{entity_type}",
                "forge.adapters.whk_cmms.context.build_record_context",
                "forge.adapters.whk_cmms.record_builder.build_contextual_record",
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
