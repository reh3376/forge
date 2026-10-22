"""Tests for the Forge Hub API (forge.api.main).

Uses ASGI transport (no network) to test all REST endpoints.
gRPC is disabled in tests to avoid port binding.

Test categories:
1. Health endpoints (/healthz, /readyz, /v1/health)
2. Adapter registry (/v1/adapters)
3. Record ingestion (/v1/records)
4. Platform info (/v1/info)
5. Curation mount (/curation/healthz)
6. Context Engine and Schema Registry served by the hub (FB-001)
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from forge.api.main import _AdapterRegistry, create_app
from forge.core.models.adapter import (
    AdapterCapabilities,
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
            read=True,
            write=False,
            subscribe=True,
            backfill=True,
            discover=True,
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
        manifest = _make_manifest("forge-mes")
        await client.post("/v1/adapters/register", json=manifest)

        resp = await client.get("/v1/adapters")
        assert resp.status_code == 200
        adapters = resp.json()
        assert len(adapters) >= 1
        ids = [a["adapter_id"] for a in adapters]
        assert "forge-mes" in ids

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
        for aid in ["whk-wms", "forge-mes", "whk-cmms"]:
            await client.post("/v1/adapters/register", json=_make_manifest(aid))

        resp = await client.get("/v1/adapters")
        assert len(resp.json()) == 3


# ---------------------------------------------------------------------------
# Record Ingestion
# ---------------------------------------------------------------------------


class TestRecordIngestion:
    @pytest.mark.asyncio
    async def test_ingest_unknown_adapter_returns_404(self, client):
        resp = await client.post(
            "/v1/records",
            json={
                "adapter_id": "unknown",
                "records": [{"value": 42}],
            },
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_ingest_records(self, client):
        # Register adapter first
        await client.post("/v1/adapters/register", json=_make_manifest("whk-wms"))

        resp = await client.post(
            "/v1/records",
            json={
                "adapter_id": "whk-wms",
                "records": [
                    {"tag": "temp", "value": 72.5},
                    {"tag": "pressure", "value": 14.7},
                ],
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["accepted"] == 2
        assert data["rejected"] == 0

    @pytest.mark.asyncio
    async def test_ingest_empty_batch(self, client):
        await client.post("/v1/adapters/register", json=_make_manifest("whk-wms"))

        resp = await client.post(
            "/v1/records",
            json={
                "adapter_id": "whk-wms",
                "records": [],
            },
        )
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
        for aid in ["whk-wms", "forge-mes"]:
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
# Context Engine and Schema Registry served by the hub (FB-001)
# ---------------------------------------------------------------------------

FATS_SPECS = sorted(Path("src/forge/governance/fats/specs").glob("*.json"))


def _served(app) -> set[tuple[str, str]]:
    """Every (METHOD, path) the hub's OpenAPI document declares.

    The OpenAPI document is the hub's published contract and names paths the
    way FATS does (``{schema_id}``, no converter); reading it also keeps the
    test independent of how FastAPI nests included routers internally.
    """
    paths = app.openapi()["paths"]
    return {(method.upper(), path) for path, operations in paths.items() for method in operations}


class TestHubServedServices:
    @pytest.mark.asyncio
    async def test_schema_registry_answers_under_the_hub(self, client):
        body = {
            "schema_id": "forge://schemas/forge-mes/Lot",
            "name": "Lot",
            "schema_type": "adapter_output",
            "schema_json": {"type": "object", "properties": {"lot_id": {"type": "string"}}},
        }
        created = await client.post("/v1/schemas", json=body)
        assert created.status_code == 201, created.text
        assert created.json()["latest_version"] == 1

        listed = await client.get("/v1/schemas")
        assert listed.json()["total"] == 1
        fetched = await client.get("/v1/schemas/forge://schemas/forge-mes/Lot")
        assert fetched.status_code == 200 and fetched.json()["name"] == "Lot"
        versions = await client.get("/v1/schemas/forge://schemas/forge-mes/Lot/versions")
        assert [v["version"] for v in versions.json()] == [1]
        assert (await client.delete("/v1/schemas/forge://schemas/forge-mes/Lot")).status_code == 204
        assert (await client.get("/v1/schemas/forge://schemas/forge-mes/Lot")).status_code == 404

    @pytest.mark.asyncio
    async def test_context_engine_answers_under_the_hub(self, client):
        equipment = {
            "equipment_id": "COOK-01",
            "name": "Cooker 1",
            "site": "WHK-Main",
            "area": "Cooking",
            "equipment_type": "cooker",
        }
        assert (await client.post("/v1/context/equipment", json=equipment)).status_code == 201
        mode = {"equipment_id": "COOK-01", "mode": "PRODUCTION", "source": "test"}
        assert (await client.post("/v1/context/modes", json=mode)).status_code == 201
        bad_mode = {"equipment_id": "COOK-01", "mode": "production"}
        assert (await client.post("/v1/context/modes", json=bad_mode)).status_code == 422

        enriched = await client.post("/v1/context/enrich", json={"equipment_id": "COOK-01"})
        assert enriched.status_code == 200, enriched.text
        data = enriched.json()
        assert data["site"] == "WHK-Main" and data["area"] == "Cooking"
        assert data["operating_mode"] == "PRODUCTION"
        assert "site" in data["fields_added"]

        listed = await client.get("/v1/context/equipment", params={"site": "WHK-Main"})
        assert [e["equipment_id"] for e in listed.json()] == ["COOK-01"]
        assert (await client.delete("/v1/context/equipment/COOK-01")).status_code == 204
        assert (await client.get("/v1/context/equipment/COOK-01")).status_code == 404

    @pytest.mark.asyncio
    async def test_services_are_isolated_per_app(self, app, client):
        """Each hub app owns its stores: nothing leaks between two apps."""
        body = {
            "schema_id": "forge://schemas/test/A",
            "name": "A",
            "schema_type": "adapter_output",
            "schema_json": {"type": "object"},
        }
        assert (await client.post("/v1/schemas", json=body)).status_code == 201
        with patch.dict(os.environ, {"FORGE_GRPC_ENABLED": "false"}):
            other = create_app(storage_config=StorageConfig())
        async with AsyncClient(transport=ASGITransport(app=other), base_url="http://t") as ac:
            assert (await ac.get("/v1/schemas")).json()["total"] == 0

    @pytest.mark.asyncio
    async def test_the_factory_stores_back_the_served_registries(self):
        """With a storage factory, the hub persists through its stores (FB-005)."""
        from forge.context.equipment import InMemoryEquipmentStore
        from forge.context.models import Equipment
        from forge.ingest import IngestPipeline
        from forge.registry.models import SchemaMetadata, SchemaType
        from forge.registry.store import InMemorySchemaStore
        from forge.storage.adapter_registry import InMemoryAdapterRegistryStore
        from forge.storage.factory import StorageFactory

        schemas = InMemorySchemaStore()
        seeded = SchemaMetadata(
            schema_id="forge://schemas/seeded/A", name="A", schema_type=SchemaType.ADAPTER_OUTPUT
        )
        seeded.add_version({"type": "object"})
        await schemas.save(seeded)
        equipment = InMemoryEquipmentStore()
        await equipment.save(Equipment(equipment_id="SEED-01", name="Seeded", site="WHK"))

        factory = MagicMock(spec=StorageFactory)
        factory.schema_store.return_value = schemas
        factory.equipment_store.return_value = equipment
        with patch.dict(os.environ, {"FORGE_GRPC_ENABLED": "false"}):
            app = create_app(
                storage_config=StorageConfig(),
                storage_factory=factory,
                ingest_pipeline=IngestPipeline(),
                adapter_registry_store=InMemoryAdapterRegistryStore(),
            )
        factory.schema_store.assert_called_once_with()
        factory.equipment_store.assert_called_once_with()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
            listed = await ac.get("/v1/schemas")
            assert [s["schema_id"] for s in listed.json()["schemas"]] == [
                "forge://schemas/seeded/A"
            ]
            found = await ac.get("/v1/context/equipment/SEED-01")
            assert found.status_code == 200 and found.json()["site"] == "WHK"

    @pytest.mark.asyncio
    async def test_info_names_the_served_services(self, client):
        services = (await client.get("/v1/info")).json()["services"]
        assert services == {
            "context": "/v1/context",
            "schemas": "/v1/schemas",
            "curation": "/curation",
        }

    def test_every_fats_spec_names_a_route_the_hub_serves(self, app):
        """A FATS spec declares an endpoint that MUST exist; the hub serves all 28."""
        served = _served(app)
        missing = []
        for spec_file in FATS_SPECS:
            spec = json.loads(spec_file.read_text())
            if (spec["method"], spec["endpoint"]) not in served:
                missing.append(f"{spec['method']} {spec['endpoint']} ({spec_file.name})")
        assert missing == []
        assert len(FATS_SPECS) == 28

    def test_every_context_and_registry_route_has_a_fats_spec(self, app):
        declared = set()
        for spec_file in FATS_SPECS:
            spec = json.loads(spec_file.read_text())
            declared.add((spec["method"], spec["endpoint"]))
        hub_served = {
            (method, path)
            for method, path in _served(app)
            if path.startswith(("/v1/context", "/v1/schemas"))
        }
        assert hub_served <= declared, sorted(hub_served - declared)
        assert len(hub_served) == 21


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
                read=True,
                write=False,
                subscribe=False,
                backfill=False,
                discover=False,
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
                read=True,
                write=False,
                subscribe=False,
                backfill=False,
                discover=False,
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
