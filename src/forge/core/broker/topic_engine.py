"""TopicEngine — subscription matching, message fan-out, and retain store.

The topic engine is the routing core of the broker.  It maintains:
  1. A subscription table: client_id → list of (topic_filter, qos) pairs
  2. A retained message store: topic → (payload, qos)
  3. The matching algorithm for MQTT wildcards (+ and #)

Design decisions:
    D1: Flat subscription table, not a topic trie.  For <10,000
        subscriptions this is faster than a trie because the
        constant overhead of trie traversal dominates.  If we ever
        need to scale to 100K+ subscriptions, swap in a trie.
    D2: Retained messages are stored as (topic, payload, qos) tuples.
        Publishing an empty payload to a retained topic clears it
        (per MQTT spec §3.3.1.3).
    D3: $SYS/ topics are excluded from wildcard subscriptions (#)
        per MQTT spec §4.7.2.
"""

from __future__ import annotations

import fnmatch
import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Subscription entry
# ---------------------------------------------------------------------------


@dataclass
class SubscriptionEntry:
    """A single client's subscription to a topic filter."""

    client_id: str
    topic_filter: str
    qos: int = 0


# ---------------------------------------------------------------------------
# Retained message
# ---------------------------------------------------------------------------


@dataclass
class RetainedMessage:
    """A retained message stored by the broker."""

    topic: str
    payload: bytes
    qos: int = 0
    timestamp: float = 0.0


# ---------------------------------------------------------------------------
# Match result
# ---------------------------------------------------------------------------


@dataclass
class MatchResult:
    """A subscription that matches a published topic."""

    client_id: str
    topic_filter: str
    granted_qos: int


# ---------------------------------------------------------------------------
# TopicEngine
# ---------------------------------------------------------------------------


