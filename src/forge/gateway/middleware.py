"""Gateway middleware — wraps the Forge Hub API with auth, RBAC, and rate limiting.

Usage::

    from forge.gateway.middleware import create_gateway_app
    app = create_gateway_app()
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any

from fastapi import FastAPI, Request  # noqa: TC002
from fastapi.responses import JSONResponse  # noqa: TC002

from forge.api.main import create_app
from forge.gateway.auth import auth_config_from_env, configure_auth
from forge.gateway.errors import install_error_handlers, problem_response
from forge.gateway.rate_limit import (
    EndpointLimit,
    InMemoryRateLimiter,
    RedisRateLimiter,
)
from forge.storage.config import StorageConfig  # noqa: TC001

logger = logging.getLogger(__name__)

# Default rate limits per endpoint pattern
_ENDPOINT_LIMITS: dict[str, EndpointLimit] = {
    "/healthz": EndpointLimit(requests_per_minute=0),  # unlimited
    "/readyz": EndpointLimit(requests_per_minute=0),
    "/v1/health": EndpointLimit(requests_per_minute=60, burst=10),
    "/v1/adapters": EndpointLimit(requests_per_minute=120, burst=20),
    "/v1/records": EndpointLimit(requests_per_minute=300, burst=50),
    "/v1/info": EndpointLimit(requests_per_minute=60, burst=10),
}


def create_gateway_app(
    storage_config: StorageConfig | None = None,
) -> FastAPI:
    """Create the Forge Hub API with gateway middleware stack.

    Layers (outermost to innermost):
        1. RFC 7807 error handling
        2. Request tracing (trace_id header)
        3. Rate limiting
        4. Authentication (via FastAPI Depends)
        5. RBAC (via FastAPI Depends)
        6. Core API routes
    """
    # Build the core API
    app = create_app(storage_config=storage_config)

    # Configure authentication
    auth_config = auth_config_from_env()
    configure_auth(auth_config)

    # Install RFC 7807 error handlers
    install_error_handlers(app)

    # Initialize rate limiter
    use_redis = os.getenv("FORGE_RATE_LIMIT_REDIS", "false").lower() == "true"
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    rate_limiter: InMemoryRateLimiter | RedisRateLimiter = (
        RedisRateLimiter(redis_url=redis_url) if use_redis else InMemoryRateLimiter()
    )

    @app.middleware("http")
    async def rate_limit_middleware(
        request: Request, call_next: Any
    ) -> JSONResponse:
        """Apply per-endpoint rate limiting."""
        path = request.url.path
        limit = _get_limit_for_path(path)

        if limit and limit.requests_per_minute > 0:
            # Use client IP as key for unauthenticated rate limiting
            client_ip = request.client.host if request.client else "unknown"
            key = f"{client_ip}:{path}"

            if isinstance(rate_limiter, RedisRateLimiter):
                result = await rate_limiter.check(key, limit)
            else:
                result = rate_limiter.check(key, limit)

            if not result.allowed:
                return problem_response(
                    status=429,
                    title="Too Many Requests",
                    detail=(
                        f"Rate limit exceeded: {result.limit} requests/minute. "
                        f"Retry after {result.retry_after:.1f}s."
                    ),
                    instance=path,
                    forge_code="RATE_LIMIT_EXCEEDED",
                    extra={
                        "retry_after": round(result.retry_after, 1),
                        "limit": result.limit,
                    },
                )

        response = await call_next(request)

        # Add rate limit headers
        if limit and limit.requests_per_minute > 0:
            response.headers["X-RateLimit-Limit"] = str(limit.requests_per_minute)

        return response

    @app.middleware("http")
    async def trace_middleware(
        request: Request, call_next: Any
    ) -> JSONResponse:
        """Add trace_id and timing headers."""
        import uuid

        trace_id = request.headers.get("X-Trace-ID", uuid.uuid4().hex)
        start = time.monotonic()

        response = await call_next(request)

        elapsed_ms = (time.monotonic() - start) * 1000
        response.headers["X-Trace-ID"] = trace_id
        response.headers["X-Response-Time-Ms"] = f"{elapsed_ms:.1f}"

        return response

    logger.info(
        "Gateway middleware installed (auth=%s, rate_limit=%s)",
        "enabled" if auth_config.enabled else "disabled",
        "redis" if use_redis else "in-memory",
    )

    return app


def _get_limit_for_path(path: str) -> EndpointLimit | None:
    """Look up the rate limit for a request path."""
    # Exact match first
    if path in _ENDPOINT_LIMITS:
        return _ENDPOINT_LIMITS[path]
    # Prefix match (e.g., /v1/adapters/xxx matches /v1/adapters)
    for pattern, limit in _ENDPOINT_LIMITS.items():
        if path.startswith(pattern):
            return limit
    # Default limit for unmatched paths
    return EndpointLimit(requests_per_minute=120, burst=10)
