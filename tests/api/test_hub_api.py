"""Tests for the Forge Hub API (forge.api.main).

Uses ASGI transport (no network) to test all REST endpoints.
gRPC is disabled in tests to avoid port binding.

Test categories:
1. Health endpoints (/healthz, /readyz, /v1/health)
2. Adapter registry (/v1/adapters)
3. Record ingestion (/v1/records)
4. Platform info (/v1/info)
5. Curation mount (/curation/healthz)
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from forge.api.health import ComponentHealth, ComponentStatus, HealthOrchestrator
from forge.api.main import _AdapterRegistry, create_app
from forge.core.models.adapter import (
    AdapterCapabilities,
    AdapterHealth,
    AdapterManifest,
    AdapterState,
    DataContract,
)
from forge.storage.config import StorageConfig


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def app():
    """Create a test Hub API app with gRPC disabled."""
    with patch.dict(os.environ, {"FORGE_GRPC_ENABLED": "false"}):
        return create_app(storage_config=StorageConfig())


@pytest.fixture()
async def client(app):
    """Async test client using ASGI transport."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def _make_manifest(adapter_id: str = "whk-wms") -> dict:
    """Build a minimal adapter manifest for testing."""
    return AdapterManifest(
        adapter_id=adapter_id,
        name=f"Test {adapter_id}",
        version="1.0.0",
        type="INGESTION",
        tier="MES_MOM",
        protocol="grpc",
        capabilities=AdapterCapabilities(
            read=True, write=False, subscribe=True,
            backfill=True, discover=True,
        ),
        data_contract=DataContract(
            schema_ref=f"forge://schemas/{adapter_id}/v1",
            output_format="contextual_record",
            context_fields=["event_type", "equipment_id"],
        ),
        connection_params=[],
        auth_methods=["bearer_token"],
        health_check_interval_ms=15000,
    ).model_dump(mode="json")


# ---------------------------------------------------------------------------
# Health Endpoints
# ---------------------------------------------------------------------------

