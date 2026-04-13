"""forge.gateway — API gateway with auth, RBAC, and rate limiting.

Wraps the core Forge Hub API (forge.api.main) with a middleware stack:
    1. RFC 7807 error handling (forge.gateway.errors)
    2. JWT + API key authentication (forge.gateway.auth)
    3. Role-based access control (forge.gateway.rbac)
    4. Redis-backed rate limiting (forge.gateway.rate_limit)
"""

from forge.gateway.auth import get_current_user
from forge.gateway.errors import install_error_handlers, problem_response
from forge.gateway.middleware import create_gateway_app
from forge.gateway.models import ForgeUser, Role
from forge.gateway.rate_limit import EndpointLimit, InMemoryRateLimiter
from forge.gateway.rbac import require_role, require_scope

__all__ = [
    "EndpointLimit",
    "ForgeUser",
    "InMemoryRateLimiter",
    "Role",
    "create_gateway_app",
    "get_current_user",
    "install_error_handlers",
    "problem_response",
    "require_role",
    "require_scope",
]
