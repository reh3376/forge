"""OT record builder — assembles ContextualRecords from tag values and enrichment.

This is the final stage of the OT data pipeline:
    OPC-UA DataValue → TagRegistry → EnrichmentPipeline → record_builder → ContextualRecord

The resulting ContextualRecord carries full operational context (area,
equipment, batch, mode) alongside the raw value, quality, and provenance.
It is the universal data unit that enters the Forge governance pipeline.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from forge.core.clock import FORGE_CLOCK, resolve_source_stamp
from forge.core.models.contextual_record import (
    ContextualRecord,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge.core.models.contextual_record import (
    QualityCode as CoreQualityCode,
)

if TYPE_CHECKING:
    from forge.core.clock import ClockEstimate
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
    source_timestamp_origin: str | None = None,
    clock: ClockEstimate | None = None,
) -> ContextualRecord:
    """Build a ContextualRecord from a tag definition, its current value,
    and the enrichment context resolved for that tag's path.

    The source time is never invented (one clock, FB-088). A tag read from a
    connection keeps the stamp its source sent; when the source sent none, only a
    connection declared ``source_timestamp_origin: forge`` lets Forge's own read
    time (the registry's ``timestamp``) stand in, marked ``source_clock=forge``
    with the tag's sampling bound as the uncertainty (``BaseTag.sampling_bound_ms``,
    one-clock record P-6: the scan interval, or a Query tag's poll interval; a tag
    whose ``max_sampling_uncertainty_ms`` is tighter is refused at load); any other
    connection raises
    :class:`~forge.core.clock.SourceStampMissingError`, which the adapter counts
    on its health. A Forge-born tag (memory, expression, derived, computed, event,
    reference: no connection) has Forge's clock as its source clock by nature.

    With ``clock``, the measured estimate of the clock the connection declared, the
    stamps are corrected to master time on entry (one-clock record P-3, P-10): the
    source stamp and the server stamp each lose the clock's offset, and the record
    keeps the stamp as sent, the offset, the uncertainty (half the probe round trip
    plus the tag's sampling bound) and the time quality. The hub never corrects again.

    Args:
        tag: Tag definition (path, data_type, engineering_units, etc.)
        tag_value: Current runtime value (value, quality, timestamps)
        enrichment: Operational context from EnrichmentPipeline.enrich()
        adapter_id: Adapter identity (default: forge-ot-module)
        adapter_version: Adapter version (default: 0.1.0)
        source_timestamp_origin: the origin the tag's connection declared
            (``device``, ``server``, ``edge`` or ``forge``), None when undeclared
        clock: the current estimate of that clock (``PlcConnectionManager.clock_estimate``),
            None when it has not been measured

    Returns:
        A fully-formed ContextualRecord ready for governance pipeline.
    """
    now = datetime.now(tz=UTC)
    connection = getattr(tag, "connection_name", None) or None

    # ── Source ─────────────────────────────────────────────
    source = RecordSource(
        adapter_id=adapter_id,
        system="forge-ot",
        tag_path=tag.path,
        connection_id=connection,
    )

    # ── Timestamps ────────────────────────────────────────
    # The tag's sampling bound (one-clock record P-6): a polled value occurred within one
    # scan or poll interval before its stamp. It is on every value, with the clock's own
    # bound once the stamp is corrected, and it is the bound on Forge's read time too.
    bound = tag.sampling_bound_ms / 1000.0
    stamp = resolve_source_stamp(
        tag_value.source_timestamp,
        origin=source_timestamp_origin if connection is not None else FORGE_CLOCK,
        read_at=tag_value.timestamp,
        poll_bound_seconds=bound,
        sampling_bound_seconds=bound,
        adapter_id=adapter_id,
        connection=connection,
        tag_path=tag.path,
        clock=clock,
    )
    # The server's stamp is corrected by the same clock when the correction applied: a
    # PLC-embedded server is the device's clock, and a relaying server stamps itself.
    server_time = tag_value.server_timestamp
    if server_time is not None and stamp.source_offset_seconds is not None and clock is not None:
        server_time = clock.correct(server_time)
    timestamp = RecordTimestamp(
        **stamp.timestamp_fields(),
        server_time=server_time,
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
        shift_id=enrichment.shift_id,
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
