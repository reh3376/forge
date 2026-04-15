"""Tests for the Context Engine FastAPI service."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from forge.context.service import create_context_app


@pytest.fixture
def app():
    return create_context_app()


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


class TestEquipmentEndpoints:
    @pytest.mark.asyncio
    async def test_register_equipment(self, client):
        resp = await client.post("/v1/context/equipment", json={
            "equipment_id": "FERM-001",
            "name": "Fermenter 1",
            "site": "WHK-Main",
            "area": "Fermentation",
            "equipment_type": "fermenter",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["equipment_id"] == "FERM-001"
        assert data["site"] == "WHK-Main"

    @pytest.mark.asyncio
    async def test_get_equipment(self, client):
        await client.post("/v1/context/equipment", json={
            "equipment_id": "E1", "name": "E1", "site": "S",
        })
        resp = await client.get("/v1/context/equipment/E1")
        assert resp.status_code == 200
        assert resp.json()["equipment_id"] == "E1"

    @pytest.mark.asyncio
    async def test_get_equipment_not_found(self, client):
        resp = await client.get("/v1/context/equipment/missing")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_list_equipment_by_site(self, client):
        await client.post("/v1/context/equipment", json={
            "equipment_id": "E1", "name": "E1", "site": "S",
        })
        await client.post("/v1/context/equipment", json={
            "equipment_id": "E2", "name": "E2", "site": "S",
        })
        resp = await client.get("/v1/context/equipment", params={"site": "S"})
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    @pytest.mark.asyncio
    async def test_delete_equipment(self, client):
        await client.post("/v1/context/equipment", json={
            "equipment_id": "E1", "name": "E1", "site": "S",
        })
        resp = await client.delete("/v1/context/equipment/E1")
        assert resp.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_equipment_not_found(self, client):
        resp = await client.delete("/v1/context/equipment/missing")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_get_children(self, client):
        await client.post("/v1/context/equipment", json={
            "equipment_id": "AREA-1", "name": "Area 1", "site": "S",
        })
        await client.post("/v1/context/equipment", json={
            "equipment_id": "E1", "name": "E1", "site": "S", "parent_id": "AREA-1",
        })
        resp = await client.get("/v1/context/equipment/AREA-1/children")
        assert resp.status_code == 200
        assert len(resp.json()) == 1


class TestBatchEndpoints:
    @pytest.mark.asyncio
    async def test_register_batch(self, client):
        resp = await client.post("/v1/context/batches", json={
            "batch_id": "B001",
            "equipment_id": "FERM-001",
            "recipe_id": "R001",
            "lot_id": "L001",
        })
        assert resp.status_code == 201
        assert resp.json()["batch_id"] == "B001"

    @pytest.mark.asyncio
    async def test_list_active_batches(self, client):
        await client.post("/v1/context/batches", json={
            "batch_id": "B001", "equipment_id": "E1",
        })
        resp = await client.get("/v1/context/batches/active")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    @pytest.mark.asyncio
    async def test_complete_batch(self, client):
        await client.post("/v1/context/batches", json={
            "batch_id": "B001", "equipment_id": "E1",
        })
        resp = await client.post("/v1/context/batches/B001/complete")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "completed"
        assert data["ended_at"] is not None

    @pytest.mark.asyncio
    async def test_complete_batch_not_found(self, client):
        resp = await client.post("/v1/context/batches/missing/complete")
        assert resp.status_code == 404


class TestModeEndpoints:
    @pytest.mark.asyncio
    async def test_set_mode(self, client):
        resp = await client.post("/v1/context/modes", json={
            "equipment_id": "E1",
            "mode": "PRODUCTION",
            "source": "plc-signal",
        })
        assert resp.status_code == 201
        assert resp.json()["mode"] == "PRODUCTION"

    @pytest.mark.asyncio
    async def test_get_mode(self, client):
        await client.post("/v1/context/modes", json={
            "equipment_id": "E1", "mode": "CIP",
        })
        resp = await client.get("/v1/context/modes/E1")
        assert resp.status_code == 200
        assert resp.json()["mode"] == "CIP"

    @pytest.mark.asyncio
    async def test_get_mode_not_found(self, client):
        resp = await client.get("/v1/context/modes/missing")
        assert resp.status_code == 404


class TestShiftEndpoint:
    @pytest.mark.asyncio
    async def test_resolve_day_shift(self, client):
        resp = await client.post("/v1/context/shifts/resolve", json={
            "timestamp": "2026-04-15T14:00:00Z",
            "site": "WHK-Main",
        })
        assert resp.status_code == 200
        assert resp.json()["shift"] == "Day"

    @pytest.mark.asyncio
    async def test_resolve_night_shift(self, client):
        resp = await client.post("/v1/context/shifts/resolve", json={
            "timestamp": "2026-04-15T23:00:00Z",
            "site": "WHK-Main",
        })
        assert resp.status_code == 200
        assert resp.json()["shift"] == "Night"


class TestEnrichEndpoint:
    @pytest.mark.asyncio
    async def test_enrich_with_equipment(self, client):
        # Register equipment first
        await client.post("/v1/context/equipment", json={
            "equipment_id": "FERM-001",
            "name": "Fermenter 1",
            "site": "WHK-Main",
            "area": "Fermentation",
        })
        resp = await client.post("/v1/context/enrich", json={
            "equipment_id": "FERM-001",
            "source_time": "2026-04-15T14:00:00Z",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["site"] == "WHK-Main"
        assert data["area"] == "Fermentation"
        assert "site" in data["fields_added"]

    @pytest.mark.asyncio
    async def test_enrich_empty_context(self, client):
        resp = await client.post("/v1/context/enrich", json={})
        assert resp.status_code == 200
        assert resp.json()["fields_added"] == []

    @pytest.mark.asyncio
    async def test_enrich_with_batch_and_mode(self, client):
        await client.post("/v1/context/equipment", json={
            "equipment_id": "E1", "name": "E1", "site": "S",
        })
        await client.post("/v1/context/batches", json={
            "batch_id": "B1", "equipment_id": "E1",
            "lot_id": "L1", "recipe_id": "R1",
        })
        resp = await client.post("/v1/context/enrich", json={
            "equipment_id": "E1",
        })
        data = resp.json()
        assert data["batch_id"] == "B1"
        assert data["operating_mode"] == "PRODUCTION"
