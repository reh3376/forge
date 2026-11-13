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
    source_timestamp_origin: str | None = None,
    poll_bound_seconds: float | None = None,
) -> ContextualRecord:
    """Assemble a ContextualRecord from a raw NMS API response.

    Args:
        raw_event: Full NMS API response dict (device, trap, alert, etc.).
        context: Pre-built RecordContext from context.build_record_context().
        adapter_id: Adapter manifest ID (whk-nms).
        adapter_version: Adapter manifest version.
        source_timestamp_origin: the origin the connection declared for the clock that
            stamps its values (device, server, edge or forge); None when undeclared (FB-088)
        poll_bound_seconds: the adapter's poll interval, recorded as the uncertainty when
            Forge's read time stands in
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
        # the NMS's own time fields: a device's last_seen, a SPOF's detected_at, an
        # LLDP/ARP neighbour's discovered_at (net_topo_toolkit's API models)
        or raw_event.get("last_seen")
        or raw_event.get("detected_at")
        or raw_event.get("discovered_at")
    )
    now = datetime.now(tz=UTC)

    # ── Tag Path ───────────────────────────────────────────────
    # Format: nms.<entity_type>.<event_type>.<entity_id>
    tag_path = f"nms.{entity_type.lower()}.{event_type.lower()}"
    if entity_id != "unknown":
        tag_path = f"{tag_path}.{entity_id}"

    # ── Connection ID ──────────────────────────────────────────
    # Identify the NMS system and entity
    connection_id = f"nms.{entity_type.lower()}"

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

    # ── Build Record ───────────────────────────────────────────
    return ContextualRecord(
        source=RecordSource(
            adapter_id=adapter_id,
            system=_SOURCE_SYSTEM,
            tag_path=tag_path,
            connection_id=connection_id,
        ),
        # This system sends no server stamp; none is invented (FB-088).
        timestamp=RecordTimestamp(
            **stamp.timestamp_fields(),
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


def _parse_timestamp(value: Any) -> datetime | None:
    """Parse an ISO timestamp string; None when there is none or it does not parse (FB-088)."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    try:
        s = str(value)
        # Handle common ISO formats
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
    except (ValueError, TypeError):
        logger.warning("Could not parse timestamp %r: the event carries no source stamp", value)
        return None
