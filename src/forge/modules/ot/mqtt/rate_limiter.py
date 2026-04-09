"""Rate limiter — per-tag publish throttle for MQTT.

With 1000+ tag subscriptions each updating at 100ms–1s scan rates,
the raw publish volume can overwhelm the MQTT broker.  The rate
limiter provides configurable per-tag throttling to keep publish
rates within broker capacity.

Design decisions:
    D1: Token bucket algorithm — each tag gets a bucket with a
        configurable rate (publishes/second) and burst capacity.
        Simple, memory-efficient, and well-understood.
    D2: Default rate is 10 publishes/second per tag with burst of 5.
        This means a tag changing every 100ms gets through at most
        10 updates/second.
    D3: When a publish is throttled, the LATEST value is saved.
        A background task periodically publishes these "pending" values
        to ensure nothing is permanently lost — just delayed.
    D4: Critical tags (alarms, health) can be marked exempt from
        rate limiting.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Token bucket
# ---------------------------------------------------------------------------


@dataclass
class TokenBucket:
    """Simple token bucket for rate limiting."""

    rate: float = 10.0       # tokens per second
    capacity: float = 5.0    # max burst
    tokens: float = 5.0      # current tokens
    last_refill: float = 0.0

    def try_consume(self, now: float = 0.0) -> bool:
        """Try to consume one token. Returns True if allowed."""
        now = now or time.monotonic()
        self._refill(now)
        if self.tokens >= 1.0:
            self.tokens -= 1.0
            return True
        return False

    def _refill(self, now: float) -> None:
        """Add tokens based on elapsed time."""
        if self.last_refill == 0.0:
            self.last_refill = now
            return
        elapsed = now - self.last_refill
        self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
        self.last_refill = now
        self.last_refill = now


# ---------------------------------------------------------------------------
# Rate limiter config
# ---------------------------------------------------------------------------


@dataclass
class RateLimiterConfig:
    """Configuration for the MQTT rate limiter."""

    enabled: bool = True
    default_rate: float = 10.0           # publishes/sec per tag
    default_burst: float = 5.0           # max burst per tag
    flush_interval: float = 1.0          # seconds between pending flushes
    exempt_patterns: list[str] = field(default_factory=list)  # tag patterns exempt from limiting


# ---------------------------------------------------------------------------
# Rate limiter
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PendingPublish:
    """A throttled publish waiting for its next slot."""

    tag_path: str
    payload: dict[str, Any]
    timestamp: float


class MqttRateLimiter:
    """Per-tag publish rate limiter with pending value flush.

    Usage::

        limiter = MqttRateLimiter()

        if limiter.should_publish("Distillery01/TIT/Out_PV"):
            await publisher.publish(topic, payload)
        else:
            limiter.set_pending("Distillery01/TIT/Out_PV", payload)
    """

    def __init__(self, config: RateLimiterConfig | None = None) -> None:
        self._config = config or RateLimiterConfig()
        self._buckets: dict[str, TokenBucket] = {}
        self._pending: dict[str, PendingPublish] = {}
        self._flush_task: asyncio.Task | None = None

        # Metrics
        self._allowed_count: int = 0
        self._throttled_count: int = 0
        self._flush_count: int = 0

    @property
    def is_enabled(self) -> bool:
        return self._config.enabled

    @property
    def bucket_count(self) -> int:
        return len(self._buckets)

    @property
    def pending_count(self) -> int:
        return len(self._pending)

    @property
    def allowed_count(self) -> int:
        return self._allowed_count

    @property
    def throttled_count(self) -> int:
        return self._throttled_count

    # ------------------------------------------------------------------
    # Rate check
    # ------------------------------------------------------------------

    def should_publish(self, tag_path: str) -> bool:
        """Check if a tag publish should proceed.

        Returns True if the publish is allowed, False if throttled.
        """
        if not self._config.enabled:
            self._allowed_count += 1
            return True

        # Check exemptions
        if self._is_exempt(tag_path):
            self._allowed_count += 1
            return True

        # Get or create bucket
        bucket = self._get_bucket(tag_path)
        if bucket.try_consume():
            self._allowed_count += 1
            return True

        self._throttled_count += 1
        return False

    def set_pending(self, tag_path: str, payload: dict[str, Any]) -> None:
        """Store the latest throttled value for later flush."""
        self._pending[tag_path] = PendingPublish(
            tag_path=tag_path,
            payload=payload,
            timestamp=time.time(),
        )

    def get_pending(self) -> dict[str, PendingPublish]:
        """Get all pending (throttled) publishes."""
        return dict(self._pending)

    def drain_pending(self) -> list[PendingPublish]:
        """Remove and return all pending publishes."""
        items = list(self._pending.values())
        self._pending.clear()
        self._flush_count += len(items)
        return items

    # ------------------------------------------------------------------
    # Background flush
    # ------------------------------------------------------------------

    async def start_flush_loop(
        self,
        publish_fn: Callable[[str, dict], Awaitable[bool]],
    ) -> None:
        """Start background task that publishes pending values.

        Args:
            publish_fn: async callable(tag_path, payload) → bool
        """
        self._flush_task = asyncio.create_task(
            self._flush_loop(publish_fn),
            name="forge-mqtt-rate-flush",
        )

    async def stop_flush_loop(self) -> None:
        if self._flush_task and not self._flush_task.done():
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass

    async def _flush_loop(
        self,
        publish_fn: Callable[[str, dict], Awaitable[bool]],
    ) -> None:
        """Periodically publish pending throttled values."""
        while True:
            try:
                await asyncio.sleep(self._config.flush_interval)
                pending = self.drain_pending()
                for item in pending:
                    try:
                        await publish_fn(item.tag_path, item.payload)
                    except Exception as exc:
                        logger.error("Flush publish failed for %s: %s", item.tag_path, exc)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Rate limiter flush error: %s", exc)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _get_bucket(self, tag_path: str) -> TokenBucket:
        """Get or create a token bucket for a tag."""
        if tag_path not in self._buckets:
            self._buckets[tag_path] = TokenBucket(
                rate=self._config.default_rate,
                capacity=self._config.default_burst,
                tokens=self._config.default_burst,
            )
        return self._buckets[tag_path]

    def _is_exempt(self, tag_path: str) -> bool:
        """Check if a tag is exempt from rate limiting."""
        import fnmatch
        for pattern in self._config.exempt_patterns:
            if fnmatch.fnmatch(tag_path, pattern):
                return True
        return False

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    def get_stats(self) -> dict[str, Any]:
        return {
            "enabled": self._config.enabled,
            "buckets": self.bucket_count,
            "pending": self.pending_count,
            "allowed": self._allowed_count,
            "throttled": self._throttled_count,
            "flushed": self._flush_count,
            "rate": self._config.default_rate,
            "burst": self._config.default_burst,
        }
