"""forge.context — F21 Context Engine Service.

Public API:
    Equipment, Batch, ShiftSchedule, ModeState — domain models
    EquipmentStore, BatchStore, ModeStore — storage ABCs
    ContextEnricher — enrichment pipeline
    create_context_app — FastAPI application factory
"""

from forge.context.batch import BatchStore, InMemoryBatchStore
from forge.context.enrichment import ContextEnricher, EnrichmentResult
from forge.context.equipment import (
    EquipmentStore,
    InMemoryEquipmentStore,
    PostgresEquipmentStore,
)
from forge.context.mode import InMemoryModeStore, ModeStore
from forge.context.models import (
    Batch,
    BatchStatus,
    Equipment,
    EquipmentStatus,
    ModeState,
    OperatingMode,
    ShiftDefinition,
    ShiftSchedule,
)
from forge.context.service import create_context_app
from forge.context.shift import build_louisville_schedule, resolve_shift

__all__ = [
    "Batch",
    "BatchStatus",
    "BatchStore",
    "ContextEnricher",
    "EnrichmentResult",
    "Equipment",
    "EquipmentStatus",
    "EquipmentStore",
    "InMemoryBatchStore",
    "InMemoryEquipmentStore",
    "InMemoryModeStore",
    "ModeState",
    "ModeStore",
    "OperatingMode",
    "PostgresEquipmentStore",
    "ShiftDefinition",
    "ShiftSchedule",
    "build_louisville_schedule",
    "create_context_app",
    "resolve_shift",
]
