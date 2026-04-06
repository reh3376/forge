# ruff: noqa: E402, UP017, UP042
"""Shared fixtures for curation layer tests."""

from __future__ import annotations

import datetime as _dt_mod
import enum
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID, uuid4

# Python 3.10 compat patches (sandbox is 3.10, code targets 3.12+)
if not hasattr(_dt_mod, "UTC"):
    _dt_mod.UTC = _dt_mod.timezone.utc

if not hasattr(enum, "StrEnum"):
    class StrEnum(str, enum.Enum):
        pass
    enum.StrEnum = StrEnum

import pytest

# Ensure src/ is importable
_src = Path(__file__).resolve().parent.parent.parent / "src"
if str(_src) not in sys.path:
    sys.path.insert(0, str(_src))

from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge.curation.lineage import LineageTracker
from forge.curation.normalization import UnitRegistry, build_whk_unit_registry
from forge.curation.quality import QualityMonitor
from forge.curation.registry import DataProductRegistry


@pytest.fixture()
def sample_record() -> ContextualRecord:
    """A fully populated WMS ContextualRecord with °F temperature."""
    return ContextualRecord(
        record_id=UUID("01234567-89ab-cdef-0123-456789abcdef"),
        source=RecordSource(
            adapter_id="whk-wms",
            system="whk-wms-prod",
            tag_path="Area1/Fermenter3/Temperature",
        ),
        timestamp=RecordTimestamp(
            source_time=datetime(2026, 4, 5, 14, 30, 0, 123000, tzinfo=timezone.utc),
            server_time=datetime(2026, 4, 5, 14, 30, 0, 150000, tzinfo=timezone.utc),
            ingestion_time=datetime(2026, 4, 5, 14, 30, 0, 200000, tzinfo=timezone.utc),
        ),
        value=RecordValue(
            raw=78.4,
            engineering_units="°F",
            quality=QualityCode.GOOD,
            data_type="float64",
        ),
        context=RecordContext(
            equipment_id="FERM-003",
            area="Fermentation",
            site="Louisville",
            batch_id="B2026-0405-003",
            lot_id="L2026-0405",
            recipe_id="R-BOURBON-001",
            operating_mode="PRODUCTION",
            shift="B",
        ),
        lineage=RecordLineage(
            schema_ref="forge://schemas/whk-wms/v0.1.0",
            adapter_id="whk-wms",
            adapter_version="0.1.0",
            transformation_chain=["collect", "enrich_context"],
        ),
    )


@pytest.fixture()
def mes_record() -> ContextualRecord:
    """An MES ContextualRecord with °C temperature."""
    return ContextualRecord(
        record_id=UUID("abcdef01-2345-6789-abcd-ef0123456789"),
        source=RecordSource(
            adapter_id="whk-mes",
            system="whk-mes-prod",
            tag_path="Area1/Fermenter3/Temperature",
        ),
        timestamp=RecordTimestamp(
            source_time=datetime(2026, 4, 5, 14, 32, 0, tzinfo=timezone.utc),
            server_time=datetime(2026, 4, 5, 14, 32, 0, tzinfo=timezone.utc),
            ingestion_time=datetime(2026, 4, 5, 14, 32, 0, 500000, tzinfo=timezone.utc),
        ),
        value=RecordValue(
            raw=25.8,
            engineering_units="°C",
            quality=QualityCode.GOOD,
            data_type="float64",
        ),
        context=RecordContext(
            equipment_id="FERM-003",
            area="Fermentation",
            batch_id="B2026-0405-003",
            lot_id="L2026-0405",
            operating_mode="PRODUCTION",
        ),
        lineage=RecordLineage(
            schema_ref="forge://schemas/whk-mes/v0.1.0",
            adapter_id="whk-mes",
            adapter_version="0.1.0",
            transformation_chain=["collect"],
        ),
    )


@pytest.fixture()
def unit_registry() -> UnitRegistry:
    """Pre-loaded WHK unit registry."""
    return build_whk_unit_registry()


@pytest.fixture()
def product_registry() -> DataProductRegistry:
    """Empty data product registry."""
    return DataProductRegistry()


@pytest.fixture()
def lineage_tracker() -> LineageTracker:
    """Empty lineage tracker."""
    return LineageTracker()


@pytest.fixture()
def quality_monitor() -> QualityMonitor:
    """Empty quality monitor."""
    return QualityMonitor()


def make_record_batch(
    count: int = 10,
    equipment_id: str = "FERM-003",
    base_value: float = 78.4,
    unit: str = "°F",
    adapter: str = "whk-wms",
    base_time: datetime | None = None,
    interval: timedelta | None = None,
) -> list[ContextualRecord]:
    """Generate a batch of ContextualRecords for testing."""
    base = base_time or datetime(2026, 4, 5, 14, 0, 0, tzinfo=timezone.utc)
    step = interval or timedelta(minutes=1)

    records = []
    for i in range(count):
        records.append(ContextualRecord(
            record_id=uuid4(),
            source=RecordSource(
                adapter_id=adapter,
                system=f"{adapter}-prod",
                tag_path=f"Area1/{equipment_id}/Temperature",
            ),
            timestamp=RecordTimestamp(
                source_time=base + step * i,
                ingestion_time=base + step * i + timedelta(milliseconds=200),
            ),
            value=RecordValue(
                raw=base_value + (i * 0.1),
                engineering_units=unit,
                quality=QualityCode.GOOD,
                data_type="float64",
            ),
            context=RecordContext(
                equipment_id=equipment_id,
                batch_id="B2026-0405-003",
                lot_id="L2026-0405",
                operating_mode="PRODUCTION",
                shift="B",
            ),
            lineage=RecordLineage(
                schema_ref=f"forge://schemas/{adapter}/v0.1.0",
                adapter_id=adapter,
                adapter_version="0.1.0",
                transformation_chain=["collect"],
            ),
        ))
    return records
