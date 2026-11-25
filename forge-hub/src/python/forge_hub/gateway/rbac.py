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

import fnmatch
import functools

from fastapi import Depends, Request
from starlette.exceptions import HTTPException

from forge_hub.gateway.auth import get_current_user
from forge_hub.gateway.models import ForgeUser, Role  # noqa: TC001


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
            detail=(f"Insufficient role. Required: '{role}', your role: '{user.role}'."),
        )

    return _check


@functools.cache
def _hard_limited_patterns() -> tuple[str, ...]:
    """The scope patterns of every active hard limit, from the governed list."""
    from forge_core.fxts.shared.lists import active_hard_limits

    return tuple(
        str(pattern)
        for limit in active_hard_limits()
        if limit.get("kind") == "scope"
        for pattern in limit.get("scopes") or ()
    )


def is_hard_limited(scope: str) -> bool:
    """Whether a scope falls under a hard limit (`hard-limits.list.json`), such as
    ``ot:interlock:bypass`` or an approval scope."""
    return any(fnmatch.fnmatchcase(scope, pattern) for pattern in _hard_limited_patterns())


def _is_authorized(user: ForgeUser, scope: str) -> bool:
    """Check if a user is authorized for a given scope.

    A hard-limited scope is granted only by its exact name: no ``*`` and no ``domain:*``
    covers it (FB-291), so an administrator's wildcard never reaches an interlock bypass
    or an approval.
    """
    # Direct scope match
    if scope in user.scopes:
        return True
    if is_hard_limited(scope):
        return False
    # Wildcard scope grants everything else
    if "*" in user.scopes:
        return True
    # Check namespace wildcard: "adapters:*" covers "adapters:read"
    namespace = scope.split(":")[0] if ":" in scope else ""
    return bool(namespace and f"{namespace}:*" in user.scopes)
