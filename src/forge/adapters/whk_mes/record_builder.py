"""Record builder -- assembles ContextualRecords from mapped MES data.

This is the final stage of the adapter data flow:
    MES raw dict -> entity mappers -> core model
    MES raw dict -> context mapper -> RecordContext
    (core model, RecordContext) -> record_builder -> ContextualRecord

The ContextualRecord is the universal unit that enters the Forge
governance pipeline (FACTS validation -> storage -> curation).

MES-specific quality assessment considers batch IDs and production
order IDs as primary identifiers (vs. WMS's barrel_id focus).
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

# Schema ref matches the FACTS spec data_contract.schema_ref
_SCHEMA_REF = "forge://schemas/whk-mes/v0.1.0"


def build_contextual_record(
    *,
    raw_event: dict[str, Any],
    context: RecordContext,
    adapter_id: str,
    adapter_version: str,
) -> ContextualRecord:
    """Assemble a ContextualRecord from a raw MES event and its context.

    Args:
        raw_event: Original raw dict from MES (preserved as the record value).
        context: RecordContext produced by build_record_context().
        adapter_id: Adapter identity string (e.g. "whk-mes").
        adapter_version: Adapter version (e.g. "0.1.0").

    Returns:
        A fully-formed ContextualRecord ready for the governance pipeline.
    """
    # -- Timestamps -----------------------------------------------------
    source_time = _extract_source_time(raw_event)
    now = datetime.now(tz=timezone.utc)
    timestamp = RecordTimestamp(
        source_time=source_time or now,
        server_time=_extract_server_time(raw_event),
        ingestion_time=now,
    )

    # -- Value ----------------------------------------------------------
    value = RecordValue(
        raw=raw_event,
        data_type="object",
        quality=_assess_quality(raw_event),
    )

    # -- Source ---------------------------------------------------------
    tag_path = _derive_tag_path(raw_event)
    source = RecordSource(
        adapter_id=adapter_id,
        system="whk-mes",
        tag_path=tag_path,
    )

    # -- Lineage --------------------------------------------------------
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
    """Extract the original event timestamp from the raw MES data.

    MES events use a wider variety of timestamp field names than WMS,
    including MQTT-specific fields like equipment_timestamp.
    """
    for key in (
        "event_timestamp",
        "eventTimestamp",
        "timestamp",
        "createdAt",
        "created_at",
        "equipment_timestamp",
        "startedAt",
        "completedAt",
    ):
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
    for key in ("server_time", "processed_at", "updatedAt", "updated_at"):
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
    """Assess data quality from available signals in the raw MES event.

    MES quality assessment uses batch_id and production_order_id as
    primary identifiers (vs. WMS's barrel_id focus). Equipment data
    from MQTT may have different identifier patterns.
    """
    if raw.get("error") or raw.get("is_error") or raw.get("isError"):
        return QualityCode.BAD

    has_id = bool(
        raw.get("batch_id")
        or raw.get("batchId")
        or raw.get("production_order_id")
        or raw.get("productionOrderId")
        or raw.get("equipment_id")
        or raw.get("equipmentId")
        or raw.get("lot_id")
        or raw.get("lotId")
        or raw.get("id")
    )
    has_time = bool(
        raw.get("event_timestamp")
        or raw.get("eventTimestamp")
        or raw.get("timestamp")
        or raw.get("createdAt")
        or raw.get("created_at")
    )

    if has_id and has_time:
        return QualityCode.GOOD
    if has_id or has_time:
        return QualityCode.UNCERTAIN
    return QualityCode.NOT_AVAILABLE


def _derive_tag_path(raw: dict[str, Any]) -> str | None:
    """Derive a tag path from the raw event for source identification.

    Uses the source type and entity type to build a hierarchical path
    like 'mes.graphql.batch' or 'mes.mqtt.equipment_events'.
    """
    source_type = raw.get("source_type", "graphql")
    entity = (
        raw.get("entity_type")
        or raw.get("entityType")
        or raw.get("record_name")
        or raw.get("recordName")
        or "event"
    )
    return f"mes.{source_type}.{entity}".lower()
