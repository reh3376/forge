"""Rate limiter — sliding window with Redis backend.

Uses a Redis sorted set per user/endpoint combination for a sliding
window counter. Falls back to an in-memory dict when Redis is
unavailable (degraded mode, not production-safe).

Returns 429 with Retry-After header when the limit is exceeded.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class RateLimitResult:
    """Result of a rate limit check."""

    allowed: bool
    remaining: int
    limit: int
    retry_after: float = 0.0  # seconds until next allowed request


@dataclass
class EndpointLimit:
    """Rate limit configuration for a specific endpoint."""

    requests_per_minute: int = 120
    burst: int = 10


class InMemoryRateLimiter:
    """In-memory sliding window rate limiter (development fallback).

    Not safe for multi-process deployments — use RedisRateLimiter
    in production.
    """

    def __init__(self) -> None:
        # key -> list of timestamps
        self._windows: dict[str, list[float]] = {}

    def check(
        self, key: str, limit: EndpointLimit | None = None
    ) -> RateLimitResult:
        """Check and record a request against the rate limit."""
        lim = limit or EndpointLimit()
        now = time.monotonic()
        window_start = now - 60.0  # 1-minute sliding window

        # Get or create window
        timestamps = self._windows.get(key, [])
        # Prune expired entries
        timestamps = [t for t in timestamps if t > window_start]

        if len(timestamps) >= lim.requests_per_minute:
            # Rate limited
            oldest = timestamps[0] if timestamps else now
            retry_after = 60.0 - (now - oldest)
            self._windows[key] = timestamps
            return RateLimitResult(
                allowed=False,
                remaining=0,
                limit=lim.requests_per_minute,
                retry_after=max(0.1, retry_after),
            )

        # Allow request
        timestamps.append(now)
        self._windows[key] = timestamps
        remaining = lim.requests_per_minute - len(timestamps)
        return RateLimitResult(
            allowed=True,
            remaining=remaining,
            limit=lim.requests_per_minute,
        )

    def reset(self, key: str) -> None:
        """Clear rate limit state for a key."""
        self._windows.pop(key, None)


class RedisRateLimiter:
    """Redis-backed sliding window rate limiter.

    Uses a sorted set per key with timestamps as scores.
    Each check is atomic via a Lua script.
    """

    _LUA_SCRIPT = """
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local window = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])
    local ttl = tonumber(ARGV[4])

    -- Remove expired entries
    redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)

    -- Count current entries
    local count = redis.call('ZCARD', key)

    if count >= limit then
        -- Get oldest entry for retry-after calculation
        local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
        local retry_after = 0
        if #oldest > 0 then
            retry_after = window - (now - tonumber(oldest[2]))
        end
        return {0, limit - count, retry_after * 1000}
    end

    -- Add this request
    redis.call('ZADD', key, now, now .. '-' .. math.random(1000000))
    redis.call('EXPIRE', key, ttl)

    return {1, limit - count - 1, 0}
    """

    def __init__(self, redis_url: str = "redis://localhost:6379") -> None:
        self._redis_url = redis_url
        self._client = None
        self._script_sha: str | None = None
        self._fallback = InMemoryRateLimiter()

    async def _get_client(self):
        """Lazy-initialize Redis client."""
        if self._client is None:
            try:
                from redis.asyncio import from_url

                self._client = from_url(self._redis_url)
                # Load the Lua script
                self._script_sha = await self._client.script_load(
                    self._LUA_SCRIPT
                )
            except Exception:
                logger.warning(
                    "Redis unavailable for rate limiting — using in-memory fallback"
                )
                self._client = None
        return self._client

    async def check(
        self, key: str, limit: EndpointLimit | None = None
    ) -> RateLimitResult:
        """Check and record a request against the rate limit."""
        lim = limit or EndpointLimit()
        client = await self._get_client()

        if client is None:
            return self._fallback.check(key, lim)

        try:
            now = time.time()
            result = await client.evalsha(
                self._script_sha,
                1,
                f"rl:{key}",
                str(now),
                "60",  # window = 60 seconds
                str(lim.requests_per_minute),
                "120",  # TTL = 2 * window
            )
            allowed = int(result[0]) == 1
            remaining = max(0, int(result[1]))
            retry_after_ms = max(0, int(result[2]))
            return RateLimitResult(
                allowed=allowed,
                remaining=remaining,
                limit=lim.requests_per_minute,
                retry_after=retry_after_ms / 1000.0,
            )
        except Exception:
            logger.warning("Redis rate limit check failed — allowing request")
            return RateLimitResult(
                allowed=True,
                remaining=lim.requests_per_minute,
                limit=lim.requests_per_minute,
            )

    async def close(self) -> None:
        """Close the Redis connection."""
        if self._client is not None:
            await self._client.aclose()
            self._client = None
