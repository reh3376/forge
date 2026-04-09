"""Tests for MqttSubscriber — topic subscription and message dispatch."""

import pytest

from forge.modules.ot.mqtt.subscriber import (
    IncomingMessage,
    MqttSubscriber,
    Subscription,
    _mqtt_topic_matches,
)


# ---------------------------------------------------------------------------
# MQTT topic matching
# ---------------------------------------------------------------------------


class TestMqttTopicMatching:

    def test_exact_match(self):
        assert _mqtt_topic_matches("a/b/c", "a/b/c") is True
        assert _mqtt_topic_matches("a/b/c", "a/b/d") is False

    def test_plus_single_level(self):
        assert _mqtt_topic_matches("a/+/c", "a/b/c") is True
        assert _mqtt_topic_matches("a/+/c", "a/x/c") is True
        assert _mqtt_topic_matches("a/+/c", "a/b/d") is False

    def test_plus_does_not_match_multiple_levels(self):
        assert _mqtt_topic_matches("a/+/c", "a/b/x/c") is False

    def test_hash_matches_remaining(self):
        assert _mqtt_topic_matches("a/b/#", "a/b/c") is True
        assert _mqtt_topic_matches("a/b/#", "a/b/c/d/e") is True

    def test_hash_at_root(self):
        assert _mqtt_topic_matches("#", "anything/at/all") is True

    def test_combined(self):
        assert _mqtt_topic_matches("whk/+/ot/tags/#", "whk/whk01/ot/tags/TIT/Out_PV") is True
        assert _mqtt_topic_matches("whk/+/mes/recipe/next", "whk/whk01/mes/recipe/next") is True
        assert _mqtt_topic_matches("whk/+/mes/recipe/next", "whk/whk01/mes/recipe/other") is False

    def test_topic_shorter_than_filter(self):
        assert _mqtt_topic_matches("a/b/c", "a/b") is False

    def test_filter_shorter_than_topic(self):
        assert _mqtt_topic_matches("a/b", "a/b/c") is False


# ---------------------------------------------------------------------------
# IncomingMessage
# ---------------------------------------------------------------------------


class TestIncomingMessage:

    def test_payload_str(self):
        msg = IncomingMessage(topic="t", payload=b"hello")
        assert msg.payload_str() == "hello"

    def test_payload_json(self):
        msg = IncomingMessage(topic="t", payload=b'{"key": "value"}')
        assert msg.payload_json() == {"key": "value"}

    def test_payload_json_invalid_raises(self):
        msg = IncomingMessage(topic="t", payload=b"not json")
        with pytest.raises(Exception):
            msg.payload_json()


# ---------------------------------------------------------------------------
# Subscription
# ---------------------------------------------------------------------------


class TestSubscription:

    def test_matches(self):
        sub = Subscription(topic_filter="whk/+/ot/tags/#", handler=lambda m: None)
        assert sub.matches("whk/whk01/ot/tags/TIT/Out_PV") is True
        assert sub.matches("whk/whk01/mes/recipe") is False


# ---------------------------------------------------------------------------
# Subscriber registration
# ---------------------------------------------------------------------------


class TestSubscriberRegistration:

    def test_subscribe(self):
        sub = MqttSubscriber()
        sub.subscribe("test/topic", lambda m: None, name="handler1")
        assert sub.subscription_count == 1

    def test_decorator_subscribe(self):
        sub = MqttSubscriber()

        @sub.on("test/topic")
        async def handler(msg):
            pass

        assert sub.subscription_count == 1

    def test_unsubscribe(self):
        sub = MqttSubscriber()
        sub.subscribe("test/a", lambda m: None)
        sub.subscribe("test/b", lambda m: None)
        removed = sub.unsubscribe("test/a")
        assert removed == 1
        assert sub.subscription_count == 1

    def test_get_topic_filters(self):
        sub = MqttSubscriber()
        sub.subscribe("a/b", lambda m: None)
        sub.subscribe("c/d", lambda m: None)
        sub.subscribe("a/b", lambda m: None)  # Duplicate filter
        filters = sub.get_topic_filters()
        assert set(filters) == {"a/b", "c/d"}


# ---------------------------------------------------------------------------
# Message dispatch
# ---------------------------------------------------------------------------


class TestMessageDispatch:

    @pytest.mark.asyncio
    async def test_dispatch_to_matching_handler(self):
        received = []
        sub = MqttSubscriber()
        sub.subscribe("test/+/data", lambda m: received.append(m))

        msg = IncomingMessage(topic="test/dev1/data", payload=b"hello")
        count = await sub.process_message(msg)
        assert count == 1
        assert len(received) == 1
        assert received[0].topic == "test/dev1/data"

    @pytest.mark.asyncio
    async def test_dispatch_async_handler(self):
        received = []
        sub = MqttSubscriber()

        async def handler(msg):
            received.append(msg.payload_str())

        sub.subscribe("test/#", handler)
        await sub.process_message(IncomingMessage(topic="test/a", payload=b"val"))
        assert received == ["val"]

    @pytest.mark.asyncio
    async def test_no_match_returns_zero(self):
        sub = MqttSubscriber()
        sub.subscribe("other/topic", lambda m: None)
        count = await sub.process_message(
            IncomingMessage(topic="test/topic", payload=b"x"),
        )
        assert count == 0

    @pytest.mark.asyncio
    async def test_multiple_handlers_same_topic(self):
        counts = {"a": 0, "b": 0}
        sub = MqttSubscriber()
        sub.subscribe("test/#", lambda m: counts.__setitem__("a", counts["a"] + 1))
        sub.subscribe("test/#", lambda m: counts.__setitem__("b", counts["b"] + 1))

        await sub.process_message(IncomingMessage(topic="test/x", payload=b""))
        assert counts == {"a": 1, "b": 1}

    @pytest.mark.asyncio
    async def test_handler_exception_does_not_propagate(self):
        sub = MqttSubscriber()
        sub.subscribe("test/#", lambda m: (_ for _ in ()).throw(ValueError("boom")))

        # Should not raise
        count = await sub.process_message(
            IncomingMessage(topic="test/x", payload=b""),
        )
        # Handler raised, so invoked=0 (exception caught before increment)

    @pytest.mark.asyncio
    async def test_stats(self):
        sub = MqttSubscriber()
        sub.subscribe("test/#", lambda m: None)

        await sub.process_message(IncomingMessage(topic="test/a", payload=b""))
        await sub.process_message(IncomingMessage(topic="test/b", payload=b""))

        stats = sub.get_stats()
        assert stats["messages_received"] == 2
        assert stats["dispatches"] == 2
