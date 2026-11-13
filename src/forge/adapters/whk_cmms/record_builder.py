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
from datetime import UTC, datetime
from typing import Any

from forge.core.clock import resolve_source_stamp
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
    source_timestamp_origin: str | None = None,
    poll_bound_seconds: float | None = None,
) -> ContextualRecord:
    """Assemble a ContextualRecord from a raw CMMS message envelope.

    Args:
        raw_event: Full CMMS RabbitMQ message envelope or GraphQL response.
        context: Pre-built RecordContext from context.build_record_context().
        adapter_id: Adapter manifest ID (whk-cmms).
        adapter_version: Adapter manifest version.
        source_timestamp_origin: the origin the connection declared for the clock that
            stamps its values (device, server, edge or forge); None when undeclared (FB-088)
        poll_bound_seconds: the adapter's poll interval, recorded as the uncertainty when
            Forge's read time stands in

    Returns:
        A fully populated ContextualRecord ready for hub ingestion.
    """
    # Handle both GraphQL responses and RabbitMQ envelopes
    envelope = raw_event.get("data", raw_event)
    payload = envelope.get("data", {}) if "data" in envelope else envelope

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
    now = datetime.now(tz=UTC)

    # ── Tag Path ───────────────────────────────────────────────────
    # Format: cmms.<entity_type>.<event_type>.<id>
    tag_path = f"cmms.{entity_type.lower()}.{event_type}"
    if global_id:
        tag_path = f"{tag_path}.{global_id}"

    # ── Connection ID ──────────────────────────────────────────────
    # Identify the data source (GraphQL query or RabbitMQ exchange)
    connection_id = f"whk.cmms.{entity_type.lower()}"

    # ── Source stamp ───────────────────────────────────────────
    # The event's own time is the source time; an event without one is refused unless the
    # adapter declares source_timestamp_origin: forge, and then the poll interval is
    # the uncertainty bound (one clock, FB-088).
    stamp = resolve_source_stamp(
        source_time,
        origin=source_timestamp_origin,
        read_at=now,
        poll_bound_seconds=poll_bound_seconds,
        adapter_id=adapter_id,
        connection=connection_id,
        tag_path=tag_path,
    )

    # ── Build Record ───────────────────────────────────────────────
    return ContextualRecord(
        source=RecordSource(
            adapter_id=adapter_id,
            system=_SOURCE_SYSTEM,
            tag_path=tag_path,
            connection_id=connection_id,
        ),
        # This system sends no server stamp; none is invented (FB-088).
        timestamp=RecordTimestamp(
            source_time=stamp.source_time,
            ingestion_time=now,
            source_clock=stamp.source_clock,
            source_uncertainty_seconds=stamp.source_uncertainty_seconds,
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


def _parse_timestamp(value: Any) -> datetime | None:
    """Parse an ISO timestamp string; None when there is none or it does not parse (FB-088)."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    try:
        s = str(value)
        # Handle common ISO formats from NestJS/Prisma
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
    except (ValueError, TypeError):
        logger.warning("Could not parse timestamp %r: the event carries no source stamp", value)
        return None
