"""Tests for i3X Browse API — CESMII-shaped endpoints over the tag engine.

Uses FastAPI TestClient for synchronous HTTP testing against the
i3X router without a running server.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from forge.modules.ot.i3x.router import create_i3x_router
from forge.modules.ot.opcua_client.types import DataType, QualityCode
from forge.modules.ot.tag_engine.builtin_templates import create_builtin_registry
from forge.modules.ot.tag_engine.models import (
    MemoryTag,
    StandardTag,
)
from forge.modules.ot.tag_engine.registry import TagRegistry


@pytest.fixture
def registry():
    """Pre-populated tag registry for API tests."""
    reg = TagRegistry()
    return reg


@pytest.fixture
def template_registry():
    return create_builtin_registry()


@pytest.fixture
def app(registry, template_registry):
    """FastAPI app with i3X router mounted."""
    app = FastAPI()
    router = create_i3x_router(
        registry=registry,
        template_registry=template_registry,
        acquisition_engine=None,
    )
    app.include_router(router)
    return app


@pytest.fixture
def client(app):
    return TestClient(app)


def _populate_registry(registry: TagRegistry):
    """Add test tags synchronously by running async in a new loop."""
    import asyncio

    async def _add():
        tags = [
            StandardTag(
                path="WH/WHK01/Distillery01/TIT_2010/Out_PV",
                description="Temperature sensor",
                data_type=DataType.FLOAT,
                opcua_node_id="ns=2;s=Distillery01.TIT_2010.Out_PV",
                connection_name="WHK01",
                engineering_units="°F",
                area="Distillery",
            ),
            StandardTag(
                path="WH/WHK01/Distillery01/LIT_6050B/Out_PV",
                description="Level sensor",
                data_type=DataType.FLOAT,
                opcua_node_id="ns=2;s=Distillery01.LIT_6050B.Out_PV",
                connection_name="WHK01",
                engineering_units="%",
            ),
            MemoryTag(
                path="WH/WHK01/System/Mode",
                description="System mode",
                default_value="PRODUCTION",
            ),
        ]
        for tag in tags:
            await registry.register(tag)

        # Set some values
        await registry.update_value(
            "WH/WHK01/Distillery01/TIT_2010/Out_PV", 72.5, QualityCode.GOOD
        )
        await registry.update_value(
            "WH/WHK01/Distillery01/LIT_6050B/Out_PV", 45.2, QualityCode.GOOD
        )

    asyncio.run(_add())


# ---------------------------------------------------------------------------
# Namespace tests
# ---------------------------------------------------------------------------


class TestNamespacesEndpoint:

    def test_list_namespaces_empty(self, client):
        resp = client.get("/api/v1/ot/namespaces")
        assert resp.status_code == 200
        # No tags registered → no namespaces inferred
        data = resp.json()
        assert isinstance(data, list)

    def test_list_namespaces_from_tags(self, client, registry):
        _populate_registry(registry)
        resp = client.get("/api/v1/ot/namespaces")
        assert resp.status_code == 200
        data = resp.json()
        # Should infer "WH" from root browse
        assert len(data) >= 1


# ---------------------------------------------------------------------------
# Object Types tests
# ---------------------------------------------------------------------------


class TestObjectTypesEndpoint:

    def test_list_object_types(self, client):
        resp = client.get("/api/v1/ot/objecttypes")
        assert resp.status_code == 200
        data = resp.json()
        names = [ot["id"] for ot in data]
        assert "AnalogInstrument" in names
        assert "DiscreteValve" in names
        assert "MotorStarter" in names
        assert "VFD_Drive" in names

    def test_object_type_has_required_params(self, client):
        resp = client.get("/api/v1/ot/objecttypes")
        data = resp.json()
        analog = next(ot for ot in data if ot["id"] == "AnalogInstrument")
        assert "connection" in analog["parameters"]
        assert "base_path" in analog["parameters"]
        assert "tag_id" in analog["parameters"]

    def test_vfd_extends_motor_starter(self, client):
        resp = client.get("/api/v1/ot/objecttypes")
        data = resp.json()
        vfd = next(ot for ot in data if ot["id"] == "VFD_Drive")
        assert vfd["extends"] == "MotorStarter"


# ---------------------------------------------------------------------------
# Browse tests
# ---------------------------------------------------------------------------


class TestBrowseEndpoint:

    def test_browse_root(self, client, registry):
        _populate_registry(registry)
        resp = client.get("/api/v1/ot/objects?path=")
        assert resp.status_code == 200
        data = resp.json()
        assert data["path"] == ""
        assert len(data["children"]) >= 1

        # Root should contain "WH" folder
        names = [c["name"] for c in data["children"]]
        assert "WH" in names

    def test_browse_folder(self, client, registry):
        _populate_registry(registry)
        resp = client.get("/api/v1/ot/objects?path=WH")
        assert resp.status_code == 200
        data = resp.json()
        names = [c["name"] for c in data["children"]]
        assert "WHK01" in names

    def test_browse_with_namespace_filter(self, client, registry):
        _populate_registry(registry)
        resp = client.get("/api/v1/ot/objects?namespace=WH&path=")
        assert resp.status_code == 200
        data = resp.json()
        # Should browse WH as root
        assert data["namespace"] == "WH"

    def test_browse_leaf_has_tag_type(self, client, registry):
        _populate_registry(registry)
        resp = client.get(
            "/api/v1/ot/objects?path=WH/WHK01/Distillery01/TIT_2010"
        )
        assert resp.status_code == 200
        data = resp.json()
        children = data["children"]
        # Should find Out_PV as a leaf
        pv = next((c for c in children if c["name"] == "Out_PV"), None)
        assert pv is not None
        assert pv["is_folder"] is False
        assert pv["tag_type"] is not None

    def test_browse_empty_returns_total_count(self, client, registry):
        _populate_registry(registry)
        resp = client.get("/api/v1/ot/objects?path=")
        data = resp.json()
        assert data["total_count"] == len(data["children"])


# ---------------------------------------------------------------------------
# Value tests
# ---------------------------------------------------------------------------


class TestValueEndpoint:

    def test_get_value(self, client, registry):
        _populate_registry(registry)
        resp = client.get(
            "/api/v1/ot/objects/value?path=WH/WHK01/Distillery01/TIT_2010/Out_PV"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["value"] == 72.5
        assert data["quality"] == "GOOD"
        assert data["engineering_units"] == "°F"

    def test_get_value_not_found(self, client):
        resp = client.get("/api/v1/ot/objects/value?path=nonexistent/tag")
        assert resp.status_code == 404

    def test_get_bulk_values(self, client, registry):
        _populate_registry(registry)
        paths = "WH/WHK01/Distillery01/TIT_2010/Out_PV,WH/WHK01/Distillery01/LIT_6050B/Out_PV"
        resp = client.get(f"/api/v1/ot/objects/values?paths={paths}")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]["value"] == 72.5
        assert data[1]["value"] == 45.2


# ---------------------------------------------------------------------------
# Subscription & Discovery stubs
# ---------------------------------------------------------------------------


class TestStubEndpoints:

    def test_subscriptions_returns_501(self, client):
        resp = client.get("/api/v1/ot/subscriptions")
        assert resp.status_code == 501

    def test_discover_returns_501(self, client):
        resp = client.post("/api/v1/ot/discover?namespace=WHK01")
        assert resp.status_code == 501


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------


class TestStatsEndpoint:

    def test_stats(self, client, registry):
        _populate_registry(registry)
        resp = client.get("/api/v1/ot/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "tag_registry" in data
        assert "templates" in data
        assert data["templates"]["count"] == 4