class TestHealthEndpoints:
    @pytest.mark.asyncio
    async def test_healthz_returns_alive(self, client):
        resp = await client.get("/healthz")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "alive"
        assert data["service"] == "forge-hub-api"

    @pytest.mark.asyncio
    async def test_v1_health_returns_components(self, client):
        """v1/health probes infrastructure — in tests, all will be unreachable."""
        resp = await client.get("/v1/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] in ("healthy", "degraded", "unhealthy")
        assert "components" in data
        assert "uptime_seconds" in data

    @pytest.mark.asyncio
    async def test_readyz_returns_status(self, client):
        resp = await client.get("/readyz")
        # In tests without infra, this could be 200 or 503
        assert resp.status_code in (200, 503)


# ---------------------------------------------------------------------------
# Adapter Registry
# ---------------------------------------------------------------------------

class TestAdapterRegistry:
    @pytest.mark.asyncio
    async def test_list_empty(self, client):
        resp = await client.get("/v1/adapters")
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_register_adapter(self, client):
        manifest = _make_manifest("whk-wms")
        resp = await client.post("/v1/adapters/register", json=manifest)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "registered"
        assert data["adapter_id"] == "whk-wms"

    @pytest.mark.asyncio
    async def test_list_after_register(self, client):
        manifest = _make_manifest("whk-mes")
        await client.post("/v1/adapters/register", json=manifest)

        resp = await client.get("/v1/adapters")
        assert resp.status_code == 200
        adapters = resp.json()
        assert len(adapters) >= 1
        ids = [a["adapter_id"] for a in adapters]
        assert "whk-mes" in ids

    @pytest.mark.asyncio
    async def test_adapter_health_not_found(self, client):
        resp = await client.get("/v1/adapters/nonexistent/health")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_adapter_health_after_register(self, client):
        manifest = _make_manifest("whk-erpi")
        await client.post("/v1/adapters/register", json=manifest)

        resp = await client.get("/v1/adapters/whk-erpi/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["adapter_id"] == "whk-erpi"
        assert data["state"] == "REGISTERED"

    @pytest.mark.asyncio
    async def test_register_multiple_adapters(self, client):
        for aid in ["whk-wms", "whk-mes", "whk-cmms"]:
            await client.post("/v1/adapters/register", json=_make_manifest(aid))

        resp = await client.get("/v1/adapters")
        assert len(resp.json()) == 3


# ---------------------------------------------------------------------------
# Record Ingestion
# ---------------------------------------------------------------------------

class TestRecordIngestion:
    @pytest.mark.asyncio
    async def test_ingest_unknown_adapter_returns_404(self, client):
        resp = await client.post("/v1/records", json={
            "adapter_id": "unknown",
            "records": [{"value": 42}],
        })
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_ingest_records(self, client):
        # Register adapter first
        await client.post("/v1/adapters/register", json=_make_manifest("whk-wms"))

        resp = await client.post("/v1/records", json={
            "adapter_id": "whk-wms",
            "records": [
                {"tag": "temp", "value": 72.5},
                {"tag": "pressure", "value": 14.7},
            ],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["accepted"] == 2
        assert data["rejected"] == 0

    @pytest.mark.asyncio
    async def test_ingest_empty_batch(self, client):
        await client.post("/v1/adapters/register", json=_make_manifest("whk-wms"))

        resp = await client.post("/v1/records", json={
            "adapter_id": "whk-wms",
            "records": [],
        })
        assert resp.status_code == 200
        assert resp.json()["accepted"] == 0


# ---------------------------------------------------------------------------
# Platform Info
# ---------------------------------------------------------------------------

class TestPlatformInfo:
    @pytest.mark.asyncio
    async def test_info_endpoint(self, client):
        resp = await client.get("/v1/info")
        assert resp.status_code == 200
        data = resp.json()
        assert data["platform"] == "forge"
        assert data["version"] == "0.1.0"
        assert "grpc_port" in data
        assert "grpc_enabled" in data

    @pytest.mark.asyncio
    async def test_info_reflects_adapter_count(self, client):
        # Register 2 adapters
        for aid in ["whk-wms", "whk-mes"]:
            await client.post("/v1/adapters/register", json=_make_manifest(aid))

        resp = await client.get("/v1/info")
        assert resp.json()["adapters_registered"] == 2


# ---------------------------------------------------------------------------
# Curation Mount
# ---------------------------------------------------------------------------

class TestCurationMount:
    @pytest.mark.asyncio
    async def test_curation_healthz(self, client):
        """Verify the curation sub-app is mounted."""
        resp = await client.get("/curation/healthz")
        assert resp.status_code == 200
        data = resp.json()
        assert data["service"] == "forge-curation"


# ---------------------------------------------------------------------------
# _AdapterRegistry (unit tests)
# ---------------------------------------------------------------------------

class TestAdapterRegistryUnit:
    def test_register_and_list(self):
        reg = _AdapterRegistry()
        manifest = AdapterManifest(
            adapter_id="test-1",
            name="Test One",
            version="1.0.0",
            type="INGESTION",
            tier="MES_MOM",
            protocol="grpc",
            capabilities=AdapterCapabilities(
                read=True, write=False, subscribe=False,
                backfill=False, discover=False,
            ),
            data_contract=DataContract(
                schema_ref="forge://schemas/test/v1",
                output_format="contextual_record",
                context_fields=["event_type"],
            ),
            connection_params=[],
            auth_methods=[],
            health_check_interval_ms=10000,
        )
        reg.register(manifest)
        items = reg.list_all()
        assert len(items) == 1
        assert items[0].adapter_id == "test-1"
        assert items[0].state == "REGISTERED"

    def test_get_health_unknown(self):
        reg = _AdapterRegistry()
        assert reg.get_health("nonexistent") is None

    def test_get_manifest_unknown(self):
        reg = _AdapterRegistry()
        assert reg.get_manifest("nonexistent") is None

    def test_register_sets_health(self):
        reg = _AdapterRegistry()
        manifest = AdapterManifest(
            adapter_id="test-2",
            name="Test Two",
            version="1.0.0",
            type="INGESTION",
            tier="MES_MOM",
            protocol="rest",
            capabilities=AdapterCapabilities(
                read=True, write=False, subscribe=False,
                backfill=False, discover=False,
            ),
            data_contract=DataContract(
                schema_ref="forge://schemas/test/v1",
                output_format="contextual_record",
                context_fields=[],
            ),
            connection_params=[],
            auth_methods=[],
            health_check_interval_ms=10000,
        )
        reg.register(manifest)
        health = reg.get_health("test-2")
        assert health is not None
        assert health.adapter_id == "test-2"
        assert health.state == AdapterState.REGISTERED
