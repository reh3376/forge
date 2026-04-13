"""RBAC enforcer — role-based access control for API endpoints.

Role hierarchy: admin > operator > viewer.
Each endpoint declares a required scope (e.g., "adapters:write").
The enforcer checks the user's role and scopes against the requirement.

Usage in routes::

    @app.post("/v1/adapters/register")
    async def register(
        manifest: AdapterManifest,
        user: ForgeUser = Depends(require_scope("adapters:register")),
    ):
        ...
"""

from __future__ import annotations

from fastapi import Depends, Request
from starlette.exceptions import HTTPException

from forge.gateway.auth import get_current_user
from forge.gateway.models import ForgeUser, Role  # noqa: TC001


def require_scope(scope: str):
    """FastAPI dependency factory that enforces a required scope.

    Returns a dependency that extracts the user and checks authorization.
    Raises 403 if the user lacks the required scope.
    """

    async def _check(
        request: Request,
        user: ForgeUser = Depends(get_current_user),  # noqa: B008
    ) -> ForgeUser:
        if _is_authorized(user, scope):
            return user
        raise HTTPException(
            status_code=403,
            detail=(
                f"Insufficient permissions. "
                f"Required scope: '{scope}'. "
                f"Your role: '{user.role}', scopes: {sorted(user.scopes)}."
            ),
        )

    return _check


def require_role(role: Role):
    """FastAPI dependency factory that enforces a minimum role level."""

    async def _check(
        request: Request,
        user: ForgeUser = Depends(get_current_user),  # noqa: B008
    ) -> ForgeUser:
        if user.has_role_or_higher(role):
            return user
        raise HTTPException(
            status_code=403,
            detail=(
                f"Insufficient role. "
                f"Required: '{role}', your role: '{user.role}'."
            ),
        )

    return _check


def _is_authorized(user: ForgeUser, scope: str) -> bool:
    """Check if a user is authorized for a given scope."""
    # Wildcard scope grants everything
    if "*" in user.scopes:
        return True
    # Direct scope match
    if scope in user.scopes:
        return True
    # Check namespace wildcard: "adapters:*" covers "adapters:read"
    namespace = scope.split(":")[0] if ":" in scope else ""
    return bool(namespace and f"{namespace}:*" in user.scopes)
