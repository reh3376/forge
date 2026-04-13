"""Forge Message Broker — RabbitMQ-based event bus.

Provides async producer/consumer base classes with InMemory and AMQP
backends. RabbitMQ is the primary broker; Kafka is retained for future
high-volume streaming but has no new abstractions in this package.

Public API:
    ForgeProducer, InMemoryProducer, AmqpProducer
    ForgeConsumer, InMemoryConsumer, AmqpConsumer
    FORGE_EXCHANGES, ExchangeSpec
    serialize_record, deserialize_record
"""

from forge.broker.consumer import AmqpConsumer, ForgeConsumer, InMemoryConsumer
from forge.broker.exchanges import FORGE_EXCHANGES, ExchangeSpec
from forge.broker.producer import AmqpProducer, ForgeProducer, InMemoryProducer
from forge.broker.serialization import deserialize_record, serialize_record

__all__ = [
    "FORGE_EXCHANGES",
    "AmqpConsumer",
    "AmqpProducer",
    "ExchangeSpec",
    "ForgeConsumer",
    "ForgeProducer",
    "InMemoryConsumer",
    "InMemoryProducer",
    "deserialize_record",
    "serialize_record",
]
