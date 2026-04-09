"""Record builder — assembles ContextualRecords from mapped WMS data.

This is the final stage of the adapter data flow:
    WMS raw dict → entity mappers → core model
    WMS raw dict → context mapper → RecordContext
    (core model, RecordContext) → record_builder → ContextualRecord

The ContextualRecord is the universal unit that enters the Forge
governance pipeline (FACTS validation → storage → curation).
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
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

# Schema ref matches the FACTS spec data_contract.schema_ref
_SCHEMA_REF = "forge://schemas/whk-wms/v0.1.0"


def build_contextual_record(
    *,
    raw_event: dict[str, Any],
    context: RecordContext,
    adapter_id: str,
    adapter_version: str,
) -> ContextualRecord:
    """Assemble a ContextualRecord from a raw WMS event and its context.

    Args:
        raw_event: Original raw dict from WMS (preserved as the record value).
        context: RecordContext produced by build_record_context().
        adapter_id: Adapter identity string (e.g. "whk-wms").
        adapter_version: Adapter version (e.g. "0.1.0").

    Returns:
        A fully-formed ContextualRecord ready for the governance pipeline.
    """
    # ── Timestamps ─────────────────────────────────────────────
    source_time = _extract_source_time(raw_event)
    now = datetime.now(tz=UTC)
    timestamp = RecordTimestamp(
        source_time=source_time or now,
        server_time=_extract_server_time(raw_event),
        ingestion_time=now,
    )

    # ── Value ──────────────────────────────────────────────────
    value = RecordValue(
        raw=raw_event,
        data_type="object",
        quality=_assess_quality(raw_event),
    )

    # ── Source ─────────────────────────────────────────────────
    tag_path = _derive_tag_path(raw_event)
    source = RecordSource(
        adapter_id=adapter_id,
        system="whk-wms",
        tag_path=tag_path,
    )

    # ── Lineage ────────────────────────────────────────────────
    lineage = RecordLineage(
        schema_ref=_SCHEMA_REF,
        adapter_id=adapter_id,
        adapter_version=adapter_version,
    )

    return ContextualRecord(
        source=source,
        timestamp=timestamp,
        value=value,
        context=context,
        lineage=lineage,
    )


def _extract_source_time(raw: dict[str, Any]) -> datetime | None:
    """Extract the original event timestamp from the raw WMS data."""
    for key in ("event_timestamp", "timestamp", "created_at", "fill_date"):
        val = raw.get(key)
        if val is None:
            continue
        if isinstance(val, datetime):
            return val
        if isinstance(val, str):
            try:
                return datetime.fromisoformat(val.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                continue
    return None


def _extract_server_time(raw: dict[str, Any]) -> datetime | None:
    """Extract the server processing timestamp if present."""
    for key in ("server_time", "processed_at", "updated_at"):
        val = raw.get(key)
        if val is None:
            continue
        if isinstance(val, datetime):
            return val
        if isinstance(val, str):
            try:
                return datetime.fromisoformat(val.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                continue
    return None


def _assess_quality(raw: dict[str, Any]) -> QualityCode:
    """Assess data quality from available signals in the raw event.

    A raw event with both a barrel_id (or manufacturing_unit_id) and
    a timestamp is GOOD. Missing key identifiers downgrades to
    UNCERTAIN. An explicitly errored event is BAD.
    """
    if raw.get("error") or raw.get("is_error"):
        return QualityCode.BAD

    has_id = bool(
        raw.get("barrel_id")
        or raw.get("barrelId")
        or raw.get("manufacturing_unit_id")
        or raw.get("lot_id")
        or raw.get("lotId")
        or raw.get("id")
    )
    has_time = bool(
        raw.get("event_timestamp")
        or raw.get("timestamp")
        or raw.get("eventTime")
        or raw.get("created_at")
        or raw.get("createdAt")
    )

    if has_id and has_time:
        return QualityCode.GOOD
    if has_id or has_time:
        return QualityCode.UNCERTAIN
    return QualityCode.NOT_AVAILABLE


def _derive_tag_path(raw: dict[str, Any]) -> str | None:
    """Derive a tag path from the raw event for source identification.

    Uses the entity type and exchange/source information to build a
    hierarchical path like 'wms.graphql.barrel' or 'wms.rabbitmq.barrel_state'.
    """
    source_type = raw.get("source_type", "graphql")
    entity = raw.get("entity_type") or raw.get("record_name") or "event"
    return f"wms.{source_type}.{entity}".lower()
