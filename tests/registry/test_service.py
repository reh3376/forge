"""Tests for the Schema Registry FastAPI service."""

from __future__ import annotations

import subprocess
import sys

import pytest
from httpx import ASGITransport, AsyncClient

from forge.registry.service import (
    AddVersionRequest,
    CompatibilityCheckRequest,
    RegisterSchemaRequest,
    SchemaVersionResponse,
    create_registry_app,
)


@pytest.fixture
def app():
    return create_registry_app()


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def _register_payload(**overrides):
    defaults = {
        "schema_id": "forge://schemas/test/Widget",
        "name": "Widget Schema",
        "schema_type": "adapter_output",
        "schema_json": {
            "type": "object",
            "properties": {
                "widget_id": {"type": "string"},
                "weight": {"type": "number"},
            },
            "required": ["widget_id"],
        },
    }
    defaults.update(overrides)
    return defaults


class TestRegisterSchema:
    @pytest.mark.asyncio
    async def test_register_success(self, client):
        resp = await client.post("/v1/schemas", json=_register_payload())
        assert resp.status_code == 201
        data = resp.json()
        assert data["schema_id"] == "forge://schemas/test/Widget"
        assert data["latest_version"] == 1
        assert len(data["versions"]) == 1

    @pytest.mark.asyncio
    async def test_register_duplicate_returns_409(self, client):
        await client.post("/v1/schemas", json=_register_payload())
        resp = await client.post("/v1/schemas", json=_register_payload())
        assert resp.status_code == 409


class TestListSchemas:
    @pytest.mark.asyncio
    async def test_list_empty(self, client):
        resp = await client.get("/v1/schemas")
        assert resp.status_code == 200
        data = resp.json()
        assert data["schemas"] == []
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_list_after_register(self, client):
        await client.post("/v1/schemas", json=_register_payload())
        resp = await client.get("/v1/schemas")
        data = resp.json()
        assert data["total"] == 1
        assert len(data["schemas"]) == 1

    @pytest.mark.asyncio
    async def test_list_with_filter(self, client):
        await client.post("/v1/schemas", json=_register_payload())
        await client.post(
            "/v1/schemas",
            json=_register_payload(
                schema_id="forge://schemas/test/API",
                name="API Schema",
                schema_type="api",
            ),
        )
        resp = await client.get("/v1/schemas", params={"schema_type": "api"})
        data = resp.json()
        assert len(data["schemas"]) == 1
        assert data["schemas"][0]["schema_type"] == "api"


class TestGetSchema:
    @pytest.mark.asyncio
    async def test_get_success(self, client):
        await client.post("/v1/schemas", json=_register_payload())
        resp = await client.get("/v1/schemas/forge://schemas/test/Widget")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Widget Schema"

    @pytest.mark.asyncio
    async def test_get_not_found(self, client):
        resp = await client.get("/v1/schemas/nonexistent")
        assert resp.status_code == 404


class TestDeleteSchema:
    @pytest.mark.asyncio
    async def test_delete_success(self, client):
        await client.post("/v1/schemas", json=_register_payload())
        resp = await client.delete("/v1/schemas/forge://schemas/test/Widget")
        assert resp.status_code == 204
        # Verify gone
        resp = await client.get("/v1/schemas/forge://schemas/test/Widget")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_not_found(self, client):
        resp = await client.delete("/v1/schemas/nonexistent")
        assert resp.status_code == 404


