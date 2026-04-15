"""Tests for the context enrichment pipeline."""

from __future__ import annotations

from datetime import datetime

import pytest

from forge.context.batch import InMemoryBatchStore
from forge.context.enrichment import ContextEnricher
from forge.context.equipment import InMemoryEquipmentStore
from forge.context.mode import InMemoryModeStore
from forge.context.models import (
    Batch,
    Equipment,
    ModeState,
    OperatingMode,
)
from forge.context.shift import build_louisville_schedule
from forge.core.models.contextual_record import RecordContext


@pytest.fixture
def equipment_store():
    return InMemoryEquipmentStore()


@pytest.fixture
def batch_store():
    return InMemoryBatchStore()


@pytest.fixture
def mode_store():
    return InMemoryModeStore()


@pytest.fixture
def enricher(equipment_store, batch_store, mode_store):
    return ContextEnricher(
        equipment_store,
        batch_store,
        mode_store,
        shift_schedule=build_louisville_schedule(),
    )


class TestContextEnricher:
    @pytest.mark.asyncio
    async def test_enriches_site_from_equipment(self, enricher, equipment_store):
        await equipment_store.save(
            Equipment(
                equipment_id="FERM-001",
                name="Fermenter 1",
                site="WHK-Main",
                area="Fermentation",
            )
        )
        ctx = RecordContext(equipment_id="FERM-001")
        result = await enricher.enrich(ctx)
        assert result.context.site == "WHK-Main"
        assert result.context.area == "Fermentation"
        assert "site" in result.fields_added
        assert "area" in result.fields_added

    @pytest.mark.asyncio
    async def test_does_not_overwrite_existing_site(self, enricher, equipment_store):
        await equipment_store.save(
            Equipment(equipment_id="E1", name="E1", site="Other-Site")
        )
        ctx = RecordContext(equipment_id="E1", site="Original-Site")
        result = await enricher.enrich(ctx)
        assert result.context.site == "Original-Site"
        assert "site" not in result.fields_added

    @pytest.mark.asyncio
    async def test_warns_on_unknown_equipment(self, enricher):
        ctx = RecordContext(equipment_id="UNKNOWN-999")
        result = await enricher.enrich(ctx)
        assert len(result.warnings) == 1
        assert "not found" in result.warnings[0]

    @pytest.mark.asyncio
    async def test_enriches_batch(self, enricher, equipment_store, batch_store):
        await equipment_store.save(
            Equipment(equipment_id="E1", name="E1", site="S")
        )
        await batch_store.save(
            Batch(
                batch_id="B001",
                equipment_id="E1",
                lot_id="L001",
                recipe_id="R001",
            )
        )
        ctx = RecordContext(equipment_id="E1")
        result = await enricher.enrich(ctx)
        assert result.context.batch_id == "B001"
        assert result.context.lot_id == "L001"
        assert result.context.recipe_id == "R001"
        assert "batch_id" in result.fields_added

    @pytest.mark.asyncio
    async def test_does_not_overwrite_existing_batch(self, enricher, batch_store):
        await batch_store.save(Batch(batch_id="B002", equipment_id="E1"))
        ctx = RecordContext(equipment_id="E1", batch_id="B001")
        result = await enricher.enrich(ctx)
        assert result.context.batch_id == "B001"
        assert "batch_id" not in result.fields_added

    @pytest.mark.asyncio
    async def test_enriches_shift(self, enricher):
        from zoneinfo import ZoneInfo

        lou = ZoneInfo("America/Kentucky/Louisville")
        ctx = RecordContext(equipment_id=None)
        # 10:00 Louisville = Day shift
        ts = datetime(2026, 4, 15, 10, 0, 0, tzinfo=lou)
        result = await enricher.enrich(ctx, source_time=ts)
        assert result.context.shift == "Day"
        assert "shift" in result.fields_added

    @pytest.mark.asyncio
    async def test_does_not_overwrite_existing_shift(self, enricher):
        from zoneinfo import ZoneInfo

        lou = ZoneInfo("America/Kentucky/Louisville")
        ctx = RecordContext(shift="Custom")
        ts = datetime(2026, 4, 15, 10, 0, 0, tzinfo=lou)
        result = await enricher.enrich(ctx, source_time=ts)
        assert result.context.shift == "Custom"
        assert "shift" not in result.fields_added

    @pytest.mark.asyncio
    async def test_enriches_mode_from_store(self, enricher, mode_store):
        await mode_store.set_mode(
            ModeState(equipment_id="E1", mode=OperatingMode.CIP)
        )
        ctx = RecordContext(equipment_id="E1")
        result = await enricher.enrich(ctx)
        assert result.context.operating_mode == "CIP"
        assert "operating_mode" in result.fields_added

    @pytest.mark.asyncio
    async def test_infers_mode_from_batch(self, enricher, equipment_store, batch_store):
        await equipment_store.save(
            Equipment(equipment_id="E1", name="E1", site="S")
        )
        await batch_store.save(Batch(batch_id="B1", equipment_id="E1"))
        ctx = RecordContext(equipment_id="E1")
        result = await enricher.enrich(ctx)
        assert result.context.operating_mode == "PRODUCTION"

    @pytest.mark.asyncio
    async def test_infers_idle_no_batch(self, enricher, equipment_store):
        await equipment_store.save(
            Equipment(equipment_id="E1", name="E1", site="S")
        )
        ctx = RecordContext(equipment_id="E1")
        result = await enricher.enrich(ctx)
        assert result.context.operating_mode == "IDLE"

    @pytest.mark.asyncio
    async def test_no_equipment_id_minimal_enrichment(self, enricher):
        ctx = RecordContext()
        result = await enricher.enrich(ctx)
        assert result.fields_added == []

    @pytest.mark.asyncio
    async def test_full_enrichment(self, enricher, equipment_store, batch_store, mode_store):
        from zoneinfo import ZoneInfo

        lou = ZoneInfo("America/Kentucky/Louisville")
        await equipment_store.save(
            Equipment(equipment_id="E1", name="E1", site="S", area="A")
        )
        await batch_store.save(
            Batch(batch_id="B1", equipment_id="E1", lot_id="L1", recipe_id="R1")
        )
        await mode_store.set_mode(
            ModeState(equipment_id="E1", mode=OperatingMode.PRODUCTION)
        )
        ctx = RecordContext(equipment_id="E1")
        ts = datetime(2026, 4, 15, 10, 0, 0, tzinfo=lou)
        result = await enricher.enrich(ctx, source_time=ts)
        assert result.context.site == "S"
        assert result.context.area == "A"
        assert result.context.batch_id == "B1"
        assert result.context.lot_id == "L1"
        assert result.context.recipe_id == "R1"
        assert result.context.shift == "Day"
        assert result.context.operating_mode == "PRODUCTION"
        assert len(result.fields_added) == 7
