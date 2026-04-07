"""NMS record builder — assemble ContextualRecords from raw API responses.

Takes a raw NMS API response + its extracted RecordContext and produces a
complete ContextualRecord with source attribution, timestamps, value
preservation, and lineage tracking.

The payload is preserved as-is in the value.raw field (JSON-serialized).
NMS responses carry structured device/event data, not sensor readings, so the
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

_SOURCE_SYSTEM = "whk-nms"
_SCHEMA_REF = "forge://schemas/whk-nms/v0.1.0"


def build_contextual_record(
    *,
    raw_event: dict[str, Any],
    context: RecordContext,
    adapter_id: str,
    adapter_version: str,
    entity_type: str = "network_device",
    event_type: str = "unknown",
) -> ContextualRecord:
    """Assemble a ContextualRecord from a raw NMS API response.

    Args:
        raw_event: Full NMS API response dict (device, trap, alert, etc.).
        context: Pre-built RecordContext from context.build_record_context().
        adapter_id: Adapter manifest ID (whk-nms).
        adapter_version: Adapter manifest version.
        entity_type: Type of entity (network_device, security_event, etc.).
        event_type: Type of event (snmp_trap, baseline_anomaly, etc.).

    Returns:
        A fully populated ContextualRecord ready for hub ingestion.
    """
    device_id = str(raw_event.get("id", "unknown"))
    device_ip = str(raw_event.get("ip_address") or raw_event.get("ipAddress") or "unknown")
    entity_id = device_id if device_id != "unknown" else device_ip

    # ── Timestamps ─────────────────────────────────────────────
    source_time = _parse_timestamp(
        raw_event.get("timestamp")
        or raw_event.get("created_at")
        or raw_event.get("createdAt")
        or raw_event.get("event_time")
        or raw_event.get("eventTime")
    )
    now = datetime.now(tz=timezone.utc)

    # ── Tag Path ───────────────────────────────────────────────
    # Format: nms.<entity_type>.<event_type>.<entity_id>
    tag_path = f"nms.{entity_type.lower()}.{event_type.lower()}"
    if entity_id != "unknown":
        tag_path = f"{tag_path}.{entity_id}"

    # ── Connection ID ──────────────────────────────────────────
    # Identify the NMS system and entity
    connection_id = f"nms.{entity_type.lower()}"

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
            raw=json.dumps(raw_event, default=str, ensure_ascii=False),
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
                f"nms.v1.{entity_type}",
                "forge.adapters.whk_nms.context.build_record_context",
                "forge.adapters.whk_nms.record_builder.build_contextual_record",
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
        # Handle common ISO formats
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        logger.warning("Could not parse timestamp %r — using now(utc)", value)
        return datetime.now(tz=timezone.utc)
