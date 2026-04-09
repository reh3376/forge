"""Tests for MQTT 3.1.1 protocol codec — encoding and decoding."""

import struct
import pytest

from forge.core.broker.protocol import (
    PacketType,
    ConnectReturnCode,
    ConnectPacket,
    PublishPacket,
    SubscribePacket,
    SubscribeRequest,
    UnsubscribePacket,
    encode_remaining_length,
    decode_remaining_length,
    encode_utf8,
    decode_utf8,
    decode_connect,
    decode_publish,
    decode_subscribe,
    decode_unsubscribe,
    encode_connack,
    encode_publish,
    encode_puback,
    encode_suback,
    encode_unsuback,
    encode_pingresp,
)


# ---------------------------------------------------------------------------
# Remaining length encoding
# ---------------------------------------------------------------------------


class TestRemainingLength:

    def test_encode_zero(self):
        assert encode_remaining_length(0) == b"\x00"

    def test_encode_127(self):
        assert encode_remaining_length(127) == b"\x7f"

    def test_encode_128(self):
        # 128 = 0x00 (with continuation) + 0x01
        assert encode_remaining_length(128) == b"\x80\x01"

    def test_encode_16383(self):
        assert encode_remaining_length(16383) == b"\xff\x7f"

    def test_roundtrip_small(self):
        for i in [0, 1, 127, 128, 255, 16383, 16384, 2097151, 268435455]:
            encoded = encode_remaining_length(i)
            decoded, consumed = decode_remaining_length(encoded)
            assert decoded == i, f"Roundtrip failed for {i}"
            assert consumed == len(encoded)

    def test_decode_offset(self):
        data = b"\xFF" + encode_remaining_length(300)
        val, consumed = decode_remaining_length(data, offset=1)
        assert val == 300


# ---------------------------------------------------------------------------
# UTF-8 string encoding
# ---------------------------------------------------------------------------


class TestUtf8Encoding:

    def test_encode_empty(self):
        assert encode_utf8("") == b"\x00\x00"

    def test_encode_hello(self):
        result = encode_utf8("hello")
        assert result == b"\x00\x05hello"

    def test_roundtrip(self):
        for s in ["", "a", "hello", "whk/whk01/ot/tags/TIT/Out_PV", "日本語"]:
            encoded = encode_utf8(s)
            decoded, consumed = decode_utf8(encoded)
            assert decoded == s
            assert consumed == len(encoded)

    def test_decode_offset(self):
        prefix = b"\xFF\xFF"
        data = prefix + encode_utf8("test")
        s, consumed = decode_utf8(data, offset=2)
        assert s == "test"


# ---------------------------------------------------------------------------
# CONNECT decoding
# ---------------------------------------------------------------------------


class TestDecodeConnect:

    def _build_connect(
        self,
        client_id: str = "test-client",
        clean_session: bool = True,
        keepalive: int = 60,
        username: str = "",
        password: str = "",
    ) -> bytes:
        """Build a CONNECT packet payload (without fixed header)."""
        data = bytearray()
        # Protocol name
        data.extend(encode_utf8("MQTT"))
        # Protocol level
        data.append(4)
        # Flags
        flags = 0
        if clean_session:
            flags |= 0x02
        if username:
            flags |= 0x80
        if password:
            flags |= 0x40
        data.append(flags)
        # Keepalive
        data.extend(struct.pack("!H", keepalive))
        # Client ID
        data.extend(encode_utf8(client_id))
        # Username
        if username:
            data.extend(encode_utf8(username))
        # Password
        if password:
            data.extend(encode_utf8(password))
        return bytes(data)

    def test_basic_connect(self):
        data = self._build_connect(client_id="my-client", keepalive=30)
        pkt = decode_connect(data)
        assert pkt.client_id == "my-client"
        assert pkt.protocol_name == "MQTT"
        assert pkt.protocol_level == 4
        assert pkt.keepalive == 30
        assert pkt.clean_session is True

    def test_connect_with_credentials(self):
        data = self._build_connect(username="admin", password="secret")
        pkt = decode_connect(data)
        assert pkt.has_username is True
        assert pkt.username == "admin"
        assert pkt.has_password is True
        assert pkt.password == "secret"

    def test_connect_no_clean_session(self):
        data = self._build_connect(clean_session=False)
        pkt = decode_connect(data)
        assert pkt.clean_session is False


# ---------------------------------------------------------------------------
# PUBLISH decoding
# ---------------------------------------------------------------------------


