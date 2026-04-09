"""Context enrichment — transforms raw tag values into decision-quality records.

The enrichment pipeline resolves:
    area        — from tag path hierarchy (e.g., WH/WHK01/Distillery01/* → "Distillery")
    equipment   — from tag path or CMMS lookup
    batch/recipe — from MES query (REST or cache)
    mode        — from PLC state tags or MES status
    quality     — from OPC-UA StatusCode mapping

These resolvers populate RecordContext fields on every ContextualRecord,
ensuring downstream consumers always have the operational context needed
for correct interpretation.
"""

from forge.modules.ot.context.resolvers import (
    AreaResolver,
    EquipmentResolver,
    BatchContextResolver,
    OperatingModeResolver,
    EnrichmentPipeline,
    EnrichmentContext,
)
from forge.modules.ot.context.record_builder import build_ot_record

__all__ = [
    "AreaResolver",
    "EquipmentResolver",
    "BatchContextResolver",
    "OperatingModeResolver",
    "EnrichmentPipeline",
    "EnrichmentContext",
    "build_ot_record",
]
