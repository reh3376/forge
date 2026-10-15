"""Tests for OTMqttPublisher — connection lifecycle, publish, buffering."""

import json

import pytest

from forge.modules.ot.mqtt.publisher import (
    MqttConfig,
    OTMqttPublisher,
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


# ---------------------------------------------------------------------------
# External broker mode (FB-067)
# ---------------------------------------------------------------------------


class _FakeExternalClient:
    def __init__(self, config: MqttConfig) -> None:
        self.config = config
        self.connected = False
        self.published: list[dict] = []
        self.refuse = False

    async def connect(self) -> None:
        if self.refuse:
            raise ConnectionError("refused")
        self.connected = True

    async def disconnect(self) -> None:
        self.connected = False

    async def publish(self, topic, payload, qos=0, retain=False) -> None:
        if not self.connected:
            raise ConnectionError("Not connected")
        self.published.append({"topic": topic, "payload": payload, "qos": qos, "retain": retain})


class TestExternalMode:
    @pytest.mark.asyncio
    async def test_factory_client_is_used_and_driven_by_the_lifecycle(self):
        made: list[_FakeExternalClient] = []

        def factory(config: MqttConfig) -> _FakeExternalClient:
            made.append(_FakeExternalClient(config))
            return made[-1]

        pub = OTMqttPublisher(
            MqttConfig(
                host="broker.local", port=8883, client_id="ot-pub", broker_mode="external",
                reconnect_enabled=False, _client_factory=factory,
            )
        )
        await pub.start()
        assert pub.is_connected and made[0].connected and made[0].config.host == "broker.local"
        await pub.publish(
            "whk/whk01/cooker/equipment/cipState", {"state": "Running"}, qos=1, retain=True
        )
        assert made[0].published[0]["topic"] == "whk/whk01/cooker/equipment/cipState"
        assert made[0].published[0]["retain"] is True
        await pub.stop()
        assert not made[0].connected and not pub.is_connected

    @pytest.mark.asyncio
    async def test_refused_connection_is_reported_not_stubbed(self):
        def factory(config: MqttConfig) -> _FakeExternalClient:
            client = _FakeExternalClient(config)
            client.refuse = True
            return client

        pub = OTMqttPublisher(
            MqttConfig(broker_mode="external", reconnect_enabled=False, _client_factory=factory)
        )
        await pub.start()
        assert not pub.is_connected and pub.error_count == 1
        assert await pub.publish("t", b"x") is False and pub.buffer_size == 1  # buffered, not lost
        await pub.stop()

    @pytest.mark.asyncio
    async def test_aiomqtt_client_builds_from_config(self, monkeypatch):
        import sys
        import types

        from forge.modules.ot.mqtt.publisher import _AiomqttClient, _create_mqtt_client

        calls: dict = {}

        class FakeClient:
            def __init__(self, **kwargs):
                calls["kwargs"] = kwargs
                self.entered = False
                self.published = []

            async def __aenter__(self):
                self.entered = True
                return self

            async def __aexit__(self, *exc):
                self.entered = False

            async def publish(self, topic, payload, qos=0, retain=False):
                self.published.append((topic, payload, qos, retain))

        class TLSParameters:
            def __init__(self, **kwargs):
                calls["tls"] = kwargs

        class Will:
            def __init__(self, topic, payload=None, qos=0, retain=False):
                calls["will"] = (topic, payload, qos, retain)

        monkeypatch.setitem(
            sys.modules, "aiomqtt",
            types.SimpleNamespace(Client=FakeClient, TLSParameters=TLSParameters, Will=Will),
        )
        config = MqttConfig(
            host="broker.local", port=8883, username="ot", password="pw", client_id="ot-pub",
            use_tls=True, ca_certs="/ca.pem", will_topic="whk/whk01/ot/status",
            will_payload="offline", broker_mode="external",
        )
        client = _create_mqtt_client(config)
        assert isinstance(client, _AiomqttClient) and not client.is_connected
        await client.connect()
        assert client.is_connected
        assert calls["kwargs"]["hostname"] == "broker.local" and calls["kwargs"]["port"] == 8883
        assert calls["kwargs"]["identifier"] == "ot-pub" and calls["kwargs"]["username"] == "ot"
        assert calls["tls"]["ca_certs"] == "/ca.pem" and calls["tls"]["certfile"] is None
        assert calls["will"] == ("whk/whk01/ot/status", b"offline", 1, True)
        await client.publish("t", b"x", qos=1, retain=False)
        assert calls["kwargs"]  # built once
        await client.disconnect()
        assert not client.is_connected
        await client.disconnect()  # idempotent

    @pytest.mark.asyncio
    async def test_missing_aiomqtt_is_a_visible_error(self, monkeypatch):
        import sys

        from forge.modules.ot.mqtt.publisher import _AiomqttClient

        monkeypatch.setitem(sys.modules, "aiomqtt", None)  # import raises ImportError
        client = _AiomqttClient(MqttConfig(broker_mode="external"))
        with pytest.raises(RuntimeError, match="aiomqtt"):
            await client.connect()
        with pytest.raises(ConnectionError):
            await client.publish("t", b"x")
        pub = OTMqttPublisher(MqttConfig(broker_mode="external", reconnect_enabled=False))
        await pub.start()
        assert not pub.is_connected and pub.error_count == 1
        await pub.stop()
