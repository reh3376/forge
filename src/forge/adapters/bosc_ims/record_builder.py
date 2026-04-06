"""Record builder for the BOSC IMS adapter.

Transforms BOSC IMS TransactionEvent dicts into Forge ContextualRecords.
Each TransactionEvent becomes one ContextualRecord carrying the event's
payload as the value and the full operational context.

The builder handles:
  - TransactionEvent → ContextualRecord mapping
  - Asset → ContextualRecord mapping (for snapshot/discovery data)
  - Timestamp extraction with source_time from occurred_at
  - Lineage construction with transformation chain
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from forge.adapters.bosc_ims.context import build_record_context
from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)


def _parse_timestamp(raw: Any) -> datetime:
    """Parse a timestamp from various BOSC IMS formats.

    Handles:
      - ISO 8601 strings
      - Proto Timestamp dict with seconds/nanos
      - datetime objects passthrough
      - None → current time
    """
    if raw is None:
        return datetime.now(tz=UTC)

    if isinstance(raw, datetime):
        if raw.tzinfo is None:
            return raw.replace(tzinfo=UTC)
        return raw

    if isinstance(raw, dict):
        # Proto Timestamp → {"seconds": int, "nanos": int}
        seconds = raw.get("seconds", 0)
        nanos = raw.get("nanos", 0)
        return datetime.fromtimestamp(
            seconds + nanos / 1e9,
            tz=UTC,
        )

    if isinstance(raw, (int, float)):
        return datetime.fromtimestamp(raw, tz=UTC)

    # String — try ISO 8601
    raw_str = str(raw)
    try:
        dt = datetime.fromisoformat(raw_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt
    except ValueError:
        return datetime.now(tz=UTC)


def _serialize_payload(event: dict[str, Any]) -> str:
    """Serialize the event payload to a JSON string for RecordValue.

    The payload is a google.protobuf.Any when in proto form, but by
    the time it reaches the adapter it's a dict. We serialize it
    to JSON for the ContextualRecord's string value.
    """
    payload = event.get("payload")
    if payload is None:
        return "{}"
    if isinstance(payload, str):
        return payload
    try:
        return json.dumps(payload, default=str, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(payload)


def _event_tag_path(event: dict[str, Any]) -> str:
    """Derive a tag path from the event type and asset.

    Format: bosc.event.<normalized_type>
    """
    event_type = event.get("event_type", "unknown")
    if isinstance(event_type, int):
        return f"bosc.event.type_{event_type}"

    # Normalize: TRANSACTION_TYPE_ASSET_RECEIVED → asset_received
    type_str = str(event_type)
    normalized = type_str.removeprefix("TRANSACTION_TYPE_").lower()
    return f"bosc.event.{normalized}"


def build_contextual_record(
    *,
    raw_event: dict[str, Any],
    context: RecordContext,
    adapter_id: str,
    adapter_version: str,
    asset: dict[str, Any] | None = None,
) -> ContextualRecord:
    """Build a ContextualRecord from a BOSC IMS TransactionEvent.

    Args:
        raw_event: Dict representation of bosc.v1.TransactionEvent.
        context: Pre-built RecordContext from context.py.
        adapter_id: The adapter's identity string.
        adapter_version: The adapter's version string.
        asset: Optional associated Asset dict for enrichment.

    Returns:
        A fully-populated ContextualRecord.
    """
    source_time = _parse_timestamp(raw_event.get("occurred_at"))
    now = datetime.now(tz=UTC)

    return ContextualRecord(
        source=RecordSource(
            adapter_id=adapter_id,
            system="bosc-ims",
            tag_path=_event_tag_path(raw_event),
            connection_id=raw_event.get("asset_id"),
        ),
        timestamp=RecordTimestamp(
            source_time=source_time,
            server_time=source_time,
            ingestion_time=now,
        ),
        value=RecordValue(
            raw=_serialize_payload(raw_event),
            engineering_units=None,
            quality=QualityCode.GOOD,
            data_type="json",
        ),
        context=context,
        lineage=RecordLineage(
            schema_ref="forge://schemas/bosc-ims/v0.1.0",
            adapter_id=adapter_id,
            adapter_version=adapter_version,
            transformation_chain=[
                "bosc.v1.TransactionEvent",
                "forge.adapters.bosc_ims.context.build_record_context",
                "forge.adapters.bosc_ims.record_builder.build_contextual_record",
            ],
        ),
    )


def build_asset_record(
    *,
    asset: dict[str, Any],
    adapter_id: str,
    adapter_version: str,
) -> ContextualRecord:
    """Build a ContextualRecord from a BOSC IMS Asset snapshot.

    Used during discovery/backfill to represent the current state
    of an asset as a ContextualRecord rather than an event.
    """
    context = build_record_context(
        {"asset_id": asset.get("id", ""), "event_type": "asset.snapshot"},
        asset=asset,
    )

    source_time = _parse_timestamp(
        asset.get("updated_at") or asset.get("created_at"),
    )
    now = datetime.now(tz=UTC)

    return ContextualRecord(
        source=RecordSource(
            adapter_id=adapter_id,
            system="bosc-ims",
            tag_path="bosc.asset.snapshot",
            connection_id=asset.get("id"),
        ),
        timestamp=RecordTimestamp(
            source_time=source_time,
            server_time=source_time,
            ingestion_time=now,
        ),
        value=RecordValue(
            raw=json.dumps(asset, default=str, ensure_ascii=False),
            engineering_units=None,
            quality=QualityCode.GOOD,
            data_type="json",
        ),
        context=context,
        lineage=RecordLineage(
            schema_ref="forge://schemas/bosc-ims/v0.1.0",
            adapter_id=adapter_id,
            adapter_version=adapter_version,
            transformation_chain=[
                "bosc.v1.Asset",
                "forge.adapters.bosc_ims.record_builder.build_asset_record",
            ],
        ),
    )
