"""Forge message consumer — consumes events from RabbitMQ exchanges.

Architecture:
    ForgeConsumer (ABC)
    ├── InMemoryConsumer  — for testing without a broker
    └── AmqpConsumer      — real RabbitMQ via aio-pika
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from collections.abc import Callable, Coroutine
from dataclasses import dataclass, field
from typing import Any

from forge.broker.exchanges import ExchangeSpec, ExchangeType
from forge.broker.serialization import deserialize_record

logger = logging.getLogger(__name__)

# Type alias for message callback
MessageCallback = Callable[[dict[str, Any]], Coroutine[Any, Any, None]]


class ForgeConsumer(ABC):
    """Abstract base class for message consumers."""

    @abstractmethod
    async def consume(
        self,
        exchange: ExchangeSpec,
        queue_name: str,
        callback: MessageCallback,
        routing_key: str = "#",
    ) -> None:
        """Start consuming messages from an exchange.

        Args:
            exchange: Source exchange specification.
            queue_name: Name for the consumer queue (durable, bound to exchange).
            callback: Async function called with each deserialized message dict.
            routing_key: Binding key for topic exchanges. ``#`` matches all.
        """

    @abstractmethod
    async def cancel(self) -> None:
        """Cancel all active consumers and close connection."""


@dataclass
class InMemoryConsumer(ForgeConsumer):
    """In-memory consumer for testing.

    Call ``deliver()`` to simulate incoming messages.
    """

    _callbacks: dict[str, MessageCallback] = field(default_factory=dict)
    _queues: dict[str, list[dict[str, Any]]] = field(
        default_factory=lambda: {}
    )

    async def consume(
        self,
        exchange: ExchangeSpec,
        queue_name: str,
        callback: MessageCallback,
        routing_key: str = "#",
    ) -> None:
        self._callbacks[queue_name] = callback
        self._queues[queue_name] = []

    async def cancel(self) -> None:
        self._callbacks.clear()
        self._queues.clear()

    async def deliver(self, queue_name: str, message: dict[str, Any]) -> None:
        """Simulate delivering a message to a consumer queue.

        Raises KeyError if the queue has no registered callback.
        """
        callback = self._callbacks[queue_name]
        self._queues[queue_name].append(message)
        await callback(message)


class AmqpConsumer(ForgeConsumer):
    """RabbitMQ consumer using aio-pika.

    Creates a robust connection and declares a durable queue bound
    to the specified exchange. Messages are prefetched and processed
    via the provided async callback.
    """

    def __init__(
        self,
        url: str,
        prefetch_count: int = 100,
        connection_timeout: float = 10.0,
    ) -> None:
        self._url = url
        self._prefetch_count = prefetch_count
        self._connection_timeout = connection_timeout
        self._connection: Any = None
        self._channel: Any = None
        self._consumer_tags: list[Any] = []

    async def consume(
        self,
        exchange: ExchangeSpec,
        queue_name: str,
        callback: MessageCallback,
        routing_key: str = "#",
    ) -> None:
        import aio_pika

        if self._connection is None or self._connection.is_closed:
            self._connection = await aio_pika.connect_robust(
                self._url,
                timeout=self._connection_timeout,
            )
            self._channel = await self._connection.channel()
            await self._channel.set_qos(prefetch_count=self._prefetch_count)

        exchange_type_map = {
            ExchangeType.FANOUT: aio_pika.ExchangeType.FANOUT,
            ExchangeType.TOPIC: aio_pika.ExchangeType.TOPIC,
            ExchangeType.DIRECT: aio_pika.ExchangeType.DIRECT,
        }

        amqp_exchange = await self._channel.declare_exchange(
            exchange.name,
            type=exchange_type_map[exchange.type],
            durable=exchange.durable,
        )

        queue = await self._channel.declare_queue(
            queue_name,
            durable=True,
        )
        await queue.bind(amqp_exchange, routing_key=routing_key)

        async def _on_message(message: aio_pika.IncomingMessage) -> None:
            async with message.process():
                try:
                    data = deserialize_record(message.body)
                    await callback(data)
                except Exception:
                    logger.exception(
                        "Error processing message from %s", exchange.name
                    )

        tag = await queue.consume(_on_message)
        self._consumer_tags.append(tag)
        logger.info(
            "AMQP consumer started: exchange=%s queue=%s",
            exchange.name,
            queue_name,
        )

    async def cancel(self) -> None:
        if self._connection and not self._connection.is_closed:
            await self._connection.close()
            logger.info("AMQP consumer connection closed")
        self._connection = None
        self._channel = None
        self._consumer_tags.clear()