class TopicEngine:
    """Manages subscriptions, matching, and retained messages.

    Usage::

        engine = TopicEngine()
        engine.subscribe("client-1", "whk/+/ot/tags/#", qos=0)
        engine.subscribe("client-2", "whk/whk01/ot/health/+", qos=1)

        matches = engine.match("whk/whk01/ot/tags/TIT/Out_PV")
        # → [MatchResult(client_id="client-1", ...)]

        engine.set_retained("whk/whk01/ot/health/PLC_001", payload, qos=1)
        retained = engine.get_retained_for("whk/+/ot/health/+")
        # → [RetainedMessage(...)]
    """

    def __init__(self) -> None:
        # client_id → list of SubscriptionEntry
        self._subscriptions: dict[str, list[SubscriptionEntry]] = defaultdict(list)
        # topic → RetainedMessage
        self._retained: dict[str, RetainedMessage] = {}
        # Metrics
        self._match_count: int = 0
        self._total_publishes: int = 0

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def subscription_count(self) -> int:
        """Total number of active subscriptions across all clients."""
        return sum(len(subs) for subs in self._subscriptions.values())

    @property
    def client_count(self) -> int:
        """Number of clients with active subscriptions."""
        return len(self._subscriptions)

    @property
    def retained_count(self) -> int:
        """Number of retained messages."""
        return len(self._retained)

    # ------------------------------------------------------------------
    # Subscribe / Unsubscribe
    # ------------------------------------------------------------------

    def subscribe(self, client_id: str, topic_filter: str, qos: int = 0) -> int:
        """Add a subscription. Returns the granted QoS (capped at 1).

        If the client already has a subscription to the same filter,
        it is replaced (updated QoS).
        """
        granted = min(qos, 1)  # Cap at QoS 1

        # Replace existing subscription to same filter
        subs = self._subscriptions[client_id]
        for i, sub in enumerate(subs):
            if sub.topic_filter == topic_filter:
                subs[i] = SubscriptionEntry(client_id, topic_filter, granted)
                return granted

        subs.append(SubscriptionEntry(client_id, topic_filter, granted))
        logger.debug("Client %s subscribed to %s (QoS %d)", client_id, topic_filter, granted)
        return granted

    def unsubscribe(self, client_id: str, topic_filter: str) -> bool:
        """Remove a subscription. Returns True if it existed."""
        subs = self._subscriptions.get(client_id, [])
        for i, sub in enumerate(subs):
            if sub.topic_filter == topic_filter:
                subs.pop(i)
                if not subs:
                    del self._subscriptions[client_id]
                return True
        return False

    def unsubscribe_all(self, client_id: str) -> int:
        """Remove all subscriptions for a client. Returns count removed."""
        subs = self._subscriptions.pop(client_id, [])
        return len(subs)

    def get_subscriptions(self, client_id: str) -> list[SubscriptionEntry]:
        """Get all subscriptions for a client."""
        return list(self._subscriptions.get(client_id, []))

    # ------------------------------------------------------------------
    # Topic matching
    # ------------------------------------------------------------------

    def match(self, topic: str) -> list[MatchResult]:
        """Find all subscriptions matching a published topic.

        Returns a list of MatchResult with effective QoS for each match.
        A client appears at most once (highest QoS wins if multiple
        filters match).
        """
        self._total_publishes += 1
        results: dict[str, MatchResult] = {}

        for client_id, subs in self._subscriptions.items():
            for sub in subs:
                if mqtt_topic_matches(sub.topic_filter, topic):
                    existing = results.get(client_id)
                    if existing is None or sub.qos > existing.granted_qos:
                        results[client_id] = MatchResult(
                            client_id=client_id,
                            topic_filter=sub.topic_filter,
                            granted_qos=sub.qos,
                        )

        self._match_count += len(results)
        return list(results.values())

    # ------------------------------------------------------------------
    # Retained messages
    # ------------------------------------------------------------------

    def set_retained(self, topic: str, payload: bytes, qos: int = 0) -> None:
        """Store or clear a retained message.

        An empty payload clears the retained message for that topic
        (per MQTT spec §3.3.1.3).
        """
        if not payload:
            self._retained.pop(topic, None)
            return

        self._retained[topic] = RetainedMessage(
            topic=topic,
            payload=payload,
            qos=min(qos, 1),
            timestamp=time.time(),
        )

    def get_retained(self, topic: str) -> RetainedMessage | None:
        """Get the retained message for an exact topic."""
        return self._retained.get(topic)

    def get_retained_for(self, topic_filter: str) -> list[RetainedMessage]:
        """Get all retained messages matching a subscription filter.

        Used to send retained messages to a new subscriber.
        """
        results = []
        for topic, msg in self._retained.items():
            if mqtt_topic_matches(topic_filter, topic):
                results.append(msg)
        return results

    def clear_retained(self) -> int:
        """Clear all retained messages. Returns count removed."""
        count = len(self._retained)
        self._retained.clear()
        return count

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    def get_stats(self) -> dict[str, Any]:
        return {
            "subscriptions": self.subscription_count,
            "clients": self.client_count,
            "retained_messages": self.retained_count,
            "total_publishes": self._total_publishes,
            "total_matches": self._match_count,
        }


# ---------------------------------------------------------------------------
# MQTT topic matching (3.1.1 spec §4.7)
# ---------------------------------------------------------------------------


def mqtt_topic_matches(topic_filter: str, topic: str) -> bool:
    """Check if a topic matches a subscription filter.

    MQTT wildcards:
        ``+`` — matches exactly one topic level
        ``#`` — matches zero or more levels (must be last)

    Special rules (§4.7.2):
        - ``#`` does NOT match topics starting with ``$`` (system topics)
        - ``+`` at level 0 does NOT match ``$`` prefix

    Examples::

        mqtt_topic_matches("a/+/c", "a/b/c")  → True
        mqtt_topic_matches("a/#", "a/b/c")     → True
        mqtt_topic_matches("#", "$SYS/info")    → False
    """
    # System topic protection
    if topic.startswith("$") and not topic_filter.startswith("$"):
        return False

    filter_parts = topic_filter.split("/")
    topic_parts = topic.split("/")

    fi = 0  # filter index
    ti = 0  # topic index

    while fi < len(filter_parts):
        fp = filter_parts[fi]

        if fp == "#":
            # '#' matches everything from here to end
            return True

        if ti >= len(topic_parts):
            return False

        if fp == "+":
            # '+' matches exactly one level
            fi += 1
            ti += 1
            continue

        if fp != topic_parts[ti]:
            return False

        fi += 1
        ti += 1

    # Both must be fully consumed
    return fi == len(filter_parts) and ti == len(topic_parts)