class TestAddVersion:
    @pytest.mark.asyncio
    async def test_add_version_success(self, client):
        await client.post("/v1/schemas", json=_register_payload())
        resp = await client.post(
            "/v1/schemas/forge://schemas/test/Widget/versions",
            json={
                "schema_json": {
                    "type": "object",
                    "properties": {
                        "widget_id": {"type": "string"},
                        "weight": {"type": "number"},
                        "color": {"type": "string"},
                    },
                    "required": ["widget_id"],
                },
                "description": "Added color field",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["version"] == 2
        assert data["previous_version"] == 1

    @pytest.mark.asyncio
    async def test_add_incompatible_version_returns_409(self, client):
        await client.post("/v1/schemas", json=_register_payload())
        resp = await client.post(
            "/v1/schemas/forge://schemas/test/Widget/versions",
            json={
                "schema_json": {
                    "type": "object",
                    "properties": {
                        "widget_id": {"type": "string"},
                        "weight": {"type": "number"},
                    },
                    "required": ["widget_id", "weight"],
                },
            },
        )
        assert resp.status_code == 409

    @pytest.mark.asyncio
    async def test_add_version_skip_compatibility(self, client):
        await client.post("/v1/schemas", json=_register_payload())
        resp = await client.post(
            "/v1/schemas/forge://schemas/test/Widget/versions",
            json={
                "schema_json": {"type": "object", "properties": {}},
                "check_compatibility": False,
            },
        )
        assert resp.status_code == 201

    @pytest.mark.asyncio
    async def test_add_version_not_found(self, client):
        resp = await client.post(
            "/v1/schemas/nonexistent/versions",
            json={"schema_json": {}},
        )
        assert resp.status_code == 404


class TestListVersions:
    @pytest.mark.asyncio
    async def test_list_versions(self, client):
        await client.post("/v1/schemas", json=_register_payload())
        await client.post(
            "/v1/schemas/forge://schemas/test/Widget/versions",
            json={
                "schema_json": {
                    "type": "object",
                    "properties": {
                        "widget_id": {"type": "string"},
                        "weight": {"type": "number"},
                        "color": {"type": "string"},
                    },
                    "required": ["widget_id"],
                },
            },
        )
        resp = await client.get("/v1/schemas/forge://schemas/test/Widget/versions")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2

    @pytest.mark.asyncio
    async def test_list_versions_not_found(self, client):
        resp = await client.get("/v1/schemas/nonexistent/versions")
        assert resp.status_code == 404


class TestGetVersion:
    @pytest.mark.asyncio
    async def test_get_specific_version(self, client):
        await client.post("/v1/schemas", json=_register_payload())
        resp = await client.get("/v1/schemas/forge://schemas/test/Widget/versions/1")
        assert resp.status_code == 200
        assert resp.json()["version"] == 1

    @pytest.mark.asyncio
    async def test_get_version_not_found(self, client):
        await client.post("/v1/schemas", json=_register_payload())
        resp = await client.get("/v1/schemas/forge://schemas/test/Widget/versions/99")
        assert resp.status_code == 404


class TestCompatibilityCheck:
    @pytest.mark.asyncio
    async def test_compatible(self, client):
        await client.post("/v1/schemas", json=_register_payload())
        resp = await client.post(
            "/v1/schemas/forge://schemas/test/Widget/compatibility",
            json={
                "schema_json": {
                    "type": "object",
                    "properties": {
                        "widget_id": {"type": "string"},
                        "weight": {"type": "number"},
                        "color": {"type": "string"},
                    },
                    "required": ["widget_id"],
                },
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["compatible"] is True

    @pytest.mark.asyncio
    async def test_incompatible(self, client):
        await client.post("/v1/schemas", json=_register_payload())
        resp = await client.post(
            "/v1/schemas/forge://schemas/test/Widget/compatibility",
            json={
                "schema_json": {
                    "type": "object",
                    "properties": {
                        "widget_id": {"type": "integer"},
                    },
                    "required": ["widget_id"],
                },
            },
        )
        data = resp.json()
        assert data["compatible"] is False
        assert len(data["errors"]) > 0

    @pytest.mark.asyncio
    async def test_override_mode(self, client):
        await client.post("/v1/schemas", json=_register_payload())
        resp = await client.post(
            "/v1/schemas/forge://schemas/test/Widget/compatibility",
            json={
                "schema_json": {"type": "object", "properties": {}},
                "mode": "NONE",
            },
        )
        data = resp.json()
        assert data["compatible"] is True
        assert data["mode"] == "NONE"

    @pytest.mark.asyncio
    async def test_compatibility_not_found(self, client):
        resp = await client.post(
            "/v1/schemas/nonexistent/compatibility",
            json={"schema_json": {}},
        )
        assert resp.status_code == 404


class TestVersionDiff:
    @pytest.mark.asyncio
    async def test_diff_between_versions(self, client):
        await client.post("/v1/schemas", json=_register_payload())
        await client.post(
            "/v1/schemas/forge://schemas/test/Widget/versions",
            json={
                "schema_json": {
                    "type": "object",
                    "properties": {
                        "widget_id": {"type": "string"},
                        "weight": {"type": "number"},
                        "color": {"type": "string"},
                    },
                    "required": ["widget_id"],
                },
            },
        )
        resp = await client.get("/v1/schemas/forge://schemas/test/Widget/diff/1/2")
        assert resp.status_code == 200
        data = resp.json()
        assert data["from_version"] == 1
        assert data["to_version"] == 2
        assert len(data["diffs"]) == 1
        assert data["diffs"][0]["field_path"] == "color"
        assert data["diffs"][0]["change_type"] == "added"

    @pytest.mark.asyncio
    async def test_diff_version_not_found(self, client):
        await client.post("/v1/schemas", json=_register_payload())
        resp = await client.get("/v1/schemas/forge://schemas/test/Widget/diff/1/99")
        assert resp.status_code == 404


class TestSchemaIdValidation:
    @pytest.mark.asyncio
    async def test_a_versioned_or_malformed_id_is_a_422(self, client):
        for bad in ("forge://schemas/test/Widget/v1", "forge://schemas/test/v0.1.0", "Widget"):
            resp = await client.post("/v1/schemas", json=_register_payload(schema_id=bad))
            assert resp.status_code == 422, bad
            assert "schema id" in resp.text or "schema reference" in resp.text


class TestSchemaJsonIsTheWireName:
    """``schema_json`` stays the wire name of ``schema_document`` (FB-095)."""

    MODELS = (
        RegisterSchemaRequest,
        SchemaVersionResponse,
        AddVersionRequest,
        CompatibilityCheckRequest,
    )

    def test_attribute_does_not_shadow_base_model(self):
        for model in self.MODELS:
            assert "schema_json" not in model.model_fields, model.__name__
            assert model.model_fields["schema_document"].alias == "schema_json", model.__name__
            assert callable(model.schema_json), model.__name__  # BaseModel's method, not a field

    def test_constructs_by_alias_and_by_name_and_dumps_the_alias(self):
        document = {"type": "object", "properties": {}}
        by_alias = AddVersionRequest.model_validate({"schema_json": document})
        by_name = AddVersionRequest(schema_document=document)
        assert by_alias.schema_document == by_name.schema_document == document
        assert by_name.model_dump() == {
            "schema_json": document,
            "description": "",
            "check_compatibility": True,
        }
        props = AddVersionRequest.model_json_schema()["properties"]
        assert "schema_json" in props and "schema_document" not in props

    @pytest.mark.asyncio
    async def test_the_routes_still_speak_schema_json(self, client):
        resp = await client.post("/v1/schemas", json=_register_payload())
        assert resp.status_code == 201
        version = resp.json()["versions"][0]
        assert version["schema_json"] == _register_payload()["schema_json"]
        assert "schema_document" not in version
        resp = await client.get("/v1/schemas/forge://schemas/test/Widget/versions/1")
        assert resp.json()["schema_json"]["required"] == ["widget_id"]
        resp = await client.post(
            "/v1/schemas/forge://schemas/test/Widget/compatibility",
            json={"schema_json": _register_payload()["schema_json"]},
        )
        assert resp.status_code == 200 and resp.json()["compatible"] is True

    def test_import_emits_no_warning(self):
        run = subprocess.run(
            [sys.executable, "-W", "error", "-c", "import forge.registry.service"],
            capture_output=True,
            text=True,
            check=False,
        )
        assert run.returncode == 0 and run.stderr == "", run.stderr
