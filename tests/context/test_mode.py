"""Tests for operating mode store and inference."""

from __future__ import annotations

import pytest

from forge.context.mode import InMemoryModeStore, infer_mode
from forge.context.models import ModeState, OperatingMode


class TestInMemoryModeStore:
    @pytest.mark.asyncio
    async def test_set_and_get(self):
        store = InMemoryModeStore()
        state = ModeState(equipment_id="E1", mode=OperatingMode.PRODUCTION)
        await store.set_mode(state)
        result = await store.get_mode("E1")
        assert result is not None
        assert result.mode == OperatingMode.PRODUCTION

    @pytest.mark.asyncio
    async def test_get_not_found(self):
        store = InMemoryModeStore()
        assert await store.get_mode("missing") is None

    @pytest.mark.asyncio
    async def test_set_overwrites(self):
        store = InMemoryModeStore()
        await store.set_mode(ModeState(equipment_id="E1", mode=OperatingMode.IDLE))
        await store.set_mode(ModeState(equipment_id="E1", mode=OperatingMode.CIP))
        result = await store.get_mode("E1")
        assert result is not None
        assert result.mode == OperatingMode.CIP

    @pytest.mark.asyncio
    async def test_list_all(self):
        store = InMemoryModeStore()
        await store.set_mode(ModeState(equipment_id="E1", mode=OperatingMode.IDLE))
        await store.set_mode(ModeState(equipment_id="E2", mode=OperatingMode.PRODUCTION))
        all_modes = await store.list_all()
        assert len(all_modes) == 2

    @pytest.mark.asyncio
    async def test_get_returns_copy(self):
        store = InMemoryModeStore()
        await store.set_mode(ModeState(equipment_id="E1", mode=OperatingMode.IDLE))
        copy = await store.get_mode("E1")
        assert copy is not None
        copy.source = "MUTATED"
        original = await store.get_mode("E1")
        assert original is not None
        assert original.source == ""


class TestInferMode:
    def test_maintenance(self):
        result = infer_mode(batch_active=False, equipment_status="maintenance")
        assert result == OperatingMode.MAINTENANCE

    def test_production(self):
        assert infer_mode(batch_active=True) == OperatingMode.PRODUCTION

    def test_idle(self):
        assert infer_mode(batch_active=False) == OperatingMode.IDLE

    def test_maintenance_overrides_batch(self):
        result = infer_mode(batch_active=True, equipment_status="maintenance")
        assert result == OperatingMode.MAINTENANCE
