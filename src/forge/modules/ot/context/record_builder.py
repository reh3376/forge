"""OT record builder — assembles ContextualRecords from tag values and enrichment.

This is the final stage of the OT data pipeline:
    OPC-UA DataValue → TagRegistry → EnrichmentPipeline → record_builder → ContextualRecord

The resulting ContextualRecord carries full operational context (area,
equipment, batch, mode) alongside the raw value, quality, and provenance.
It is the universal data unit that enters the Forge governance pipeline.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode as CoreQualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge.modules.ot.context.resolvers import EnrichmentContext
from forge.modules.ot.tag_engine.models import BaseTag, TagValue

logger = logging.getLogger(__name__)

# Schema ref for OT Module records (matches FACTS spec data_contract)
_SCHEMA_REF = "forge://schemas/ot-module/v0.1.0"
_ADAPTER_ID = "forge-ot-module"
_ADAPTER_VERSION = "0.1.0"


def build_ot_record(
    *,
    tag: BaseTag,
    tag_value: TagValue,
    enrichment: EnrichmentContext,
    adapter_id: str = _ADAPTER_ID,
    adapter_version: str = _ADAPTER_VERSION,
) -> ContextualRecord:
    """Build a ContextualRecord from a tag definition, its current value,
    and the enrichment context resolved for that tag's path.

    Args:
        tag: Tag definition (path, data_type, engineering_units, etc.)
        tag_value: Current runtime value (value, quality, timestamps)
        enrichment: Operational context from EnrichmentPipeline.enrich()
        adapter_id: Adapter identity (default: forge-ot-module)
        adapter_version: Adapter version (default: 0.1.0)

    Returns:
        A fully-formed ContextualRecord ready for governance pipeline.
    """
    now = datetime.now(tz=timezone.utc)

    # ── Source ─────────────────────────────────────────────
    source = RecordSource(
        adapter_id=adapter_id,
        system="forge-ot",
        tag_path=tag.path,
        connection_id=getattr(tag, "connection_name", None) or None,
    )

    # ── Timestamps ────────────────────────────────────────
    timestamp = RecordTimestamp(
        source_time=tag_value.source_timestamp or tag_value.timestamp,
        server_time=tag_value.timestamp,
        ingestion_time=now,
    )

    # ── Value ─────────────────────────────────────────────
    # Map OPC-UA QualityCode to core QualityCode
    core_quality = _map_quality(tag_value.quality.value)

    value = RecordValue(
        raw=tag_value.value,
        engineering_units=tag.engineering_units or None,
        quality=core_quality,
        data_type=tag.data_type.value,
    )

    # ── Context ───────────────────────────────────────────
    context = RecordContext(
        equipment_id=enrichment.equipment_id,
        area=enrichment.area,
        site=enrichment.site,
        batch_id=enrichment.batch_id,
        lot_id=enrichment.lot_id,
        recipe_id=enrichment.recipe_id,
        operating_mode=enrichment.operating_mode,
        shift=enrichment.shift,
        operator_id=enrichment.operator_id,
        extra=enrichment.extra,
    )

    # ── Lineage ───────────────────────────────────────────
    lineage = RecordLineage(
        schema_ref=_SCHEMA_REF,
        adapter_id=adapter_id,
        adapter_version=adapter_version,
        transformation_chain=["opcua_subscription", "tag_engine", "context_enrichment"],
    )

    return ContextualRecord(
        source=source,
        timestamp=timestamp,
        value=value,
        context=context,
        lineage=lineage,
    )


def _map_quality(quality_str: str) -> CoreQualityCode:
    """Map OPC-UA/tag engine quality string to core QualityCode.

    Both use the same enum values (GOOD, UNCERTAIN, BAD, NOT_AVAILABLE)
    so this is a direct mapping, but we do it explicitly to catch
    any future divergence between the tag engine and core quality models.
    """
    mapping = {
        "GOOD": CoreQualityCode.GOOD,
        "UNCERTAIN": CoreQualityCode.UNCERTAIN,
        "BAD": CoreQualityCode.BAD,
        "NOT_AVAILABLE": CoreQualityCode.NOT_AVAILABLE,
    }
    return mapping.get(quality_str, CoreQualityCode.NOT_AVAILABLE)