class TestDecodePublish:

    def test_qos0_no_packet_id(self):
        data = encode_utf8("test/topic") + b"hello"
        header = (PacketType.PUBLISH << 4)  # QoS 0, no retain
        pkt = decode_publish(header, data)
        assert pkt.topic == "test/topic"
        assert pkt.payload == b"hello"
        assert pkt.qos == 0
        assert pkt.packet_id == 0

    def test_qos1_has_packet_id(self):
        data = encode_utf8("test/topic") + struct.pack("!H", 42) + b"world"
        header = (PacketType.PUBLISH << 4) | 0x02  # QoS 1
        pkt = decode_publish(header, data)
        assert pkt.qos == 1
        assert pkt.packet_id == 42
        assert pkt.payload == b"world"

    def test_retain_flag(self):
        data = encode_utf8("test/topic") + b""
        header = (PacketType.PUBLISH << 4) | 0x01  # retain
        pkt = decode_publish(header, data)
        assert pkt.retain is True

    def test_dup_flag(self):
        data = encode_utf8("test/topic") + b""
        header = (PacketType.PUBLISH << 4) | 0x08  # dup
        pkt = decode_publish(header, data)
        assert pkt.dup is True

    def test_empty_payload(self):
        data = encode_utf8("test/topic")
        header = (PacketType.PUBLISH << 4)
        pkt = decode_publish(header, data)
        assert pkt.payload == b""


# ---------------------------------------------------------------------------
# SUBSCRIBE decoding
# ---------------------------------------------------------------------------


class TestDecodeSubscribe:

    def test_single_subscription(self):
        data = struct.pack("!H", 1) + encode_utf8("test/#") + b"\x01"
        pkt = decode_subscribe(data)
        assert pkt.packet_id == 1
        assert len(pkt.subscriptions) == 1
        assert pkt.subscriptions[0].topic_filter == "test/#"
        assert pkt.subscriptions[0].qos == 1

    def test_multiple_subscriptions(self):
        data = struct.pack("!H", 5)
        data += encode_utf8("a/b") + b"\x00"
        data += encode_utf8("c/+/d") + b"\x01"
        pkt = decode_subscribe(data)
        assert pkt.packet_id == 5
        assert len(pkt.subscriptions) == 2


# ---------------------------------------------------------------------------
# UNSUBSCRIBE decoding
# ---------------------------------------------------------------------------


class TestDecodeUnsubscribe:

    def test_unsubscribe(self):
        data = struct.pack("!H", 3) + encode_utf8("test/#") + encode_utf8("other/+")
        pkt = decode_unsubscribe(data)
        assert pkt.packet_id == 3
        assert pkt.topic_filters == ["test/#", "other/+"]


# ---------------------------------------------------------------------------
# Packet encoders
# ---------------------------------------------------------------------------


class TestEncoders:

    def test_connack_accepted(self):
        data = encode_connack(False, ConnectReturnCode.ACCEPTED)
        assert data[0] == (PacketType.CONNACK << 4)
        assert data[2] == 0  # session present = false
        assert data[3] == 0  # return code = accepted

    def test_connack_session_present(self):
        data = encode_connack(True, ConnectReturnCode.ACCEPTED)
        assert data[2] == 1  # session present = true

    def test_connack_bad_credentials(self):
        data = encode_connack(False, ConnectReturnCode.BAD_CREDENTIALS)
        assert data[3] == 4

    def test_publish_qos0(self):
        data = encode_publish("test/topic", b"hello", qos=0)
        assert data[0] == (PacketType.PUBLISH << 4)
        # Should contain topic + payload, no packet ID
        assert b"hello" in data

    def test_publish_qos1_with_packet_id(self):
        data = encode_publish("test/topic", b"hello", qos=1, packet_id=42)
        assert data[0] & 0x06 == 0x02  # QoS 1 bits

    def test_publish_retain(self):
        data = encode_publish("test/topic", b"", retain=True)
        assert data[0] & 0x01 == 1

    def test_puback(self):
        data = encode_puback(42)
        assert data[0] == (PacketType.PUBACK << 4)
        assert struct.unpack_from("!H", data, 2)[0] == 42

    def test_suback(self):
        data = encode_suback(10, [0, 1, 0])
        assert data[0] == (PacketType.SUBACK << 4)
        assert struct.unpack_from("!H", data, 2)[0] == 10
        assert data[4:7] == bytes([0, 1, 0])

    def test_unsuback(self):
        data = encode_unsuback(7)
        assert data[0] == (PacketType.UNSUBACK << 4)
        assert struct.unpack_from("!H", data, 2)[0] == 7

    def test_pingresp(self):
        data = encode_pingresp()
        assert data[0] == (PacketType.PINGRESP << 4)
        assert data[1] == 0
