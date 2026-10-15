"""Broker → MqttSubscriber ingress: embedded broker and aiomqtt-shaped external client (FB-065)."""

from __future__ import annotations

import asyncio
import json
from typing import Any, ClassVar

import pytest

from forge.core.broker.broker import BrokerConfig, ForgeMqttBroker
from forge.modules.ot.mqtt.ingress import ExternalBrokerIngress, LocalBrokerIngress
from forge.modules.ot.mqtt.subscriber import IncomingMessage, MqttSubscriber

STATE_T = "whk/whk01/cooker/changeover/state"
RECIPE_T = "whk/whk01/cooker/recipe/next"


def subscriber_with_log() -> tuple[MqttSubscriber, list[IncomingMessage]]:
    subscriber = MqttSubscriber()
    received: list[IncomingMessage] = []

    async def handle(msg: IncomingMessage) -> None:
        received.append(msg)

    subscriber.subscribe("whk/+/+/changeover/state", handle, name="state")
    subscriber.subscribe("whk/+/+/recipe/next", handle, name="recipe")
    subscriber.subscribe("whk/#", handle, name="all")  # overlapping filter
    return subscriber, received


@pytest.fixture
async def broker():
    broker = ForgeMqttBroker(BrokerConfig(host="127.0.0.1", port=0, sys_interval=0))
    await broker.start()
    yield broker
    await broker.stop()


async def test_local_ingress_replays_retained_then_delivers_live(broker: ForgeMqttBroker) -> None:
    await broker.publish(STATE_T, {"state": "PRODUCTION"}, qos=1, retain=True)
    subscriber, received = subscriber_with_log()
    ingress = LocalBrokerIngress(broker, subscriber, name="test-ingress")

    await ingress.start()

    # One retained message, replayed once although two broker filters match it;
    # the subscriber then fans it out to its two matching handlers (state + all).
    assert [m.topic for m in received] == [STATE_T] * 2
    assert all(m.retain for m in received)
    assert json.loads(received[0].payload) == {"state": "PRODUCTION"}
    assert ingress.status()["replayed"] == 1

    received.clear()
    await broker.publish(RECIPE_T, {"id": "sori-1"}, qos=1)
    topics = sorted({m.topic for m in received})
    assert topics == [RECIPE_T] and not received[0].retain
    # Delivered once per matching broker filter (two of ours match recipe/next).
    assert ingress.status()["delivered"] == 2
    assert ingress.status()["connected"] is True
    assert sorted(ingress.status()["filters"]) == sorted(subscriber.get_topic_filters())

    await ingress.stop()
    received.clear()
    await broker.publish(STATE_T, {"state": "COOK_COMPLETE"}, qos=1, retain=True)
    assert received == []
    assert ingress.status()["connected"] is False
    await ingress.start()  # restart replays the new retained state
    assert {json.loads(m.payload)["state"] for m in received} == {"COOK_COMPLETE"}
    assert all(m.retain for m in received)


class FakeMessage:
    def __init__(self, topic: str, payload: Any, *, retain: bool = False, qos: int = 1) -> None:
        self.topic = type("Topic", (), {"value": topic})()
        self.payload = payload
        self.retain = retain
        self.qos = qos


class FakeAiomqttClient:
    """The slice of aiomqtt.Client the ingress uses."""

    instances: ClassVar[list[FakeAiomqttClient]] = []

    def __init__(self) -> None:
        self.queue: asyncio.Queue[FakeMessage | Exception] = asyncio.Queue()
        self.subscriptions: list[tuple[str, int]] = []
        self.entered = False
        self.exited = False
        FakeAiomqttClient.instances.append(self)

    async def __aenter__(self) -> FakeAiomqttClient:
        self.entered = True
        return self

    async def __aexit__(self, *exc: Any) -> None:
        self.exited = True

    async def subscribe(self, topic_filter: str, qos: int = 0) -> None:
        self.subscriptions.append((topic_filter, qos))

    @property
    async def messages(self):
        while True:
            item = await self.queue.get()
            if isinstance(item, Exception):
                raise item
            yield item


async def wait_for(predicate, *, timeout: float = 2.0) -> None:
    async with asyncio.timeout(timeout):
        while not predicate():
            await asyncio.sleep(0.005)


async def test_external_ingress_subscribes_delivers_and_reconnects() -> None:
    FakeAiomqttClient.instances.clear()
    subscriber, received = subscriber_with_log()
    ingress = ExternalBrokerIngress(
        subscriber,
        host="broker.local",
        port=8883,
        client_id="ot-test",
        reconnect_min_delay=0.01,
        reconnect_max_delay=0.02,
        client_factory=FakeAiomqttClient,
    )
    await ingress.start()
    await wait_for(lambda: ingress.connected)
    client = FakeAiomqttClient.instances[0]
    assert sorted(f for f, _ in client.subscriptions) == sorted(subscriber.get_topic_filters())
    assert all(qos == 1 for _, qos in client.subscriptions)

    client.queue.put_nowait(FakeMessage(STATE_T, b'{"state": "AWAITING_CHANGEOVER"}', retain=True))
    client.queue.put_nowait(FakeMessage(RECIPE_T, '{"id": "sori-2"}'))  # str payload
    await wait_for(lambda: len(received) == 4)  # 2 messages x 2 matching handlers each
    by_topic = {m.topic: m for m in received}
    assert by_topic[STATE_T].retain and by_topic[STATE_T].qos == 1
    assert json.loads(by_topic[RECIPE_T].payload) == {"id": "sori-2"}
    assert ingress.status()["delivered"] == 2

    # Broker drops the connection: the ingress reconnects with a fresh client.
    client.queue.put_nowait(ConnectionError("broker went away"))
    await wait_for(lambda: len(FakeAiomqttClient.instances) == 2 and ingress.connected)
    status = ingress.status()
    assert status["errors"] == 1 and status["reconnects"] == 1
    assert "broker went away" in status["last_error"]
    assert status["broker"] == "broker.local:8883" and status["client_id"] == "ot-test"

    await ingress.stop()
    assert not ingress.connected and FakeAiomqttClient.instances[-1].exited
    await ingress.stop()  # idempotent


async def test_external_ingress_without_aiomqtt_reports_and_retries() -> None:
    subscriber, _received = subscriber_with_log()
    attempts = 0

    def failing_factory() -> Any:
        nonlocal attempts
        attempts += 1
        msg = "aiomqtt missing"
        raise RuntimeError(msg)

    ingress = ExternalBrokerIngress(
        subscriber,
        reconnect_min_delay=0.01,
        reconnect_max_delay=0.01,
        client_factory=failing_factory,
    )
    await ingress.start()
    await wait_for(lambda: attempts >= 3)
    assert ingress.status()["connected"] is False
    assert "aiomqtt missing" in ingress.status()["last_error"]
    await ingress.stop()
