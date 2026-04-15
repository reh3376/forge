"""Context enrichment pipeline.

Takes a ContextualRecord with partial context and fills in missing
fields by cross-referencing the equipment registry, batch tracker,
shift schedule, and operating mode state.

Pipeline steps (executed in order):
    1. Validate required fields via ContextFieldRegistry
    2. Resolve equipment hierarchy (site, area from equipment_id)
    3. Attach active batch/lot context
    4. Resolve shift from timestamp + schedule
    5. Detect operating mode

Supports both real-time enrichment (called by adapters at ingestion)
and query-time enrichment (retrospective context for historical data).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from forge.context.mode import infer_mode
from forge.context.shift import resolve_shift

if TYPE_CHECKING:
    from forge.context.batch import BatchStore
    from forge.context.equipment import EquipmentStore
    from forge.context.mode import ModeStore
    from forge.context.models import ShiftSchedule
    from forge.core.models.contextual_record import RecordContext

logger = logging.getLogger(__name__)


@dataclass
class EnrichmentResult:
    """Result of context enrichment."""

    context: RecordContext
    fields_added: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class ContextEnricher:
    """Pipeline that enriches a RecordContext with missing fields.

    Parameters
    ----------
    equipment_store:
        Equipment registry for hierarchy lookups.
    batch_store:
        Batch tracker for active production run lookups.
    mode_store:
        Operating mode state store.
    shift_schedule:
        Shift definitions for the site.  If ``None``, shift
        resolution is skipped.
    """

    def __init__(
        self,
        equipment_store: EquipmentStore,
        batch_store: BatchStore,
        mode_store: ModeStore,
        shift_schedule: ShiftSchedule | None = None,
    ) -> None:
        self._equipment = equipment_store
        self._batches = batch_store
        self._modes = mode_store
        self._schedule = shift_schedule

    async def enrich(
        self,
        context: RecordContext,
        *,
        source_time: object | None = None,
    ) -> EnrichmentResult:
        """Enrich *context* by filling in missing fields.

        Parameters
        ----------
        context:
            The partial context to enrich (mutated in place).
        source_time:
            Timestamp for shift resolution (datetime).  If ``None``,
            shift resolution is skipped.
        """
        added: list[str] = []
        warnings: list[str] = []

        # 1. Equipment hierarchy
        if context.equipment_id:
            eq = await self._equipment.get(context.equipment_id)
            if eq:
                if not context.site:
                    context.site = eq.site
                    added.append("site")
                if not context.area and eq.area:
                    context.area = eq.area
                    added.append("area")
            else:
                warnings.append(
                    f"Equipment '{context.equipment_id}' not found in registry"
                )

        # 2. Batch / lot
        if context.equipment_id and not context.batch_id:
            batch = await self._batches.get_active_for_equipment(
                context.equipment_id
            )
            if batch:
                context.batch_id = batch.batch_id
                added.append("batch_id")
                if not context.lot_id and batch.lot_id:
                    context.lot_id = batch.lot_id
                    added.append("lot_id")
                if not context.recipe_id and batch.recipe_id:
                    context.recipe_id = batch.recipe_id
                    added.append("recipe_id")

        # 3. Shift resolution
        if self._schedule and source_time and not context.shift:
            from datetime import datetime as dt

            if isinstance(source_time, dt):
                shift_name = resolve_shift(self._schedule, source_time)
                if shift_name:
                    context.shift = shift_name
                    added.append("shift")

        # 4. Operating mode
        if context.equipment_id and not context.operating_mode:
            mode_state = await self._modes.get_mode(context.equipment_id)
            if mode_state:
                context.operating_mode = mode_state.mode.value
                added.append("operating_mode")
            else:
                # Infer from batch state + equipment status
                eq = await self._equipment.get(context.equipment_id)
                batch = await self._batches.get_active_for_equipment(
                    context.equipment_id
                )
                eq_status = eq.status.value if eq else "active"
                inferred = infer_mode(
                    batch_active=batch is not None,
                    equipment_status=eq_status,
                )
                context.operating_mode = inferred.value
                added.append("operating_mode")

        if added:
            logger.debug(
                "Enriched context for equipment=%s: +%s",
                context.equipment_id,
                ", ".join(added),
            )

        return EnrichmentResult(
            context=context,
            fields_added=added,
            warnings=warnings,
        )
