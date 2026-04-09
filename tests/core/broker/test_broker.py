"""Tests for ForgeMqttBroker — lifecycle, in-process pub/sub, routing."""

import asyncio
import pytest

from forge.core.broker.broker import ForgeMqttBroker, BrokerConfig


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


class TestBrokerLifecycle:

    @pytest.mark.asyncio
    async def test_start_and_stop(self):
        broker = ForgeMqttBroker(BrokerConfig(port=0, sys_interval=0))
        await broker.start()
        assert broker.is_started is True
        await broker.stop()
        assert broker.is_started is False

    @pytest.mark.asyncio
    async def test_start_idempotent(self):
        broker = ForgeMqttBroker(BrokerConfig(port=0, sys_interval=0))
        await broker.start()
        await broker.start()  # Should not raise
        assert broker.is_started is True
        await broker.stop()

    @pytest.mark.asyncio
    async def test_status_fields(self):
        broker = ForgeMqttBroker(BrokerConfig(port=0, sys_interval=0))
        await broker.start()
        status = broker.get_status()
        assert status["started"] is True
        assert status["connected_clients"] == 0
        assert "uptime" in status
        await broker.stop()


# ---------------------------------------------------------------------------
# In-process publish/subscribe
# ---------------------------------------------------------------------------


class TestInProcessPubSub:

    @pytest.mark.asyncio
    async def test_local_subscribe_and_publish(self):
        broker = ForgeMqttBroker(BrokerConfig(port=0, sys_interval=0))
        await broker.start()

        received = []

        async def handler(topic, payload, qos, retain):
            received.append({"topic": topic, "payload": payload.decode()})

        broker.subscribe_local("test-handler", "whk/#", handler)
        await broker.publish("whk/whk01/ot/tags/TIT/Out_PV", b"78.4")

        assert len(received) == 1
        assert received[0]["topic"] == "whk/whk01/ot/tags/TIT/Out_PV"
        assert received[0]["payload"] == "78.4"

        await broker.stop()

    @pytest.mark.asyncio
    async def test_publish_dict_payload(self):
        broker = ForgeMqttBroker(BrokerConfig(port=0, sys_interval=0))
        await broker.start()

        received = []
        broker.subscribe_local("test", "test/#", lambda t, p, q, r: received.append(p))
        await broker.publish("test/topic", {"value": 78.4, "quality": "GOOD"})

        assert len(received) == 1
        import json
        data = json.loads(received[0])
        assert data["value"] == 78.4

        await broker.stop()

    @pytest.mark.asyncio
    async def test_publish_string_payload(self):
        broker = ForgeMqttBroker(BrokerConfig(port=0, sys_interval=0))
        await broker.start()

        received = []
        broker.subscribe_local("test", "test/#", lambda t, p, q, r: received.append(p))
        await broker.publish("test/topic", "hello")

        assert received[0] == b"hello"
        await broker.stop()

    @pytest.mark.asyncio
    async def test_multiple_subscribers(self):
        broker = ForgeMqttBroker(BrokerConfig(port=0, sys_interval=0))
        await broker.start()

        received_a = []
        received_b = []

        broker.subscribe_local("handler-a", "whk/#",
                               lambda t, p, q, r: received_a.append(t))
        broker.subscribe_local("handler-b", "whk/+/ot/tags/#",
                               lambda t, p, q, r: received_b.append(t))

        await broker.publish("whk/whk01/ot/tags/TIT/Out_PV", b"78.4")

        assert len(received_a) == 1
        assert len(received_b) == 1

        await broker.stop()

    @pytest.mark.asyncio
    async def test_no_match_no_delivery(self):
        broker = ForgeMqttBroker(BrokerConfig(port=0, sys_interval=0))
        await broker.start()

        received = []
        broker.subscribe_local("test", "other/topic",
                               lambda t, p, q, r: received.append(t))
        await broker.publish("whk/whk01/ot/tags/TIT/Out_PV", b"78.4")

        assert len(received) == 0
        await broker.stop()

    @pytest.mark.asyncio
    async def test_unsubscribe_local(self):
        broker = ForgeMqttBroker(BrokerConfig(port=0, sys_interval=0))
        await broker.start()

        received = []
        broker.subscribe_local("test", "whk/#",
                               lambda t, p, q, r: received.append(t))
        removed = broker.unsubscribe_local("test")
        assert removed == 1

        await broker.publish("whk/whk01/ot/tags/TIT/Out_PV", b"78.4")
        assert len(received) == 0

        await broker.stop()


# ---------------------------------------------------------------------------
# Retained messages through broker
# ---------------------------------------------------------------------------


class TestBrokerRetained:

    @pytest.mark.asyncio
    async def test_retain_stores_message(self):
        broker = ForgeMqttBroker(BrokerConfig(port=0, sys_interval=0))
        await broker.start()

        await broker.publish("whk/health/PLC_001", b"connected", retain=True)

        msg = broker.topic_engine.get_retained("whk/health/PLC_001")
        assert msg is not None
        assert msg.payload == b"connected"

        await broker.stop()

    @pytest.mark.asyncio
    async def test_empty_payload_clears_retain(self):
        broker = ForgeMqttBroker(BrokerConfig(port=0, sys_interval=0))
        await broker.start()

        await broker.publish("whk/health/PLC_001", b"connected", retain=True)
        await broker.publish("whk/health/PLC_001", b"", retain=True)

        msg = broker.topic_engine.get_retained("whk/health/PLC_001")
        assert msg is None

        await broker.stop()


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


class TestBrokerAuth:

    def test_anonymous_allowed_by_default(self):
        broker = ForgeMqttBroker(BrokerConfig())
        assert broker.authenticate("", "") is True

    def test_anonymous_denied_when_disabled(self):
        broker = ForgeMqttBroker(BrokerConfig(
            allow_anonymous=False, username="admin", password="secret",
        ))
        assert broker.authenticate("", "") is False

    def test_correct_credentials(self):
        broker = ForgeMqttBroker(BrokerConfig(
            allow_anonymous=False, username="admin", password="secret",
        ))
        assert broker.authenticate("admin", "secret") is True

    def test_wrong_credentials(self):
        broker = ForgeMqttBroker(BrokerConfig(
            allow_anonymous=False, username="admin", password="secret",
        ))
        assert broker.authenticate("admin", "wrong") is False


# ---------------------------------------------------------------------------
# Handler error resilience
# ---------------------------------------------------------------------------


class TestBrokerResilience:

    @pytest.mark.asyncio
    async def test_handler_exception_does_not_crash_broker(self):
        broker = ForgeMqttBroker(BrokerConfig(port=0, sys_interval=0))
        await broker.start()

        def bad_handler(t, p, q, r):
            raise ValueError("boom")

        received = []
        broker.subscribe_local("bad", "test/#", bad_handler)
        broker.subscribe_local("good", "test/#",
                               lambda t, p, q, r: received.append(t))

        delivered = await broker.publish("test/topic", b"data")
        # good handler should still receive
        assert len(received) == 1
        # delivered count includes the successful one
        assert delivered >= 1

        await broker.stop()
