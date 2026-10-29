"""Tests for ForgeMqttBroker — lifecycle, in-process pub/sub, routing."""

import pytest

from forge.core.broker.broker import BrokerConfig, ForgeMqttBroker

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

        await broker.subscribe_local("test-handler", "whk/#", handler)
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
        await broker.subscribe_local("test", "test/#", lambda t, p, q, r: received.append(p))
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
        await broker.subscribe_local("test", "test/#", lambda t, p, q, r: received.append(p))
        await broker.publish("test/topic", "hello")

        assert received[0] == b"hello"
        await broker.stop()

    @pytest.mark.asyncio
    async def test_multiple_subscribers(self):
        broker = ForgeMqttBroker(BrokerConfig(port=0, sys_interval=0))
        await broker.start()

        received_a = []
        received_b = []

        await broker.subscribe_local("handler-a", "whk/#", lambda t, p, q, r: received_a.append(t))
        await broker.subscribe_local(
            "handler-b", "whk/+/ot/tags/#", lambda t, p, q, r: received_b.append(t)
        )

        await broker.publish("whk/whk01/ot/tags/TIT/Out_PV", b"78.4")

        assert len(received_a) == 1
        assert len(received_b) == 1

        await broker.stop()

    @pytest.mark.asyncio
    async def test_no_match_no_delivery(self):
        broker = ForgeMqttBroker(BrokerConfig(port=0, sys_interval=0))
        await broker.start()

        received = []
        await broker.subscribe_local("test", "other/topic", lambda t, p, q, r: received.append(t))
        await broker.publish("whk/whk01/ot/tags/TIT/Out_PV", b"78.4")

        assert len(received) == 0
        await broker.stop()

    @pytest.mark.asyncio
    async def test_unsubscribe_local(self):
        broker = ForgeMqttBroker(BrokerConfig(port=0, sys_interval=0))
        await broker.start()

        received = []
        await broker.subscribe_local("test", "whk/#", lambda t, p, q, r: received.append(t))
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
        broker = ForgeMqttBroker(
            BrokerConfig(
                allow_anonymous=False,
                username="admin",
                password="secret",
            )
        )
        assert broker.authenticate("", "") is False

    def test_correct_credentials(self):
        broker = ForgeMqttBroker(
            BrokerConfig(
                allow_anonymous=False,
                username="admin",
                password="secret",
            )
        )
        assert broker.authenticate("admin", "secret") is True

    def test_wrong_credentials(self):
        broker = ForgeMqttBroker(
            BrokerConfig(
                allow_anonymous=False,
                username="admin",
                password="secret",
            )
        )
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
        await broker.subscribe_local("bad", "test/#", bad_handler)
        await broker.subscribe_local("good", "test/#", lambda t, p, q, r: received.append(t))

        delivered = await broker.publish("test/topic", b"data")
        # good handler should still receive
        assert len(received) == 1
        # delivered count includes the successful one
        assert delivered >= 1

        await broker.stop()


# ---------------------------------------------------------------------------
# RETAIN semantics for local subscribers (MQTT 3.1.1 §3.3.1.3, FB-068)
# ---------------------------------------------------------------------------


class TestLocalRetainSemantics:
    @pytest.mark.asyncio
    async def test_live_publish_arrives_with_retain_false_whatever_the_publisher_set(self):
        broker = ForgeMqttBroker(BrokerConfig(port=0, sys_interval=0))
        await broker.start()
        received: list[tuple[str, bytes, bool]] = []
        await broker.subscribe_local("t", "whk/#", lambda t, p, q, r: received.append((t, p, r)))

        await broker.publish("whk/health/PLC_001", b"connected", qos=1, retain=True)

        assert received == [("whk/health/PLC_001", b"connected", False)]
        assert broker.topic_engine.get_retained("whk/health/PLC_001") is not None
        await broker.stop()

    @pytest.mark.asyncio
    async def test_subscribe_replays_the_retained_store_with_retain_true_then_live_false(self):
        broker = ForgeMqttBroker(BrokerConfig(port=0, sys_interval=0))
        await broker.start()
        await broker.publish("whk/health/PLC_001", b"connected", qos=1, retain=True)
        await broker.publish("whk/health/PLC_002", b"lost", qos=0, retain=True)
        await broker.publish("other/topic", b"x", retain=True)
        received: list[tuple[str, bytes, int, bool]] = []

        replayed = await broker.subscribe_local(
            "t", "whk/health/+", lambda t, p, q, r: received.append((t, p, q, r))
        )

        assert replayed == 2
        assert sorted(received) == [
            ("whk/health/PLC_001", b"connected", 1, True),
            ("whk/health/PLC_002", b"lost", 0, True),
        ]
        await broker.publish("whk/health/PLC_001", b"reconnected", qos=1)
        assert received[-1] == ("whk/health/PLC_001", b"reconnected", 1, False)
        await broker.stop()

    @pytest.mark.asyncio
    async def test_replay_can_be_turned_off(self):
        broker = ForgeMqttBroker(BrokerConfig(port=0, sys_interval=0))
        await broker.start()
        await broker.publish("whk/health/PLC_001", b"connected", retain=True)
        received = []

        replayed = await broker.subscribe_local(
            "t", "whk/#", lambda t, p, q, r: received.append(t), replay_retained=False
        )

        assert replayed == 0 and received == []
        await broker.stop()

    @pytest.mark.asyncio
    async def test_a_cleared_retained_message_is_not_replayed(self):
        broker = ForgeMqttBroker(BrokerConfig(port=0, sys_interval=0))
        await broker.start()
        await broker.publish("whk/health/PLC_001", b"connected", retain=True)
        await broker.publish("whk/health/PLC_001", b"", retain=True)
        received = []

        replayed = await broker.subscribe_local("t", "whk/#", lambda t, p, q, r: received.append(t))

        assert replayed == 0 and received == []
        await broker.stop()

    @pytest.mark.asyncio
    async def test_a_handler_failing_on_replay_is_not_counted_and_keeps_subscribing(self):
        broker = ForgeMqttBroker(BrokerConfig(port=0, sys_interval=0))
        await broker.start()
        await broker.publish("whk/health/PLC_001", b"connected", retain=True)
        seen: list[bool] = []

        async def flaky(topic, payload, qos, retain):
            seen.append(retain)
            if retain:
                raise RuntimeError("boom")

        assert await broker.subscribe_local("flaky", "whk/#", flaky) == 0
        assert await broker.publish("whk/health/PLC_001", b"live") == 1
        assert seen == [True, False]
        await broker.stop()

    @pytest.mark.asyncio
    async def test_local_client_subscribe_replays_like_a_tcp_subscribe(self):
        from forge.core.broker.local_client import LocalMqttClient

        broker = ForgeMqttBroker(BrokerConfig(port=0, sys_interval=0))
        await broker.start()
        await broker.publish("whk/health/PLC_001", b"connected", retain=True)
        client = LocalMqttClient(broker, client_id="t")
        await client.connect()
        received = []

        replayed = await client.subscribe("whk/#", lambda t, p, q, r: received.append((t, r)))

        assert replayed == 1 and received == [("whk/health/PLC_001", True)]
        await client.publish("whk/health/PLC_002", b"x", retain=True)
        assert received[-1] == ("whk/health/PLC_002", False)
        await client.disconnect()
        await broker.stop()
