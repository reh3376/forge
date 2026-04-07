"""Record builder for the Scanner Gateway adapter.

Transforms scanner.v1 ScanEvent dicts into Forge ContextualRecords.
Each scan event becomes one ContextualRecord with the barcode value
as the primary data and scan metadata as context.
"""

from __future__ import annotations

import json
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


def _parse_timestamp(raw: Any) -> datetime:
    """Parse a timestamp from various scanner event formats."""
    if raw is None:
        return datetime.now(tz=timezone.utc)

    if isinstance(raw, datetime):
        if raw.tzinfo is None:
            return raw.replace(tzinfo=timezone.utc)
        return raw

    if isinstance(raw, dict):
        seconds = raw.get("seconds", 0)
        nanos = raw.get("nanos", 0)
        return datetime.fromtimestamp(
            seconds + nanos / 1e9,
            tz=timezone.utc,
        )

    if isinstance(raw, (int, float)):
        return datetime.fromtimestamp(raw, tz=timezone.utc)

    raw_str = str(raw)
    try:
        dt = datetime.fromisoformat(raw_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return datetime.now(tz=timezone.utc)


def _scan_tag_path(scan_event: dict[str, Any]) -> str:
    """Derive a tag path from the scan type.

    Format: scanner.scan.<normalized_type>
    """
    scan_type = scan_event.get("scan_type", "unknown")
    if isinstance(scan_type, int):
        return f"scanner.scan.type_{scan_type}"

    normalized = str(scan_type).removeprefix("SCAN_TYPE_").lower()
    return f"scanner.scan.{normalized}"


def build_contextual_record(
    *,
    scan_event: dict[str, Any],
    context: RecordContext,
    adapter_id: str,
    adapter_version: str,
) -> ContextualRecord:
    """Build a ContextualRecord from a scanner.v1 ScanEvent.

    Args:
        scan_event: Dict representation of scanner.v1.ScanEvent.
        context: Pre-built RecordContext from context.py.
        adapter_id: The adapter's identity string.
        adapter_version: The adapter's version string.

    Returns:
        A fully-populated ContextualRecord.
    """
    source_time = _parse_timestamp(scan_event.get("scanned_at"))
    now = datetime.now(tz=timezone.utc)

    # The scan event payload is the full event minus internal fields
    payload = {
        k: v for k, v in scan_event.items()
        if k not in ("_routed_to",) and v is not None
    }

    return ContextualRecord(
        source=RecordSource(
            adapter_id=adapter_id,
            system="scanner-gateway",
            tag_path=_scan_tag_path(scan_event),
            connection_id=scan_event.get("device_id"),
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
            schema_ref="forge://schemas/scanner-gateway/v0.1.0",
            adapter_id=adapter_id,
            adapter_version=adapter_version,
            transformation_chain=[
                "scanner.v1.ScanEvent",
                "forge.adapters.scanner_gateway.context.build_record_context",
                "forge.adapters.scanner_gateway.record_builder.build_contextual_record",
            ],
        ),
    )
