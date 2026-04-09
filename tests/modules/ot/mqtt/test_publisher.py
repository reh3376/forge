"""Tests for OTMqttPublisher — connection lifecycle, publish, buffering."""

import asyncio
import json
import pytest

from forge.modules.ot.mqtt.publisher import (
    MqttConfig,
    OTMqttPublisher,
    PendingMessage,
    _StubMqttClient,
)


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


class TestMqttConfig:

    def test_defaults(self):
        config = MqttConfig()
        assert config.host == "localhost"
        assert config.port == 1883
        assert config.client_id == "forge-ot"
        assert config.reconnect_enabled is True
        assert config.buffer_max_size == 10_000

    def test_custom(self):
        config = MqttConfig(host="broker.local", port=8883, use_tls=True)
        assert config.host == "broker.local"
        assert config.use_tls is True


# ---------------------------------------------------------------------------
# StubMqttClient
# ---------------------------------------------------------------------------


class TestStubClient:

    @pytest.mark.asyncio
    async def test_connect_disconnect(self):
        client = _StubMqttClient()
        await client.connect()
        assert client._connected is True
        await client.disconnect()
        assert client._connected is False

    @pytest.mark.asyncio
    async def test_publish_records(self):
        client = _StubMqttClient()
        await client.connect()
        await client.publish("test/topic", b"hello", qos=1, retain=True)
        assert len(client.published) == 1
        assert client.published[0]["topic"] == "test/topic"
        assert client.published[0]["qos"] == 1

    @pytest.mark.asyncio
    async def test_publish_not_connected_raises(self):
        client = _StubMqttClient()
        with pytest.raises(ConnectionError):
            await client.publish("test", b"data")


# ---------------------------------------------------------------------------
# Publisher lifecycle
# ---------------------------------------------------------------------------


class TestPublisherLifecycle:

    @pytest.mark.asyncio
    async def test_start_connects(self):
        pub = OTMqttPublisher(MqttConfig(reconnect_enabled=False))
        await pub.start()
        assert pub.is_started is True
        assert pub.is_connected is True
        await pub.stop()
        assert pub.is_started is False

    @pytest.mark.asyncio
    async def test_start_idempotent(self):
        pub = OTMqttPublisher(MqttConfig(reconnect_enabled=False))
        await pub.start()
        await pub.start()  # Should not raise
        assert pub.is_connected is True
        await pub.stop()

    @pytest.mark.asyncio
    async def test_stop_disconnects(self):
        pub = OTMqttPublisher(MqttConfig(reconnect_enabled=False))
        await pub.start()
        await pub.stop()
        assert pub.is_connected is False
        assert pub.is_started is False


# ---------------------------------------------------------------------------
# Publish
# ---------------------------------------------------------------------------


class TestPublish:

    @pytest.mark.asyncio
    async def test_publish_string(self):
        pub = OTMqttPublisher(MqttConfig(reconnect_enabled=False))
        await pub.start()
        result = await pub.publish("test/topic", "hello")
        assert result is True
        assert pub.publish_count == 1
        await pub.stop()

    @pytest.mark.asyncio
    async def test_publish_dict(self):
        pub = OTMqttPublisher(MqttConfig(reconnect_enabled=False))
        await pub.start()
        result = await pub.publish("test/topic", {"value": 78.4})
        assert result is True
        # Verify it was serialized
        msg = pub._client.published[0]
        data = json.loads(msg["payload"])
        assert data["value"] == 78.4
        await pub.stop()

    @pytest.mark.asyncio
    async def test_publish_bytes(self):
        pub = OTMqttPublisher(MqttConfig(reconnect_enabled=False))
        await pub.start()
        result = await pub.publish("test/topic", b"\x00\x01\x02")
        assert result is True
        assert pub._client.published[0]["payload"] == b"\x00\x01\x02"
        await pub.stop()

    @pytest.mark.asyncio
    async def test_publish_with_qos_and_retain(self):
        pub = OTMqttPublisher(MqttConfig(reconnect_enabled=False))
        await pub.start()
        await pub.publish("health/plc1", "ok", qos=1, retain=True)
        msg = pub._client.published[0]
        assert msg["qos"] == 1
        assert msg["retain"] is True
        await pub.stop()


# ---------------------------------------------------------------------------
# Buffering
# ---------------------------------------------------------------------------


class TestBuffering:

    @pytest.mark.asyncio
    async def test_publish_when_disconnected_buffers(self):
        pub = OTMqttPublisher(MqttConfig(reconnect_enabled=False))
        # Don't start — not connected
        result = await pub.publish("test/topic", "hello")
        assert result is False
        assert pub.buffer_size == 1

    @pytest.mark.asyncio
    async def test_buffer_limit(self):
        pub = OTMqttPublisher(MqttConfig(reconnect_enabled=False, buffer_max_size=5))
        for i in range(10):
            await pub.publish("test/topic", f"msg-{i}")
        assert pub.buffer_size == 5  # Oldest evicted

    @pytest.mark.asyncio
    async def test_buffer_drained_on_connect(self):
        pub = OTMqttPublisher(MqttConfig(reconnect_enabled=False))
        # Buffer some messages while not connected
        await pub.publish("topic/1", "a")
        await pub.publish("topic/2", "b")
        assert pub.buffer_size == 2

        # Now connect — buffer should drain
        await pub.start()
        assert pub.buffer_size == 0
        assert pub.publish_count == 2
        await pub.stop()


# ---------------------------------------------------------------------------
# Callbacks
# ---------------------------------------------------------------------------


class TestCallbacks:

    @pytest.mark.asyncio
    async def test_on_connect_callback(self):
        called = []
        pub = OTMqttPublisher(MqttConfig(reconnect_enabled=False))
        pub.on_connect(lambda: called.append("connected"))
        await pub.start()
        assert "connected" in called
        await pub.stop()

    @pytest.mark.asyncio
    async def test_on_disconnect_callback(self):
        called = []
        pub = OTMqttPublisher(MqttConfig(reconnect_enabled=False))
        pub.on_disconnect(lambda: called.append("disconnected"))
        await pub.start()
        await pub.stop()
        assert "disconnected" in called


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------


class TestPublisherStatus:

    @pytest.mark.asyncio
    async def test_status_fields(self):
        pub = OTMqttPublisher(MqttConfig(reconnect_enabled=False))
        await pub.start()
        await pub.publish("t", "v")

        status = pub.get_status()
        assert status["connected"] is True
        assert status["started"] is True
        assert status["publish_count"] == 1
        assert status["buffer_size"] == 0
        assert "broker" in status
        await pub.stop()
