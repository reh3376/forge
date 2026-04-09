"""MqttSubscriber — subscribes to command topics from external systems.

The subscriber listens to topics published by MES, recipe management,
and other systems.  Incoming messages are routed to registered handlers
based on topic matching.

Design decisions:
    D1: Topic subscriptions use the standard MQTT wildcard syntax
        (``+`` for single level, ``#`` for multi-level).
    D2: Handlers are async callables registered per topic pattern.
        Multiple handlers can match a single incoming message.
    D3: Message dispatch is non-blocking — handler exceptions are
        caught and logged, never propagated.
    D4: The subscriber manages its own subscription state.  On
        reconnect, it re-subscribes to all registered topics.
"""

from __future__ import annotations

import asyncio
import fnmatch
import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Subscription registration
# ---------------------------------------------------------------------------


@dataclass
class Subscription:
    """A topic subscription with its handler."""

    topic_filter: str          # MQTT topic filter (may include +/#)
    handler: Callable[..., Awaitable | Any]
    name: str = ""
    qos: int = 0
    active: bool = True

    def matches(self, topic: str) -> bool:
        """Check if a topic matches this subscription's filter."""
        return _mqtt_topic_matches(self.topic_filter, topic)


# ---------------------------------------------------------------------------
# Incoming message
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class IncomingMessage:
    """An MQTT message received by the subscriber."""

    topic: str
    payload: bytes
    qos: int = 0
    retain: bool = False
    timestamp: float = 0.0

    def payload_str(self) -> str:
        """Decode payload as UTF-8 string."""
        return self.payload.decode("utf-8", errors="replace")

    def payload_json(self) -> Any:
        """Decode payload as JSON."""
        return json.loads(self.payload)


# ---------------------------------------------------------------------------
# MqttSubscriber
# ---------------------------------------------------------------------------


class MqttSubscriber:
    """Manages MQTT topic subscriptions and message dispatch.

    Usage::

        subscriber = MqttSubscriber()

        @subscriber.on("whk/+/mes/recipe/next")
        async def handle_recipe(msg: IncomingMessage):
            recipe = msg.payload_json()
            print(f"Next recipe: {recipe}")

        # Messages are dispatched via process_message()
        await subscriber.process_message(msg)
    """

    def __init__(self) -> None:
        self._subscriptions: list[Subscription] = []
        self._message_count: int = 0
        self._dispatch_count: int = 0
        self._error_count: int = 0

    @property
    def subscription_count(self) -> int:
        return len(self._subscriptions)

    @property
    def message_count(self) -> int:
        return self._message_count

    # ------------------------------------------------------------------
    # Subscription management
    # ------------------------------------------------------------------

    def subscribe(
        self,
        topic_filter: str,
        handler: Callable,
        name: str = "",
        qos: int = 0,
    ) -> Subscription:
        """Register a handler for a topic pattern."""
        sub = Subscription(
            topic_filter=topic_filter,
            handler=handler,
            name=name or handler.__name__,
            qos=qos,
        )
        self._subscriptions.append(sub)
        logger.info("Subscribed to %s (handler=%s)", topic_filter, sub.name)
        return sub

    def on(
        self,
        topic_filter: str,
        qos: int = 0,
    ) -> Callable:
        """Decorator to register a subscription handler.

        Usage::

            @subscriber.on("whk/+/mes/recipe/next")
            async def handle_recipe(msg):
                ...
        """
        def decorator(func: Callable) -> Callable:
            self.subscribe(topic_filter, func, name=func.__name__, qos=qos)
            return func
        return decorator

    def unsubscribe(self, topic_filter: str) -> int:
        """Remove all subscriptions matching a topic filter. Returns count removed."""
        before = len(self._subscriptions)
        self._subscriptions = [
            s for s in self._subscriptions if s.topic_filter != topic_filter
        ]
        removed = before - len(self._subscriptions)
        if removed:
            logger.info("Unsubscribed from %s (%d handlers)", topic_filter, removed)
        return removed

    def get_topic_filters(self) -> list[str]:
        """Get all unique topic filters for broker subscription."""
        return list({s.topic_filter for s in self._subscriptions if s.active})

    # ------------------------------------------------------------------
    # Message dispatch
    # ------------------------------------------------------------------

    async def process_message(self, msg: IncomingMessage) -> int:
        """Dispatch an incoming message to matching handlers.

        Returns the number of handlers invoked.
        """
        self._message_count += 1
        invoked = 0

        for sub in self._subscriptions:
            if not sub.active:
                continue
            if not sub.matches(msg.topic):
                continue

            try:
                if asyncio.iscoroutinefunction(sub.handler):
                    await sub.handler(msg)
                else:
                    sub.handler(msg)
                invoked += 1
                self._dispatch_count += 1
            except Exception as exc:
                self._error_count += 1
                logger.error(
                    "Subscriber handler %s failed for topic %s: %s",
                    sub.name, msg.topic, exc,
                )

        return invoked

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    def get_stats(self) -> dict[str, Any]:
        return {
            "subscriptions": self.subscription_count,
            "messages_received": self._message_count,
            "dispatches": self._dispatch_count,
            "errors": self._error_count,
            "topic_filters": self.get_topic_filters(),
        }


# ---------------------------------------------------------------------------
# MQTT topic matching (follows MQTT 3.1.1 spec)
# ---------------------------------------------------------------------------


def _mqtt_topic_matches(topic_filter: str, topic: str) -> bool:
    """Match a topic against an MQTT topic filter.

    MQTT wildcards:
        ``+`` — matches exactly one topic level
        ``#`` — matches any number of levels (must be last character)

    Examples:
        ``whk/+/ot/tags/#`` matches ``whk/whk01/ot/tags/TIT/Out_PV``
        ``whk/+/mes/recipe/next`` matches ``whk/whk01/mes/recipe/next``
    """
    filter_parts = topic_filter.split("/")
    topic_parts = topic.split("/")

    for i, fp in enumerate(filter_parts):
        if fp == "#":
            # '#' matches everything from here forward
            return True
        if i >= len(topic_parts):
            return False
        if fp == "+":
            continue  # '+' matches any single level
        if fp != topic_parts[i]:
            return False

    # All filter parts matched; topic must have same number of levels
    return len(filter_parts) == len(topic_parts)
