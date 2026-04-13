"""Authentication middleware — JWT bearer tokens and API keys.

Supports two authentication schemes:
    1. Bearer JWT (HS256 by default, RS256 for production JWKS)
    2. X-API-Key header (static keys from FORGE_API_KEYS env var)

The FORGE_AUTH_ENABLED env var acts as a kill-switch for development.
When disabled, all requests are treated as admin.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import Depends, Request
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer

from forge.gateway.models import AuthConfig, ForgeUser, Role

logger = logging.getLogger(__name__)

_bearer_scheme = HTTPBearer(auto_error=False)
_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

# Module-level config — set by configure_auth() during app startup
_config = AuthConfig(enabled=False)

# Anonymous user when auth is disabled
_ANONYMOUS_ADMIN = ForgeUser(
    user_id="anonymous",
    role=Role.ADMIN,
    scopes=frozenset({"*"}),
    source="bypass",
)


def configure_auth(config: AuthConfig) -> None:
    """Set the authentication configuration (called at app startup)."""
    global _config
    _config = config


def auth_config_from_env() -> AuthConfig:
    """Build AuthConfig from environment variables."""
    enabled = os.getenv("FORGE_AUTH_ENABLED", "false").lower() == "true"
    jwt_secret = os.getenv("FORGE_JWT_SECRET", "")
    jwt_algorithm = os.getenv("FORGE_JWT_ALGORITHM", "HS256")

    # Parse API keys: "key1:user1:admin,key2:user2:viewer"
    api_keys: dict[str, ForgeUser] = {}
    raw_keys = os.getenv("FORGE_API_KEYS", "")
    if raw_keys:
        for entry in raw_keys.split(","):
            parts = entry.strip().split(":")
            if len(parts) >= 2:
                key = parts[0]
                user_id = parts[1]
                role = Role(parts[2]) if len(parts) > 2 else Role.VIEWER
                api_keys[key] = ForgeUser(
                    user_id=user_id,
                    role=role,
                    scopes=_scopes_for_role(role),
                    source="api_key",
                )

    return AuthConfig(
        enabled=enabled,
        jwt_secret=jwt_secret,
        jwt_algorithm=jwt_algorithm,
        api_keys=api_keys,
    )


def _scopes_for_role(role: Role) -> frozenset[str]:
    """Default scopes for each role."""
    base = frozenset({"records:read", "adapters:read", "health:read"})
    if role == Role.OPERATOR:
        return base | frozenset({
            "records:write", "adapters:write", "adapters:register",
        })
    if role == Role.ADMIN:
        return frozenset({"*"})
    return base


def _decode_jwt(token: str) -> dict[str, Any] | None:
    """Decode and validate a JWT token. Returns claims or None."""
    try:
        import jwt

        payload = jwt.decode(
            token,
            _config.jwt_secret,
            algorithms=[_config.jwt_algorithm],
        )
        return payload
    except Exception:
        logger.debug("JWT decode failed", exc_info=True)
        return None


async def get_current_user(
    request: Request,
    bearer: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),  # noqa: B008
    api_key: str | None = Depends(_api_key_header),
) -> ForgeUser:
    """FastAPI dependency that extracts the authenticated user.

    Returns ForgeUser or raises a 401 RFC 7807 response.
    """
    if not _config.enabled:
        return _ANONYMOUS_ADMIN

    # Try API key first (simpler, faster)
    if api_key and api_key in _config.api_keys:
        return _config.api_keys[api_key]

    # Try Bearer JWT
    if bearer and bearer.credentials:
        claims = _decode_jwt(bearer.credentials)
        if claims:
            user_id = claims.get("sub", "unknown")
            role = Role(claims.get("role", "viewer"))
            scope_str = claims.get("scopes", "")
            scopes = (
                frozenset(scope_str.split(","))
                if scope_str
                else _scopes_for_role(role)
            )
            return ForgeUser(
                user_id=user_id,
                role=role,
                scopes=scopes,
                source="jwt",
            )

    # No valid credentials
    raise _auth_error(request)


def _auth_error(request: Request) -> Exception:
    """Build a 401 exception with RFC 7807 body."""
    from starlette.exceptions import HTTPException

    raise HTTPException(
        status_code=401,
        detail="Missing or invalid authentication credentials.",
    )
