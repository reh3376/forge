"""Tests for broker consumers."""

import pytest

from forge.broker.consumer import InMemoryConsumer
from forge.broker.exchanges import ExchangeSpec


class TestInMemoryConsumer:
    @pytest.fixture
    def consumer(self):
        return InMemoryConsumer()

    @pytest.fixture
    def test_exchange(self):
        return ExchangeSpec(name="forge.test.exchange")

    async def test_consume_registers_callback(self, consumer, test_exchange):
        received = []

        async def handler(msg):
            received.append(msg)

        await consumer.consume(test_exchange, "test-queue", handler)
        assert "test-queue" in consumer._callbacks

    async def test_deliver_invokes_callback(self, consumer, test_exchange):
        received = []

        async def handler(msg):
            received.append(msg)

        await consumer.consume(test_exchange, "test-queue", handler)
        await consumer.deliver("test-queue", {"adapter_id": "test-01"})

        assert len(received) == 1
        assert received[0]["adapter_id"] == "test-01"

    async def test_deliver_multiple_messages(self, consumer, test_exchange):
        received = []

        async def handler(msg):
            received.append(msg)

        await consumer.consume(test_exchange, "test-queue", handler)
        for i in range(3):
            await consumer.deliver("test-queue", {"seq": i})

        assert len(received) == 3
        assert [m["seq"] for m in received] == [0, 1, 2]

    async def test_deliver_to_unknown_queue_raises(self, consumer):
        with pytest.raises(KeyError):
            await consumer.deliver("unknown-queue", {"data": 1})

    async def test_cancel_clears_state(self, consumer, test_exchange):
        async def handler(msg):
            pass

        await consumer.consume(test_exchange, "test-queue", handler)
        await consumer.cancel()
        assert len(consumer._callbacks) == 0
        assert len(consumer._queues) == 0

    async def test_multiple_queues(self, consumer):
        ex1 = ExchangeSpec(name="forge.ex1")
        ex2 = ExchangeSpec(name="forge.ex2")
        results_1 = []
        results_2 = []

        await consumer.consume(ex1, "q1", lambda m: _append(results_1, m))
        await consumer.consume(ex2, "q2", lambda m: _append(results_2, m))

        await consumer.deliver("q1", {"src": "ex1"})
        await consumer.deliver("q2", {"src": "ex2"})

        assert len(results_1) == 1
        assert len(results_2) == 1
        assert results_1[0]["src"] == "ex1"
        assert results_2[0]["src"] == "ex2"


async def _append(lst, msg):
    lst.append(msg)
