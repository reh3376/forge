"""Tests for MqttRateLimiter — per-tag publish throttle."""

import time
import pytest

from forge.modules.ot.mqtt.rate_limiter import (
    MqttRateLimiter,
    RateLimiterConfig,
    TokenBucket,
    PendingPublish,
)


# ---------------------------------------------------------------------------
# Token bucket
# ---------------------------------------------------------------------------


class TestTokenBucket:

    def test_initial_tokens(self):
        bucket = TokenBucket(rate=10.0, capacity=5.0, tokens=5.0)
        assert bucket.tokens == 5.0

    def test_consume_reduces_tokens(self):
        bucket = TokenBucket(rate=10.0, capacity=5.0, tokens=5.0)
        now = time.monotonic()
        assert bucket.try_consume(now) is True
        assert bucket.tokens == 4.0

    def test_consume_empty_bucket_fails(self):
        bucket = TokenBucket(rate=10.0, capacity=5.0, tokens=0.0, last_refill=time.monotonic())
        assert bucket.try_consume(time.monotonic()) is False

    def test_refill_over_time(self):
        now = time.monotonic()
        bucket = TokenBucket(rate=10.0, capacity=5.0, tokens=0.0, last_refill=now)
        # 0.5 seconds later → 5 tokens refilled
        assert bucket.try_consume(now + 0.5) is True

    def test_refill_capped_at_capacity(self):
        now = time.monotonic()
        bucket = TokenBucket(rate=10.0, capacity=5.0, tokens=5.0, last_refill=now)
        # Even after 10 seconds, tokens stay at capacity
        bucket._refill(now + 10.0)
        assert bucket.tokens == 5.0

    def test_burst_then_empty(self):
        bucket = TokenBucket(rate=1.0, capacity=3.0, tokens=3.0)
        now = time.monotonic()
        assert bucket.try_consume(now) is True
        assert bucket.try_consume(now) is True
        assert bucket.try_consume(now) is True
        assert bucket.try_consume(now) is False  # Empty


# ---------------------------------------------------------------------------
# Rate limiter — disabled
# ---------------------------------------------------------------------------


class TestRateLimiterDisabled:

    def test_disabled_always_allows(self):
        limiter = MqttRateLimiter(RateLimiterConfig(enabled=False))
        for _ in range(100):
            assert limiter.should_publish("any/tag") is True
        assert limiter.allowed_count == 100
        assert limiter.throttled_count == 0


# ---------------------------------------------------------------------------
# Rate limiter — enabled
# ---------------------------------------------------------------------------


class TestRateLimiterEnabled:

    def test_allows_within_burst(self):
        limiter = MqttRateLimiter(RateLimiterConfig(
            default_rate=10.0, default_burst=3.0,
        ))
        results = [limiter.should_publish("tag/a") for _ in range(3)]
        assert all(results)

    def test_throttles_after_burst(self):
        limiter = MqttRateLimiter(RateLimiterConfig(
            default_rate=0.001, default_burst=2.0,  # Very slow refill
        ))
        limiter.should_publish("tag/a")
        limiter.should_publish("tag/a")
        assert limiter.should_publish("tag/a") is False
        assert limiter.throttled_count == 1

    def test_separate_buckets_per_tag(self):
        limiter = MqttRateLimiter(RateLimiterConfig(
            default_rate=10.0, default_burst=1.0,
        ))
        assert limiter.should_publish("tag/a") is True
        assert limiter.should_publish("tag/b") is True
        assert limiter.bucket_count == 2

    def test_exempt_patterns(self):
        limiter = MqttRateLimiter(RateLimiterConfig(
            default_rate=0.001, default_burst=1.0,  # Very slow refill
            exempt_patterns=["alarm/*", "health/*"],
        ))
        # Exhaust the normal bucket
        limiter.should_publish("tag/a")
        assert limiter.should_publish("tag/a") is False
        # Exempt tags always pass
        assert limiter.should_publish("alarm/HIGH_TEMP") is True
        assert limiter.should_publish("health/PLC_001") is True


# ---------------------------------------------------------------------------
# Pending values
# ---------------------------------------------------------------------------


class TestPendingValues:

    def test_set_and_get_pending(self):
        limiter = MqttRateLimiter()
        limiter.set_pending("tag/a", {"v": 78.4})
        pending = limiter.get_pending()
        assert "tag/a" in pending
        assert pending["tag/a"].payload == {"v": 78.4}

    def test_pending_overwrites_older(self):
        limiter = MqttRateLimiter()
        limiter.set_pending("tag/a", {"v": 1.0})
        limiter.set_pending("tag/a", {"v": 2.0})
        assert limiter.pending_count == 1
        assert limiter.get_pending()["tag/a"].payload == {"v": 2.0}

    def test_drain_pending(self):
        limiter = MqttRateLimiter()
        limiter.set_pending("tag/a", {"v": 1.0})
        limiter.set_pending("tag/b", {"v": 2.0})
        items = limiter.drain_pending()
        assert len(items) == 2
        assert limiter.pending_count == 0


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------


class TestRateLimiterStats:

    def test_stats(self):
        limiter = MqttRateLimiter(RateLimiterConfig(
            default_rate=0.001, default_burst=2.0,  # Very slow refill
        ))
        limiter.should_publish("tag/a")
        limiter.should_publish("tag/a")
        limiter.should_publish("tag/a")  # Throttled

        stats = limiter.get_stats()
        assert stats["enabled"] is True
        assert stats["allowed"] == 2
        assert stats["throttled"] == 1
        assert stats["rate"] == 0.001
