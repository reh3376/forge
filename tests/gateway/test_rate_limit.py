"""Tests for rate limiting."""

from __future__ import annotations

from forge.gateway.rate_limit import EndpointLimit, InMemoryRateLimiter


class TestInMemoryRateLimiter:
    """Tests for the in-memory sliding window rate limiter."""

    def test_allows_requests_under_limit(self):
        limiter = InMemoryRateLimiter()
        limit = EndpointLimit(requests_per_minute=10)
        result = limiter.check("user1:/api", limit)
        assert result.allowed is True
        assert result.remaining == 9
        assert result.limit == 10

    def test_blocks_when_limit_exceeded(self):
        limiter = InMemoryRateLimiter()
        limit = EndpointLimit(requests_per_minute=3)
        # Use up all 3 requests
        for _ in range(3):
            result = limiter.check("user2:/api", limit)
            assert result.allowed is True
        # 4th request should be blocked
        result = limiter.check("user2:/api", limit)
        assert result.allowed is False
        assert result.remaining == 0
        assert result.retry_after > 0

    def test_different_keys_are_independent(self):
        limiter = InMemoryRateLimiter()
        limit = EndpointLimit(requests_per_minute=1)
        r1 = limiter.check("user1:/api", limit)
        r2 = limiter.check("user2:/api", limit)
        assert r1.allowed is True
        assert r2.allowed is True

    def test_remaining_decrements(self):
        limiter = InMemoryRateLimiter()
        limit = EndpointLimit(requests_per_minute=5)
        for i in range(5):
            result = limiter.check("user3:/api", limit)
            assert result.remaining == 4 - i

    def test_reset_clears_state(self):
        limiter = InMemoryRateLimiter()
        limit = EndpointLimit(requests_per_minute=1)
        limiter.check("user4:/api", limit)
        result = limiter.check("user4:/api", limit)
        assert result.allowed is False

        limiter.reset("user4:/api")
        result = limiter.check("user4:/api", limit)
        assert result.allowed is True

    def test_default_limit(self):
        limiter = InMemoryRateLimiter()
        result = limiter.check("user5:/api")
        assert result.allowed is True
        assert result.limit == 120  # default rpm

    def test_unlimited_rate(self):
        limiter = InMemoryRateLimiter()
        limit = EndpointLimit(requests_per_minute=0)
        # With 0 rpm, all requests should be blocked immediately
        result = limiter.check("user6:/api", limit)
        assert result.allowed is False


class TestEndpointLimit:
    """Tests for EndpointLimit configuration."""

    def test_defaults(self):
        limit = EndpointLimit()
        assert limit.requests_per_minute == 120
        assert limit.burst == 10

    def test_custom_values(self):
        limit = EndpointLimit(requests_per_minute=60, burst=5)
        assert limit.requests_per_minute == 60
        assert limit.burst == 5
