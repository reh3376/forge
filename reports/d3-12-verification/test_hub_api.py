"""D3.12 — Hub API integration verification.

Proves the Hub API correctly handles the adapter lifecycle:
  register → health → ingest → list → query

Uses FastAPI's TestClient for synchronous HTTP testing against the
real application — no external services required.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from forge.api.main import create_app
from forge.core.models.adapter import (
    AdapterCapabilities,
    AdapterManifest,
    AdapterTier,
    DataContract,
)
from forge.storage.config import StorageConfig


# ── Fixtures ─────────────────────────────────────────────────────


@pytest.fixture()
def hub_app():
    """Create the Hub API app with default (non-connecting) config."""
    # gRPC disabled to avoid port conflicts in tests
    import os
    os.environ["FORGE_GRPC_ENABLED"] = "false"
    app = create_app()
    yield app
    os.environ.pop("FORGE_GRPC_ENABLED", None)


@pytest.fixture()
def client(hub_app) -> TestClient:
    return TestClient(hub_app, raise_server_exceptions=False)


@pytest.fixture()
def whk_wms_manifest() -> dict[str, Any]:
    """WHK WMS adapter manifest as a dict (matching API payload)."""
    return AdapterManifest(
        adapter_id="whk-wms",
        name="WHK WMS Adapter",
        version="0.1.0",
        protocol="graphql+amqp",
        tier=AdapterTier.MES_MOM,
        capabilities=AdapterCapabilities(
            read=True,
            subscribe=True,
            backfill=True,
            discover=True,
        ),
        data_contract=DataContract(
            schema_ref="forge://schemas/whk-wms/v0.1.0",
            context_fields=["equipment_id", "batch_id", "lot_id"],
        ),
    ).model_dump(mode="json")


# ═══════════════════════════════════════════════════════════════════
# 1. Liveness & Readiness
# ═══════════════════════════════════════════════════════════════════


class TestHealthEndpoints:
    def test_healthz_returns_alive(self, client: TestClient):
        resp = client.get("/healthz")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "alive"
        assert data["service"] == "forge-hub-api"

    def test_platform_info(self, client: TestClient):
        resp = client.get("/v1/info")
        assert resp.status_code == 200
        data = resp.json()
        assert data["platform"] == "forge"
        assert data["version"] == "0.1.0"


# ═══════════════════════════════════════════════════════════════════
# 2. Adapter Registration
# ═══════════════════════════════════════════════════════════════════


class TestAdapterRegistration:
    def test_register_adapter(
        self, client: TestClient, whk_wms_manifest: dict,
    ):
        resp = client.post("/v1/adapters/register", json=whk_wms_manifest)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "registered"
        assert data["adapter_id"] == "whk-wms"

    def test_list_after_register(
        self, client: TestClient, whk_wms_manifest: dict,
    ):
        client.post("/v1/adapters/register", json=whk_wms_manifest)
        resp = client.get("/v1/adapters")
        assert resp.status_code == 200
        adapters = resp.json()
        assert len(adapters) >= 1
        ids = [a["adapter_id"] for a in adapters]
        assert "whk-wms" in ids

    def test_adapter_health_after_register(
        self, client: TestClient, whk_wms_manifest: dict,
    ):
        client.post("/v1/adapters/register", json=whk_wms_manifest)
        resp = client.get("/v1/adapters/whk-wms/health")
        assert resp.status_code == 200
        health = resp.json()
        assert health["adapter_id"] == "whk-wms"
        assert health["state"] == "REGISTERED"

    def test_unknown_adapter_returns_404(self, client: TestClient):
        resp = client.get("/v1/adapters/nonexistent/health")
        assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════
# 3. Record Ingestion (REST)
# ═══════════════════════════════════════════════════════════════════


class TestRecordIngestion:
    def test_ingest_succeeds_for_registered_adapter(
        self,
        client: TestClient,
        whk_wms_manifest: dict,
        barrel_event: dict[str, Any],
    ):
        client.post("/v1/adapters/register", json=whk_wms_manifest)
        resp = client.post("/v1/records", json={
            "adapter_id": "whk-wms",
            "records": [barrel_event],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["accepted"] == 1
        assert data["rejected"] == 0

    def test_ingest_fails_for_unknown_adapter(
        self,
        client: TestClient,
        barrel_event: dict[str, Any],
    ):
        resp = client.post("/v1/records", json={
            "adapter_id": "unknown-adapter",
            "records": [barrel_event],
        })
        assert resp.status_code == 404

    def test_ingest_batch(
        self,
        client: TestClient,
        whk_wms_manifest: dict,
        barrel_events: list[dict[str, Any]],
    ):
        client.post("/v1/adapters/register", json=whk_wms_manifest)
        resp = client.post("/v1/records", json={
            "adapter_id": "whk-wms",
            "records": barrel_events,
        })
        assert resp.status_code == 200
        assert resp.json()["accepted"] == len(barrel_events)


# ═══════════════════════════════════════════════════════════════════
# 4. Multi-Adapter Registration
# ═══════════════════════════════════════════════════════════════════


class TestMultiAdapterFlow:
    def test_register_multiple_adapters(self, client: TestClient):
        """Register WMS and MES adapters, verify both appear."""
        wms = AdapterManifest(
            adapter_id="whk-wms",
            name="WHK WMS",
            version="0.1.0",
            protocol="graphql+amqp",
            tier=AdapterTier.MES_MOM,
            data_contract=DataContract(
                schema_ref="forge://schemas/whk-wms/v0.1.0",
            ),
        ).model_dump(mode="json")

        mes = AdapterManifest(
            adapter_id="whk-mes",
            name="WHK MES",
            version="0.1.0",
            protocol="graphql+amqp",
            tier=AdapterTier.MES_MOM,
            data_contract=DataContract(
                schema_ref="forge://schemas/whk-mes/v0.1.0",
            ),
        ).model_dump(mode="json")

        client.post("/v1/adapters/register", json=wms)
        client.post("/v1/adapters/register", json=mes)

        resp = client.get("/v1/adapters")
        ids = {a["adapter_id"] for a in resp.json()}
        assert "whk-wms" in ids
        assert "whk-mes" in ids

    def test_ingestion_isolated_by_adapter(self, client: TestClient):
        """Records ingested for one adapter shouldn't affect another."""
        for aid in ("adapter-a", "adapter-b"):
            client.post("/v1/adapters/register", json=AdapterManifest(
                adapter_id=aid,
                name=f"Test {aid}",
                version="0.1.0",
                protocol="rest",
                tier=AdapterTier.MES_MOM,
                data_contract=DataContract(
                    schema_ref=f"forge://schemas/{aid}/v0.1.0",
                ),
            ).model_dump(mode="json"))

        # Ingest for adapter-a
        resp = client.post("/v1/records", json={
            "adapter_id": "adapter-a",
            "records": [{"data": "test"}],
        })
        assert resp.json()["accepted"] == 1

        # adapter-b health should still be REGISTERED (unaffected)
        health = client.get("/v1/adapters/adapter-b/health").json()
        assert health["state"] == "REGISTERED"
