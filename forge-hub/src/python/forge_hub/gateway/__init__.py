"""forge_hub.gateway — API gateway with auth, RBAC, and rate limiting.

Wraps the core Forge Hub API (forge_hub.api.main) with a middleware stack:
    1. RFC 7807 error handling (forge_hub.gateway.errors)
    2. JWT + API key authentication (forge_hub.gateway.auth)
    3. Role-based access control (forge_hub.gateway.rbac)
    4. Redis-backed rate limiting (forge_hub.gateway.rate_limit)
"""

from forge_hub.gateway.auth import get_current_user
from forge_hub.gateway.errors import install_error_handlers, problem_response
from forge_hub.gateway.middleware import create_gateway_app
from forge_hub.gateway.models import ForgeUser, Role
from forge_hub.gateway.rate_limit import EndpointLimit, InMemoryRateLimiter
from forge_hub.gateway.rbac import require_role, require_scope

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
