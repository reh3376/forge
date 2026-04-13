"""Tests for broker producers."""

import json

import pytest

from forge.broker.exchanges import ExchangeSpec, ExchangeType
from forge.broker.producer import InMemoryProducer


class TestInMemoryProducer:
    @pytest.fixture
    def producer(self):
        return InMemoryProducer()

    @pytest.fixture
    def test_exchange(self):
        return ExchangeSpec(name="forge.test.exchange")

    async def test_publish_dict(self, producer, test_exchange):
        await producer.publish(test_exchange, {"key": "value"})
        messages = producer.get_messages("forge.test.exchange")
        assert len(messages) == 1
        body = json.loads(messages[0]["body"])
        assert body["key"] == "value"

    async def test_publish_with_routing_key(self, producer, test_exchange):
        exchange = ExchangeSpec(
            name="forge.test.topic", type=ExchangeType.TOPIC
        )
        await producer.publish(exchange, {"data": 1}, routing_key="test.key")
        messages = producer.get_messages("forge.test.topic")
        assert messages[0]["routing_key"] == "test.key"

    async def test_publish_multiple_messages(self, producer, test_exchange):
        for i in range(5):
            await producer.publish(test_exchange, {"seq": i})
        messages = producer.get_messages("forge.test.exchange")
        assert len(messages) == 5

    async def test_separate_exchanges(self, producer):
        ex1 = ExchangeSpec(name="forge.ex1")
        ex2 = ExchangeSpec(name="forge.ex2")
        await producer.publish(ex1, {"from": "ex1"})
        await producer.publish(ex2, {"from": "ex2"})
        assert len(producer.get_messages("forge.ex1")) == 1
        assert len(producer.get_messages("forge.ex2")) == 1

    async def test_clear(self, producer, test_exchange):
        await producer.publish(test_exchange, {"data": 1})
        producer.clear()
        assert len(producer.get_messages("forge.test.exchange")) == 0

    async def test_get_messages_empty(self, producer):
        assert producer.get_messages("nonexistent") == []

    async def test_close_is_noop(self, producer):
        await producer.close()  # Should not raise

    async def test_message_body_is_bytes(self, producer, test_exchange):
        await producer.publish(test_exchange, {"key": "val"})
        messages = producer.get_messages("forge.test.exchange")
        assert isinstance(messages[0]["body"], bytes)

    async def test_message_exchange_name_stored(self, producer, test_exchange):
        await producer.publish(test_exchange, {"k": "v"})
        messages = producer.get_messages("forge.test.exchange")
        assert messages[0]["exchange"] == "forge.test.exchange"
