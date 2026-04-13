"""Forge message producer — publishes events to RabbitMQ exchanges.

Architecture:
    ForgeProducer (ABC)
    ├── InMemoryProducer  — for testing without a broker
    └── AmqpProducer      — real RabbitMQ via aio-pika
"""

from __future__ import annotations

import asyncio
import logging
from abc import ABC, abstractmethod
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from forge.broker.exchanges import ExchangeSpec, ExchangeType
from forge.broker.serialization import serialize_record

logger = logging.getLogger(__name__)


class ForgeProducer(ABC):
    """Abstract base class for message producers."""

    @abstractmethod
    async def publish(
        self,
        exchange: ExchangeSpec,
        payload: Any,
        routing_key: str = "",
    ) -> None:
        """Publish a message to an exchange.

        Args:
            exchange: Target exchange specification.
            payload: Message body (ContextualRecord, dict, or Pydantic model).
            routing_key: Routing key for topic exchanges. Ignored for fanout.
        """

    @abstractmethod
    async def close(self) -> None:
        """Close the producer connection."""


@dataclass
class InMemoryProducer(ForgeProducer):
    """In-memory producer for testing — stores messages in a dict.

    Messages are keyed by exchange name. Use ``messages`` to inspect
    what was published during tests.
    """

    messages: dict[str, list[dict[str, Any]]] = field(
        default_factory=lambda: defaultdict(list)
    )

    async def publish(
        self,
        exchange: ExchangeSpec,
        payload: Any,
        routing_key: str = "",
    ) -> None:
        body = serialize_record(payload)
        self.messages[exchange.name].append({
            "routing_key": routing_key,
            "body": body,
            "exchange": exchange.name,
        })

    async def close(self) -> None:
        pass

    def get_messages(self, exchange_name: str) -> list[dict[str, Any]]:
        """Get all messages published to a specific exchange."""
        return self.messages.get(exchange_name, [])

    def clear(self) -> None:
        """Clear all stored messages."""
        self.messages.clear()


class AmqpProducer(ForgeProducer):
    """RabbitMQ producer using aio-pika.

    Declares exchanges idempotently on first publish. Uses a robust
    connection that auto-reconnects on failure.
    """

    def __init__(self, url: str, connection_timeout: float = 10.0) -> None:
        self._url = url
        self._connection_timeout = connection_timeout
        self._connection: Any = None
        self._channel: Any = None
        self._declared_exchanges: dict[str, Any] = {}
        self._lock = asyncio.Lock()

    async def _ensure_connected(self) -> None:
        """Establish connection and channel if not already connected."""
        if self._connection is not None and not self._connection.is_closed:
            return

        import aio_pika

        self._connection = await aio_pika.connect_robust(
            self._url,
            timeout=self._connection_timeout,
        )
        self._channel = await self._connection.channel()
        self._declared_exchanges.clear()
        logger.info("AMQP producer connected to %s", self._url.split("@")[-1])

    async def _get_exchange(self, spec: ExchangeSpec) -> Any:
        """Get or declare an exchange."""
        if spec.name in self._declared_exchanges:
            return self._declared_exchanges[spec.name]

        import aio_pika

        exchange_type_map = {
            ExchangeType.FANOUT: aio_pika.ExchangeType.FANOUT,
            ExchangeType.TOPIC: aio_pika.ExchangeType.TOPIC,
            ExchangeType.DIRECT: aio_pika.ExchangeType.DIRECT,
        }

        exchange = await self._channel.declare_exchange(
            spec.name,
            type=exchange_type_map[spec.type],
            durable=spec.durable,
        )
        self._declared_exchanges[spec.name] = exchange
        return exchange

    async def publish(
        self,
        exchange: ExchangeSpec,
        payload: Any,
        routing_key: str = "",
    ) -> None:
        import aio_pika

        async with self._lock:
            await self._ensure_connected()
            amqp_exchange = await self._get_exchange(exchange)

        body = serialize_record(payload)
        message = aio_pika.Message(
            body=body,
            content_type="application/json",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
        )
        await amqp_exchange.publish(message, routing_key=routing_key)

    async def close(self) -> None:
        if self._connection and not self._connection.is_closed:
            await self._connection.close()
            logger.info("AMQP producer connection closed")
        self._connection = None
        self._channel = None
        self._declared_exchanges.clear()
