"""Tests for the forge-curation FastAPI service."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient

from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge.curation.quality import QualityMonitor
from forge.curation.registry import DataProductRegistry
from forge.curation.service import create_curation_app


@pytest.fixture()
def app() -> object:
    """Create a test FastAPI app."""
    registry = DataProductRegistry()
    monitor = QualityMonitor()
    test_app = create_curation_app(registry=registry, quality_monitor=monitor)
    test_app.state.registry = registry
    test_app.state.monitor = monitor
    return test_app


@pytest.fixture()
async def client(app: object) -> AsyncClient:
    """Create an async test client."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def _make_record_dict() -> dict:
    """Create a serializable ContextualRecord dict."""
    return ContextualRecord(
        source=RecordSource(
            adapter_id="whk-wms",
            system="whk-wms-prod",
            tag_path="Area1/Fermenter3/Temperature",
        ),
        timestamp=RecordTimestamp(
            source_time=datetime.now(UTC),
            ingestion_time=datetime.now(UTC),
        ),
        value=RecordValue(
            raw=78.4,
            engineering_units="°F",
            quality=QualityCode.GOOD,
            data_type="float64",
        ),
        context=RecordContext(
            equipment_id="FERM-003",
            batch_id="B2026-0405-003",
            lot_id="L2026-0405",
        ),
        lineage=RecordLineage(
            schema_ref="forge://schemas/whk-wms/v0.1.0",
            adapter_id="whk-wms",
            adapter_version="0.1.0",
            transformation_chain=["collect"],
        ),
    ).model_dump(mode="json")


class TestHealthEndpoint:
    async def test_healthz(self, client: AsyncClient) -> None:
        response = await client.get("/healthz")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "forge-curation"


class TestProductEndpoints:
    async def test_create_product(self, client: AsyncClient) -> None:
        response = await client.post("/products", json={
            "name": "Production Context",
            "description": "Test product",
            "owner": "reh3376",
            "schema_ref": "forge://schemas/production-context/v1",
        })
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Production Context"
        assert data["status"] == "DRAFT"
        assert data["product_id"].startswith("dp-")

    async def test_list_products(self, client: AsyncClient) -> None:
        await client.post("/products", json={
            "name": "A", "description": "...", "owner": "o",
            "schema_ref": "x",
        })
        await client.post("/products", json={
            "name": "B", "description": "...", "owner": "o",
            "schema_ref": "x",
        })
        response = await client.get("/products")
        assert response.status_code == 200
        assert len(response.json()) == 2

    async def test_get_product(self, client: AsyncClient) -> None:
        create = await client.post("/products", json={
            "name": "Test", "description": "...", "owner": "o",
            "schema_ref": "x",
        })
        pid = create.json()["product_id"]
        response = await client.get(f"/products/{pid}")
        assert response.status_code == 200
        assert response.json()["name"] == "Test"

    async def test_get_product_not_found(self, client: AsyncClient) -> None:
        response = await client.get("/products/dp-nonexistent")
        assert response.status_code == 404

    async def test_publish_product(self, client: AsyncClient) -> None:
        create = await client.post("/products", json={
            "name": "Test", "description": "...", "owner": "o",
            "schema_ref": "x",
        })
        pid = create.json()["product_id"]
        response = await client.put(f"/products/{pid}/publish")
        assert response.status_code == 200
        assert response.json()["status"] == "PUBLISHED"

    async def test_publish_non_draft_fails(self, client: AsyncClient) -> None:
        create = await client.post("/products", json={
            "name": "Test", "description": "...", "owner": "o",
            "schema_ref": "x",
        })
        pid = create.json()["product_id"]
        await client.put(f"/products/{pid}/publish")
        response = await client.put(f"/products/{pid}/publish")
        assert response.status_code == 400


class TestCurateEndpoint:
    async def test_curate_records(self, client: AsyncClient) -> None:
        # Create product first
        create = await client.post("/products", json={
            "name": "Test", "description": "...", "owner": "o",
            "schema_ref": "x",
        })
        pid = create.json()["product_id"]

        # Curate records
        records = [_make_record_dict() for _ in range(5)]
        response = await client.post("/curate", json={
            "product_id": pid,
            "records": records,
        })
        assert response.status_code == 200
        data = response.json()
        assert data["input_count"] == 5
        assert data["output_count"] >= 1
        assert "normalize" in data["steps_applied"]

    async def test_curate_unknown_product(self, client: AsyncClient) -> None:
        response = await client.post("/curate", json={
            "product_id": "dp-nonexistent",
            "records": [_make_record_dict()],
        })
        assert response.status_code == 404


class TestLineageEndpoint:
    async def test_get_lineage(self, client: AsyncClient) -> None:
        # Create product and curate
        create = await client.post("/products", json={
            "name": "Test", "description": "...", "owner": "o",
            "schema_ref": "x",
        })
        pid = create.json()["product_id"]

        records = [_make_record_dict() for _ in range(3)]
        await client.post("/curate", json={
            "product_id": pid,
            "records": records,
        })

        response = await client.get(f"/products/{pid}/lineage")
        assert response.status_code == 200
        lineage = response.json()
        assert len(lineage) >= 1
        assert lineage[0]["product_id"] == pid
        assert len(lineage[0]["steps"]) >= 1


class TestQualityEndpoint:
    async def test_no_quality_report(self, client: AsyncClient) -> None:
        response = await client.get("/products/dp-test/quality")
        assert response.status_code == 404
