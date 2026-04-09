"""LocalMqttClient — in-process MQTT client for the embedded broker.

When OTMqttPublisher's target is the embedded ForgeMqttBroker, there's
no need to go through TCP.  This client implements the same interface
as the stub/aiomqtt client but routes directly through the broker's
in-process API.

This is the default client created when ``broker="local"`` is
configured (or when no external broker is specified).

Usage::

    broker = ForgeMqttBroker()
    await broker.start()

    client = LocalMqttClient(broker)
    await client.connect()
    await client.publish("whk/whk01/ot/tags/TIT/Out_PV", payload)
    await client.subscribe("whk/#", callback)
    await client.disconnect()
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable, Awaitable, TYPE_CHECKING

if TYPE_CHECKING:
    from forge.core.broker.broker import ForgeMqttBroker

logger = logging.getLogger(__name__)


class LocalMqttClient:
    """In-process MQTT client that routes through the embedded broker.

    Implements the same interface as _StubMqttClient so OTMqttPublisher
    can use it transparently.
    """

    def __init__(self, broker: ForgeMqttBroker, client_id: str = "forge-ot-local") -> None:
        self._broker = broker
        self._client_id = client_id
        self._connected = False
        self._subscriptions: list[str] = []

        # Track published messages for testing
        self.published: list[dict] = []

    @property
    def is_connected(self) -> bool:
        return self._connected

    async def connect(self) -> None:
        """Connect to the in-process broker."""
        if not self._broker.is_started:
            raise ConnectionError("Embedded broker is not started")
        self._connected = True
        logger.debug("LocalMqttClient %s connected to embedded broker", self._client_id)

    async def disconnect(self) -> None:
        """Disconnect from the broker."""
        # Unsubscribe all local subscriptions
        self._broker.unsubscribe_local(self._client_id)
        self._connected = False
        logger.debug("LocalMqttClient %s disconnected", self._client_id)

    async def publish(
        self,
        topic: str,
        payload: bytes,
        qos: int = 0,
        retain: bool = False,
    ) -> None:
        """Publish a message through the embedded broker.

        This bypasses TCP entirely — the message goes directly to the
        broker's topic engine for matching and fan-out.
        """
        if not self._connected:
            raise ConnectionError("Not connected to broker")

        await self._broker.handle_publish(
            topic=topic,
            payload=payload,
            qos=qos,
            retain=retain,
            sender_id=self._client_id,
        )

        # Track for testing
        self.published.append({
            "topic": topic,
            "payload": payload,
            "qos": qos,
            "retain": retain,
        })

    def subscribe(
        self,
        topic_filter: str,
        callback: Callable[[str, bytes, int, bool], Awaitable[None] | None],
    ) -> None:
        """Subscribe to a topic pattern via the broker's local API."""
        self._broker.subscribe_local(
            self._client_id,
            topic_filter,
            callback,
        )
        self._subscriptions.append(topic_filter)

    def get_info(self) -> dict[str, Any]:
        """Return client info for monitoring."""
        return {
            "client_id": self._client_id,
            "connected": self._connected,
            "type": "local",
            "subscriptions": list(self._subscriptions),
            "published_count": len(self.published),
        }
