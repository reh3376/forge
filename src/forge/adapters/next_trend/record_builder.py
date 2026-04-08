"""Record builder for the NextTrend Historian adapter.

Assembles ContextualRecords from NextTrend tag metadata and value
points. Each tag value (timestamp + value + quality) becomes one
ContextualRecord with full lineage and provenance.
"""

from __future__ import annotations

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


def build_contextual_record(
    *,
    tag_meta: dict[str, Any],
    value_point: dict[str, Any],
    context: RecordContext,
    adapter_id: str = "next-trend",
    adapter_version: str = "0.1.0",
) -> ContextualRecord:
    """Build a ContextualRecord from a NextTrend tag value point.

    Args:
        tag_meta: Tag metadata (id, name, data_type, unit, ...).
        value_point: Single data point with ts, value, quality.
        context: RecordContext built by context.build_record_context().
        adapter_id: Forge adapter identifier.
        adapter_version: Adapter version string.

    Returns:
        A fully formed ContextualRecord.
    """
    tag_name = tag_meta.get("name", "unknown")
    tag_path = _historian_tag_path(tag_name)
    source_time = _parse_timestamp(value_point.get("ts"))
    now = datetime.now(tz=timezone.utc)

    # Build record value
    raw_value = value_point.get("value")
    data_type = (tag_meta.get("data_type") or "string").lower()

    record_value = RecordValue(
        raw=raw_value,
        engineering_units=tag_meta.get("unit") or None,
        quality=_assess_quality(value_point.get("quality")),
        data_type=data_type,
    )

    return ContextualRecord(
        source=RecordSource(
            adapter_id=adapter_id,
            system="next-trend",
            tag_path=tag_path,
            connection_id=tag_meta.get("id"),
        ),
        timestamp=RecordTimestamp(
            source_time=source_time,
            server_time=now,
            ingestion_time=now,
        ),
        value=record_value,
        context=context,
        lineage=RecordLineage(
            schema_ref="forge://schemas/next-trend/v0.1.0",
            adapter_id=adapter_id,
            adapter_version=adapter_version,
            transformation_chain=[
                "nexttrend.rest.TagValue",
                "forge.adapters.next_trend.context.build_record_context",
                "forge.adapters.next_trend.record_builder.build_contextual_record",
            ],
        ),
    )


def _historian_tag_path(tag_name: str) -> str:
    """Derive a Forge tag path from a NextTrend tag name.

    NextTrend uses slash-separated paths:
        WH/WHK01/Distillery01/Temperature

    Forge tag paths use dot-separated notation:
        historian.tag.WH.WHK01.Distillery01.Temperature
    """
    normalized = tag_name.replace("/", ".")
    return f"historian.tag.{normalized}"


def _parse_timestamp(ts_value: Any) -> datetime:
    """Parse a NextTrend timestamp (RFC 3339 string) to datetime."""
    if ts_value is None:
        return datetime.now(tz=timezone.utc)

    if isinstance(ts_value, datetime):
        if ts_value.tzinfo is None:
            return ts_value.replace(tzinfo=timezone.utc)
        return ts_value

    if isinstance(ts_value, (int, float)):
        return datetime.fromtimestamp(ts_value, tz=timezone.utc)

    ts_str = str(ts_value)
    # Try fromisoformat first (handles most RFC 3339 variants)
    try:
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        pass

    logger.warning("Unparseable timestamp: %s — using now()", ts_str)
    return datetime.now(tz=timezone.utc)


def _normalize_value(
    raw: Any, data_type: str | None
) -> float | int | str | bool | None:
    """Normalize a tag value based on declared data type."""
    if raw is None:
        return None

    dt = (data_type or "").lower()
    if dt in ("float64", "float"):
        try:
            return float(raw)
        except (TypeError, ValueError):
            return raw
    if dt in ("int64", "int", "integer"):
        try:
            return int(raw)
        except (TypeError, ValueError):
            return raw
    if dt in ("boolean", "bool"):
        if isinstance(raw, bool):
            return raw
        return str(raw).lower() in ("true", "1")
    if dt == "string":
        return str(raw)

    return raw


def _assess_quality(quality_code: int | None) -> QualityCode:
    """Map an OPC UA quality code to Forge QualityCode."""
    if quality_code is None:
        return QualityCode.UNCERTAIN

    if quality_code >= 192:
        return QualityCode.GOOD
    if quality_code >= 64:
        return QualityCode.UNCERTAIN
    return QualityCode.BAD
