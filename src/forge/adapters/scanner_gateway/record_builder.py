"""Record builder for the Scanner Gateway adapter.

Transforms scanner.v1 ScanEvent dicts into Forge ContextualRecords.
Each scan event becomes one ContextualRecord with the barcode value
as the primary data and scan metadata as context.
"""

from __future__ import annotations

import json
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


def _parse_timestamp(raw: Any) -> datetime | None:
    """Parse a timestamp from the scanner event formats; None when there is none (FB-088)."""
    if raw is None:
        return None

    if isinstance(raw, datetime):
        if raw.tzinfo is None:
            return raw.replace(tzinfo=UTC)
        return raw

    if isinstance(raw, dict):
        seconds = raw.get("seconds", 0)
        nanos = raw.get("nanos", 0)
        return datetime.fromtimestamp(
            seconds + nanos / 1e9,
            tz=UTC,
        )

    if isinstance(raw, (int, float)):
        return datetime.fromtimestamp(raw, tz=UTC)

    raw_str = str(raw)
    try:
        dt = datetime.fromisoformat(raw_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt
    except ValueError:
        return None


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
    source_timestamp_origin: str | None = None,
) -> ContextualRecord:
    """Build a ContextualRecord from a scanner.v1 ScanEvent.

    Args:
        scan_event: Dict representation of scanner.v1.ScanEvent.
        context: Pre-built RecordContext from context.py.
        adapter_id: The adapter's identity string.
        adapter_version: The adapter's version string.
        source_timestamp_origin: the origin the connection declared for the clock that
            stamps its values (device, server, edge or forge); None when undeclared (FB-088)

    Returns:
        A fully-populated ContextualRecord.
    """
    now = datetime.now(tz=UTC)
    tag_path = _scan_tag_path(scan_event)
    device_id = scan_event.get("device_id")
    # scanned_at is the source time; a scan without one is refused unless the adapter
    # declares source_timestamp_origin: forge (one clock, FB-088).
    stamp = resolve_source_stamp(
        _parse_timestamp(scan_event.get("scanned_at")),
        origin=source_timestamp_origin,
        read_at=now,
        adapter_id=adapter_id,
        connection=str(device_id) if device_id is not None else None,
        tag_path=tag_path,
    )

    # The scan event payload is the full event minus internal fields
    payload = {k: v for k, v in scan_event.items() if k not in ("_routed_to",) and v is not None}

    return ContextualRecord(
        source=RecordSource(
            adapter_id=adapter_id,
            system="scanner-gateway",
            tag_path=tag_path,
            connection_id=scan_event.get("device_id"),
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
