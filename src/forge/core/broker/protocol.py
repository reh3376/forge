"""MQTT 3.1.1 protocol codec — packet encoding and decoding.

Implements the binary wire format for MQTT 3.1.1 (OASIS Standard).
Only the packet types needed for broker operation are implemented:
CONNECT, CONNACK, PUBLISH, PUBACK, SUBSCRIBE, SUBACK, UNSUBSCRIBE,
UNSUBACK, PINGREQ, PINGRESP, DISCONNECT.

Reference: http://docs.oasis-open.org/mqtt/mqtt/v3.1.1/os/mqtt-v3.1.1-os.html
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field
from enum import IntEnum
from typing import Any


# ---------------------------------------------------------------------------
# Packet types (4-bit, upper nibble of byte 1)
# ---------------------------------------------------------------------------


class PacketType(IntEnum):
    CONNECT = 1
    CONNACK = 2
    PUBLISH = 3
    PUBACK = 4
    SUBSCRIBE = 8
    SUBACK = 9
    UNSUBSCRIBE = 10
    UNSUBACK = 11
    PINGREQ = 12
    PINGRESP = 13
    DISCONNECT = 14


# ---------------------------------------------------------------------------
# Connect return codes
# ---------------------------------------------------------------------------


class ConnectReturnCode(IntEnum):
    ACCEPTED = 0
    UNACCEPTABLE_PROTOCOL = 1
    IDENTIFIER_REJECTED = 2
    SERVER_UNAVAILABLE = 3
    BAD_CREDENTIALS = 4
    NOT_AUTHORIZED = 5


# ---------------------------------------------------------------------------
# Parsed packet types
# ---------------------------------------------------------------------------


@dataclass
class ConnectPacket:
    client_id: str = ""
    protocol_name: str = "MQTT"
    protocol_level: int = 4  # MQTT 3.1.1
    clean_session: bool = True
    keepalive: int = 60
    username: str = ""
    password: str = ""
    will_topic: str = ""
    will_message: bytes = b""
    will_qos: int = 0
    will_retain: bool = False
    has_will: bool = False
    has_username: bool = False
    has_password: bool = False


@dataclass
class PublishPacket:
    topic: str = ""
    payload: bytes = b""
    qos: int = 0
    retain: bool = False
    dup: bool = False
    packet_id: int = 0


@dataclass
class SubscribeRequest:
    topic_filter: str = ""
    qos: int = 0


@dataclass
class SubscribePacket:
    packet_id: int = 0
    subscriptions: list[SubscribeRequest] = field(default_factory=list)


@dataclass
class UnsubscribePacket:
    packet_id: int = 0
    topic_filters: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Remaining length encoding/decoding (variable-length integer)
# ---------------------------------------------------------------------------


def encode_remaining_length(length: int) -> bytes:
    """Encode a remaining length value (up to 268,435,455)."""
    result = bytearray()
    while True:
        byte = length % 128
        length //= 128
        if length > 0:
            byte |= 0x80
        result.append(byte)
        if length == 0:
            break
    return bytes(result)


def decode_remaining_length(data: bytes, offset: int = 0) -> tuple[int, int]:
    """Decode remaining length from bytes.

    Returns (value, bytes_consumed).
    """
    multiplier = 1
    value = 0
    index = offset
    while True:
        if index >= len(data):
            raise ValueError("Incomplete remaining length")
        encoded_byte = data[index]
        value += (encoded_byte & 0x7F) * multiplier
        multiplier *= 128
        index += 1
        if (encoded_byte & 0x80) == 0:
            break
        if multiplier > 128 * 128 * 128:
            raise ValueError("Malformed remaining length")
    return value, index - offset


# ---------------------------------------------------------------------------
# UTF-8 string encoding/decoding (length-prefixed)
# ---------------------------------------------------------------------------


def encode_utf8(s: str) -> bytes:
    """Encode a UTF-8 string with 2-byte length prefix."""
    encoded = s.encode("utf-8")
    return struct.pack("!H", len(encoded)) + encoded


def decode_utf8(data: bytes, offset: int = 0) -> tuple[str, int]:
    """Decode a length-prefixed UTF-8 string.

    Returns (string, bytes_consumed).
    """
    if offset + 2 > len(data):
        raise ValueError("Incomplete string length")
    length = struct.unpack_from("!H", data, offset)[0]
    offset += 2
    if offset + length > len(data):
        raise ValueError("Incomplete string data")
    return data[offset:offset + length].decode("utf-8"), 2 + length


# ---------------------------------------------------------------------------
# Packet decoders
# ---------------------------------------------------------------------------


def decode_connect(data: bytes) -> ConnectPacket:
    """Decode CONNECT packet payload (after fixed header)."""
    pkt = ConnectPacket()
    offset = 0

    # Protocol name
    pkt.protocol_name, consumed = decode_utf8(data, offset)
    offset += consumed

    # Protocol level
    if offset >= len(data):
        raise ValueError("Incomplete CONNECT")
    pkt.protocol_level = data[offset]
    offset += 1

    # Connect flags
    if offset >= len(data):
        raise ValueError("Incomplete CONNECT flags")
    flags = data[offset]
    offset += 1

    pkt.clean_session = bool(flags & 0x02)
    pkt.has_will = bool(flags & 0x04)
    pkt.will_qos = (flags >> 3) & 0x03
    pkt.will_retain = bool(flags & 0x20)
    pkt.has_password = bool(flags & 0x40)
    pkt.has_username = bool(flags & 0x80)

    # Keepalive
    if offset + 2 > len(data):
        raise ValueError("Incomplete keepalive")
    pkt.keepalive = struct.unpack_from("!H", data, offset)[0]
    offset += 2

    # Client ID
    pkt.client_id, consumed = decode_utf8(data, offset)
    offset += consumed

    # Will topic + message
    if pkt.has_will:
        pkt.will_topic, consumed = decode_utf8(data, offset)
        offset += consumed
        # Will message (binary, length-prefixed)
        if offset + 2 > len(data):
            raise ValueError("Incomplete will message")
        msg_len = struct.unpack_from("!H", data, offset)[0]
        offset += 2
        pkt.will_message = data[offset:offset + msg_len]
        offset += msg_len

    # Username
    if pkt.has_username:
        pkt.username, consumed = decode_utf8(data, offset)
        offset += consumed

    # Password
    if pkt.has_password:
        pkt.password, consumed = decode_utf8(data, offset)
        offset += consumed

    return pkt


def decode_publish(header_byte: int, data: bytes) -> PublishPacket:
    """Decode PUBLISH packet from header byte + remaining payload."""
    pkt = PublishPacket()
    pkt.dup = bool(header_byte & 0x08)
    pkt.qos = (header_byte >> 1) & 0x03
    pkt.retain = bool(header_byte & 0x01)

    offset = 0

    # Topic name
    pkt.topic, consumed = decode_utf8(data, offset)
    offset += consumed

    # Packet ID (only for QoS > 0)
    if pkt.qos > 0:
        if offset + 2 > len(data):
            raise ValueError("Incomplete packet ID")
        pkt.packet_id = struct.unpack_from("!H", data, offset)[0]
        offset += 2

    # Payload
    pkt.payload = data[offset:]
    return pkt


def decode_subscribe(data: bytes) -> SubscribePacket:
    """Decode SUBSCRIBE packet payload."""
    pkt = SubscribePacket()
    offset = 0

    # Packet ID
    if offset + 2 > len(data):
        raise ValueError("Incomplete SUBSCRIBE")
    pkt.packet_id = struct.unpack_from("!H", data, offset)[0]
    offset += 2

    # Subscription list
    while offset < len(data):
        topic_filter, consumed = decode_utf8(data, offset)
        offset += consumed
        if offset >= len(data):
            raise ValueError("Incomplete QoS byte")
        qos = data[offset]
        offset += 1
        pkt.subscriptions.append(SubscribeRequest(topic_filter=topic_filter, qos=qos))

    return pkt


def decode_unsubscribe(data: bytes) -> UnsubscribePacket:
    """Decode UNSUBSCRIBE packet payload."""
    pkt = UnsubscribePacket()
    offset = 0

    pkt.packet_id = struct.unpack_from("!H", data, offset)[0]
    offset += 2

    while offset < len(data):
        topic_filter, consumed = decode_utf8(data, offset)
        offset += consumed
        pkt.topic_filters.append(topic_filter)

    return pkt


# ---------------------------------------------------------------------------
# Packet encoders (broker → client)
# ---------------------------------------------------------------------------


def encode_connack(session_present: bool, return_code: ConnectReturnCode) -> bytes:
    """Encode CONNACK packet."""
    header = (PacketType.CONNACK << 4)
    flags = 0x01 if session_present else 0x00
    payload = bytes([flags, int(return_code)])
    return bytes([header]) + encode_remaining_length(len(payload)) + payload


def encode_publish(
    topic: str,
    payload: bytes,
    qos: int = 0,
    retain: bool = False,
    dup: bool = False,
    packet_id: int = 0,
) -> bytes:
    """Encode PUBLISH packet."""
    header = (PacketType.PUBLISH << 4)
    if dup:
        header |= 0x08
    header |= (qos & 0x03) << 1
    if retain:
        header |= 0x01

    body = encode_utf8(topic)
    if qos > 0:
        body += struct.pack("!H", packet_id)
    body += payload

    return bytes([header]) + encode_remaining_length(len(body)) + body


def encode_puback(packet_id: int) -> bytes:
    """Encode PUBACK packet."""
    header = (PacketType.PUBACK << 4)
    body = struct.pack("!H", packet_id)
    return bytes([header]) + encode_remaining_length(len(body)) + body


def encode_suback(packet_id: int, granted_qos: list[int]) -> bytes:
    """Encode SUBACK packet."""
    header = (PacketType.SUBACK << 4)
    body = struct.pack("!H", packet_id)
    body += bytes(granted_qos)
    return bytes([header]) + encode_remaining_length(len(body)) + body


def encode_unsuback(packet_id: int) -> bytes:
    """Encode UNSUBACK packet."""
    header = (PacketType.UNSUBACK << 4)
    body = struct.pack("!H", packet_id)
    return bytes([header]) + encode_remaining_length(len(body)) + body


def encode_pingresp() -> bytes:
    """Encode PINGRESP packet."""
    return bytes([(PacketType.PINGRESP << 4), 0x00])


# ---------------------------------------------------------------------------
# Fixed header reader
# ---------------------------------------------------------------------------


async def read_packet(reader) -> tuple[int, bytes] | None:
    """Read a complete MQTT packet from an asyncio.StreamReader.

    Returns (header_byte, remaining_data) or None on EOF.
    """
    # Read first byte (packet type + flags)
    header_data = await reader.read(1)
    if not header_data:
        return None
    header_byte = header_data[0]

    # Read remaining length (variable-length encoding)
    remaining_length = 0
    multiplier = 1
    for _ in range(4):
        byte_data = await reader.read(1)
        if not byte_data:
            return None
        encoded_byte = byte_data[0]
        remaining_length += (encoded_byte & 0x7F) * multiplier
        multiplier *= 128
        if (encoded_byte & 0x80) == 0:
            break
    else:
        return None  # Malformed

    # Read remaining payload
    if remaining_length > 0:
        data = await reader.readexactly(remaining_length)
    else:
        data = b""

    return header_byte, data
