"""Tests for RBAC enforcer."""

from __future__ import annotations

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from forge.gateway.auth import configure_auth
from forge.gateway.errors import install_error_handlers
from forge.gateway.models import AuthConfig, ForgeUser, Role
from forge.gateway.rbac import _is_authorized, require_role, require_scope


@pytest.fixture
def rbac_app() -> FastAPI:
    """App with role/scope-protected routes."""
    app = FastAPI()
    install_error_handlers(app)

    @app.get("/read-only")
    async def read_only(
        user: ForgeUser = Depends(require_scope("records:read")),  # noqa: B008
    ):
        return {"user": user.user_id, "action": "read"}

    @app.post("/write")
    async def write(
        user: ForgeUser = Depends(require_scope("records:write")),  # noqa: B008
    ):
        return {"user": user.user_id, "action": "write"}

    @app.post("/admin-only")
    async def admin_only(
        user: ForgeUser = Depends(require_role(Role.ADMIN)),  # noqa: B008
    ):
        return {"user": user.user_id, "action": "admin"}

    @app.get("/operator-up")
    async def operator_up(
        user: ForgeUser = Depends(require_role(Role.OPERATOR)),  # noqa: B008
    ):
        return {"user": user.user_id}

    return app


@pytest.fixture(autouse=True)
def _setup_auth():
    """Enable auth with test API keys for each role."""
    configure_auth(
        AuthConfig(
            enabled=True,
            jwt_secret="test-secret",
            api_keys={
                "admin-key": ForgeUser(
                    user_id="admin",
                    role=Role.ADMIN,
                    scopes=frozenset({"*"}),
                    source="api_key",
                ),
                "operator-key": ForgeUser(
                    user_id="operator",
                    role=Role.OPERATOR,
                    scopes=frozenset({
                        "records:read", "records:write",
                        "adapters:read", "adapters:write",
                    }),
                    source="api_key",
                ),
                "viewer-key": ForgeUser(
                    user_id="viewer",
                    role=Role.VIEWER,
                    scopes=frozenset({"records:read", "adapters:read"}),
                    source="api_key",
                ),
            },
        )
    )
    yield
    configure_auth(AuthConfig(enabled=False))


class TestRequireScope:
    """Tests for scope-based authorization."""

    def test_admin_can_read(self, rbac_app: FastAPI):
        client = TestClient(rbac_app)
        resp = client.get("/read-only", headers={"X-API-Key": "admin-key"})
        assert resp.status_code == 200
        assert resp.json()["action"] == "read"

    def test_viewer_can_read(self, rbac_app: FastAPI):
        client = TestClient(rbac_app)
        resp = client.get("/read-only", headers={"X-API-Key": "viewer-key"})
        assert resp.status_code == 200

    def test_viewer_cannot_write(self, rbac_app: FastAPI):
        client = TestClient(rbac_app, raise_server_exceptions=False)
        resp = client.post("/write", headers={"X-API-Key": "viewer-key"})
        assert resp.status_code == 403
        body = resp.json()
        assert "Insufficient permissions" in body["detail"]

    def test_operator_can_write(self, rbac_app: FastAPI):
        client = TestClient(rbac_app)
        resp = client.post("/write", headers={"X-API-Key": "operator-key"})
        assert resp.status_code == 200


class TestRequireRole:
    """Tests for role-based authorization."""

    def test_admin_passes_admin_check(self, rbac_app: FastAPI):
        client = TestClient(rbac_app)
        resp = client.post("/admin-only", headers={"X-API-Key": "admin-key"})
        assert resp.status_code == 200

    def test_operator_fails_admin_check(self, rbac_app: FastAPI):
        client = TestClient(rbac_app, raise_server_exceptions=False)
        resp = client.post(
            "/admin-only", headers={"X-API-Key": "operator-key"}
        )
        assert resp.status_code == 403

    def test_viewer_fails_admin_check(self, rbac_app: FastAPI):
        client = TestClient(rbac_app, raise_server_exceptions=False)
        resp = client.post(
            "/admin-only", headers={"X-API-Key": "viewer-key"}
        )
        assert resp.status_code == 403

    def test_admin_passes_operator_check(self, rbac_app: FastAPI):
        client = TestClient(rbac_app)
        resp = client.get("/operator-up", headers={"X-API-Key": "admin-key"})
        assert resp.status_code == 200

    def test_operator_passes_operator_check(self, rbac_app: FastAPI):
        client = TestClient(rbac_app)
        resp = client.get(
            "/operator-up", headers={"X-API-Key": "operator-key"}
        )
        assert resp.status_code == 200

    def test_viewer_fails_operator_check(self, rbac_app: FastAPI):
        client = TestClient(rbac_app, raise_server_exceptions=False)
        resp = client.get(
            "/operator-up", headers={"X-API-Key": "viewer-key"}
        )
        assert resp.status_code == 403


class TestIsAuthorized:
    """Unit tests for the _is_authorized helper."""

    def test_wildcard_grants_everything(self):
        user = ForgeUser(user_id="a", scopes=frozenset({"*"}))
        assert _is_authorized(user, "anything:here") is True

    def test_exact_scope_match(self):
        user = ForgeUser(user_id="a", scopes=frozenset({"records:read"}))
        assert _is_authorized(user, "records:read") is True
        assert _is_authorized(user, "records:write") is False

    def test_namespace_wildcard(self):
        user = ForgeUser(user_id="a", scopes=frozenset({"adapters:*"}))
        assert _is_authorized(user, "adapters:read") is True
        assert _is_authorized(user, "adapters:write") is True
        assert _is_authorized(user, "records:read") is False

    def test_no_scopes(self):
        user = ForgeUser(user_id="a", scopes=frozenset())
        assert _is_authorized(user, "records:read") is False
