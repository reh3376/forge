"""Tests for JWT + API key authentication."""

from __future__ import annotations

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from forge.gateway.auth import (
    _scopes_for_role,
    auth_config_from_env,
    configure_auth,
    get_current_user,
)
from forge.gateway.errors import install_error_handlers
from forge.gateway.models import AuthConfig, ForgeUser, Role


@pytest.fixture
def auth_app() -> FastAPI:
    """App with a protected route."""
    app = FastAPI()
    install_error_handlers(app)

    @app.get("/protected")
    async def protected(user: ForgeUser = Depends(get_current_user)):  # noqa: B008
        return {
            "user_id": user.user_id,
            "role": user.role,
            "source": user.source,
        }

    return app


@pytest.fixture
def _auth_disabled():
    """Configure auth as disabled (bypass mode)."""
    configure_auth(AuthConfig(enabled=False))
    yield
    configure_auth(AuthConfig(enabled=False))


@pytest.fixture
def _auth_enabled():
    """Configure auth with a known secret and API key."""
    configure_auth(
        AuthConfig(
            enabled=True,
            jwt_secret="test-secret",
            jwt_algorithm="HS256",
            api_keys={
                "test-key-admin": ForgeUser(
                    user_id="admin-user",
                    role=Role.ADMIN,
                    scopes=frozenset({"*"}),
                    source="api_key",
                ),
                "test-key-viewer": ForgeUser(
                    user_id="viewer-user",
                    role=Role.VIEWER,
                    scopes=_scopes_for_role(Role.VIEWER),
                    source="api_key",
                ),
            },
        )
    )
    yield
    configure_auth(AuthConfig(enabled=False))


class TestAuthDisabled:
    """When auth is disabled, all requests are anonymous admin."""

    @pytest.mark.usefixtures("_auth_disabled")
    def test_bypass_returns_anonymous_admin(self, auth_app: FastAPI):
        client = TestClient(auth_app)
        resp = client.get("/protected")
        assert resp.status_code == 200
        body = resp.json()
        assert body["user_id"] == "anonymous"
        assert body["role"] == "admin"
        assert body["source"] == "bypass"


class TestApiKeyAuth:
    """API key authentication via X-API-Key header."""

    @pytest.mark.usefixtures("_auth_enabled")
    def test_valid_admin_key(self, auth_app: FastAPI):
        client = TestClient(auth_app)
        resp = client.get(
            "/protected", headers={"X-API-Key": "test-key-admin"}
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["user_id"] == "admin-user"
        assert body["role"] == "admin"
        assert body["source"] == "api_key"

    @pytest.mark.usefixtures("_auth_enabled")
    def test_valid_viewer_key(self, auth_app: FastAPI):
        client = TestClient(auth_app)
        resp = client.get(
            "/protected", headers={"X-API-Key": "test-key-viewer"}
        )
        assert resp.status_code == 200
        assert resp.json()["role"] == "viewer"

    @pytest.mark.usefixtures("_auth_enabled")
    def test_invalid_key_returns_401(self, auth_app: FastAPI):
        client = TestClient(auth_app, raise_server_exceptions=False)
        resp = client.get(
            "/protected", headers={"X-API-Key": "bad-key"}
        )
        assert resp.status_code == 401

    @pytest.mark.usefixtures("_auth_enabled")
    def test_no_credentials_returns_401(self, auth_app: FastAPI):
        client = TestClient(auth_app, raise_server_exceptions=False)
        resp = client.get("/protected")
        assert resp.status_code == 401


class TestJwtAuth:
    """JWT bearer token authentication."""

    @pytest.mark.usefixtures("_auth_enabled")
    def test_valid_jwt(self, auth_app: FastAPI):
        import jwt

        token = jwt.encode(
            {"sub": "jwt-user", "role": "operator"},
            "test-secret",
            algorithm="HS256",
        )
        client = TestClient(auth_app)
        resp = client.get(
            "/protected",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["user_id"] == "jwt-user"
        assert body["role"] == "operator"
        assert body["source"] == "jwt"

    @pytest.mark.usefixtures("_auth_enabled")
    def test_invalid_jwt_returns_401(self, auth_app: FastAPI):
        client = TestClient(auth_app, raise_server_exceptions=False)
        resp = client.get(
            "/protected",
            headers={"Authorization": "Bearer invalid.token.here"},
        )
        assert resp.status_code == 401

    @pytest.mark.usefixtures("_auth_enabled")
    def test_jwt_with_custom_scopes(self, auth_app: FastAPI):
        import jwt

        token = jwt.encode(
            {"sub": "scoped-user", "role": "viewer", "scopes": "records:read,adapters:read"},
            "test-secret",
            algorithm="HS256",
        )
        client = TestClient(auth_app)
        resp = client.get(
            "/protected",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["user_id"] == "scoped-user"


class TestAuthConfigFromEnv:
    """Test environment-based auth configuration."""

    def test_defaults_to_disabled(self, monkeypatch):
        monkeypatch.delenv("FORGE_AUTH_ENABLED", raising=False)
        monkeypatch.delenv("FORGE_JWT_SECRET", raising=False)
        monkeypatch.delenv("FORGE_API_KEYS", raising=False)
        config = auth_config_from_env()
        assert config.enabled is False
        assert config.jwt_algorithm == "HS256"
        assert config.api_keys == {}

    def test_parses_api_keys(self, monkeypatch):
        monkeypatch.setenv("FORGE_AUTH_ENABLED", "true")
        monkeypatch.setenv("FORGE_JWT_SECRET", "secret")
        monkeypatch.setenv("FORGE_API_KEYS", "k1:user1:admin,k2:user2:viewer")
        config = auth_config_from_env()
        assert config.enabled is True
        assert "k1" in config.api_keys
        assert config.api_keys["k1"].role == Role.ADMIN
        assert "k2" in config.api_keys
        assert config.api_keys["k2"].role == Role.VIEWER


class TestScopesForRole:
    """Test default scope generation."""

    def test_viewer_scopes(self):
        scopes = _scopes_for_role(Role.VIEWER)
        assert "records:read" in scopes
        assert "records:write" not in scopes

    def test_operator_scopes(self):
        scopes = _scopes_for_role(Role.OPERATOR)
        assert "records:read" in scopes
        assert "records:write" in scopes
        assert "adapters:register" in scopes

    def test_admin_scopes(self):
        scopes = _scopes_for_role(Role.ADMIN)
        assert "*" in scopes
