"""MqttSession — per-client connection handler.

Each TCP connection gets an MqttSession that:
  1. Reads MQTT packets from the client
  2. Decodes them via the protocol module
  3. Dispatches to the appropriate handler (CONNECT, PUBLISH, etc.)
  4. Writes response packets back to the client

The session runs as an asyncio task for the lifetime of the connection.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable, TYPE_CHECKING

from forge.core.broker.protocol import (
    PacketType,
    ConnectReturnCode,
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
    read_packet,
)

if TYPE_CHECKING:
    from forge.core.broker.broker import ForgeMqttBroker

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Session state
# ---------------------------------------------------------------------------


class SessionState:
    CONNECTING = "connecting"
    CONNECTED = "connected"
    DISCONNECTING = "disconnecting"
    DISCONNECTED = "disconnected"


# ---------------------------------------------------------------------------
# MqttSession
# ---------------------------------------------------------------------------


class MqttSession:
    """Handles one MQTT client connection.

    Created by the broker's TCP listener for each accepted connection.
    The session runs until the client disconnects or a protocol error
    occurs.
    """

    def __init__(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
        broker: ForgeMqttBroker,
    ) -> None:
        self._reader = reader
        self._writer = writer
        self._broker = broker

        self.client_id: str = ""
        self.state: str = SessionState.CONNECTING
        self.clean_session: bool = True
        self.keepalive: int = 60
        self.username: str = ""

        # Will message
        self.will_topic: str = ""
        self.will_message: bytes = b""
        self.will_qos: int = 0
        self.will_retain: bool = False
        self.has_will: bool = False

        # Metrics
        self.connected_at: float = 0.0
        self.last_activity: float = 0.0
        self.packets_received: int = 0
        self.packets_sent: int = 0
        self.messages_received: int = 0
        self.messages_sent: int = 0

        # Packet ID for QoS 1 outbound
        self._next_packet_id: int = 1

        # Pending QoS 1 acknowledgements
        self._pending_acks: dict[int, float] = {}

    def _allocate_packet_id(self) -> int:
        """Get next packet ID (wraps at 65535)."""
        pid = self._next_packet_id
        self._next_packet_id = (self._next_packet_id % 65535) + 1
        return pid

    # ------------------------------------------------------------------
    # Main session loop
    # ------------------------------------------------------------------

    async def run(self) -> None:
        """Main session loop — read and process packets until disconnect."""
        try:
            # First packet MUST be CONNECT
            result = await asyncio.wait_for(
                read_packet(self._reader),
                timeout=10.0,  # 10s to receive CONNECT
            )
            if result is None:
                return

            header_byte, data = result
            pkt_type = (header_byte >> 4) & 0x0F

            if pkt_type != PacketType.CONNECT:
                logger.warning("First packet was not CONNECT (got %d)", pkt_type)
                return

            if not await self._handle_connect(data):
                return

            # Main packet loop
            while self.state == SessionState.CONNECTED:
                try:
                    timeout = self.keepalive * 1.5 if self.keepalive > 0 else None
                    result = await asyncio.wait_for(
                        read_packet(self._reader),
                        timeout=timeout,
                    )
                except asyncio.TimeoutError:
                    logger.info("Client %s keepalive timeout", self.client_id)
                    break

                if result is None:
                    break  # EOF

                header_byte, data = result
                self.packets_received += 1
                self.last_activity = time.time()

                pkt_type = (header_byte >> 4) & 0x0F
                await self._dispatch(pkt_type, header_byte, data)

        except asyncio.IncompleteReadError:
            logger.debug("Client %s incomplete read (disconnected)", self.client_id)
        except ConnectionResetError:
            logger.debug("Client %s connection reset", self.client_id)
        except Exception as exc:
            logger.error("Session %s error: %s", self.client_id, exc)
        finally:
            await self._cleanup()

    # ------------------------------------------------------------------
    # Packet dispatch
    # ------------------------------------------------------------------

    async def _dispatch(self, pkt_type: int, header_byte: int, data: bytes) -> None:
        """Route a packet to the appropriate handler."""
        if pkt_type == PacketType.PUBLISH:
            await self._handle_publish(header_byte, data)
        elif pkt_type == PacketType.PUBACK:
            self._handle_puback(data)
        elif pkt_type == PacketType.SUBSCRIBE:
            await self._handle_subscribe(data)
        elif pkt_type == PacketType.UNSUBSCRIBE:
            await self._handle_unsubscribe(data)
        elif pkt_type == PacketType.PINGREQ:
            await self._handle_pingreq()
        elif pkt_type == PacketType.DISCONNECT:
            await self._handle_disconnect()
        else:
            logger.warning("Client %s sent unknown packet type %d", self.client_id, pkt_type)

    # ------------------------------------------------------------------
    # CONNECT
    # ------------------------------------------------------------------

    async def _handle_connect(self, data: bytes) -> bool:
        """Handle CONNECT packet. Returns True if connection accepted."""
        pkt = decode_connect(data)

        # Validate protocol
        if pkt.protocol_level != 4:  # MQTT 3.1.1
            await self._send(encode_connack(False, ConnectReturnCode.UNACCEPTABLE_PROTOCOL))
            return False

        # Validate client ID
        if not pkt.client_id and not pkt.clean_session:
            await self._send(encode_connack(False, ConnectReturnCode.IDENTIFIER_REJECTED))
            return False

        # Generate client ID if empty (clean session)
        self.client_id = pkt.client_id or f"forge-auto-{id(self):x}"
        self.clean_session = pkt.clean_session
        self.keepalive = pkt.keepalive
        self.username = pkt.username

        # Will message
        self.has_will = pkt.has_will
        self.will_topic = pkt.will_topic
        self.will_message = pkt.will_message
        self.will_qos = pkt.will_qos
        self.will_retain = pkt.will_retain

        # Authentication
        if not self._broker.authenticate(pkt.username, pkt.password):
            await self._send(encode_connack(False, ConnectReturnCode.BAD_CREDENTIALS))
            return False

        # Register with broker
        session_present = self._broker.register_session(self)

        # Accept
        await self._send(encode_connack(session_present, ConnectReturnCode.ACCEPTED))
        self.state = SessionState.CONNECTED
        self.connected_at = time.time()
        self.last_activity = time.time()

        logger.info(
            "Client %s connected (keepalive=%ds, clean=%s)",
            self.client_id, self.keepalive, self.clean_session,
        )
        return True

    # ------------------------------------------------------------------
    # PUBLISH
    # ------------------------------------------------------------------

    async def _handle_publish(self, header_byte: int, data: bytes) -> None:
        """Handle incoming PUBLISH from client."""
        pkt = decode_publish(header_byte, data)
        self.messages_received += 1

        # QoS 1: send PUBACK
        if pkt.qos == 1:
            await self._send(encode_puback(pkt.packet_id))

        # Delegate to broker for fan-out
        await self._broker.handle_publish(
            topic=pkt.topic,
            payload=pkt.payload,
            qos=pkt.qos,
            retain=pkt.retain,
            sender_id=self.client_id,
        )

    # ------------------------------------------------------------------
    # PUBACK
    # ------------------------------------------------------------------

    def _handle_puback(self, data: bytes) -> None:
        """Handle PUBACK (client acknowledges our QoS 1 publish)."""
        if len(data) >= 2:
            import struct
            packet_id = struct.unpack_from("!H", data)[0]
            self._pending_acks.pop(packet_id, None)

    # ------------------------------------------------------------------
    # SUBSCRIBE
    # ------------------------------------------------------------------

    async def _handle_subscribe(self, data: bytes) -> None:
        """Handle SUBSCRIBE and send SUBACK."""
        pkt = decode_subscribe(data)
        granted = []

        for sub in pkt.subscriptions:
            qos = self._broker.topic_engine.subscribe(
                self.client_id, sub.topic_filter, sub.qos,
            )
            granted.append(qos)

            # Send retained messages for this filter
            retained = self._broker.topic_engine.get_retained_for(sub.topic_filter)
            for msg in retained:
                effective_qos = min(msg.qos, qos)
                await self.deliver(msg.topic, msg.payload, effective_qos, retain=True)

        await self._send(encode_suback(pkt.packet_id, granted))

    # ------------------------------------------------------------------
    # UNSUBSCRIBE
    # ------------------------------------------------------------------

    async def _handle_unsubscribe(self, data: bytes) -> None:
        """Handle UNSUBSCRIBE and send UNSUBACK."""
        pkt = decode_unsubscribe(data)

        for topic_filter in pkt.topic_filters:
            self._broker.topic_engine.unsubscribe(self.client_id, topic_filter)

        await self._send(encode_unsuback(pkt.packet_id))

    # ------------------------------------------------------------------
    # PINGREQ / DISCONNECT
    # ------------------------------------------------------------------

    async def _handle_pingreq(self) -> None:
        """Handle PINGREQ — respond with PINGRESP."""
        await self._send(encode_pingresp())

    async def _handle_disconnect(self) -> None:
        """Handle DISCONNECT — clean disconnect, suppress will."""
        self.has_will = False  # Suppress will on clean disconnect
        self.state = SessionState.DISCONNECTING

    # ------------------------------------------------------------------
    # Deliver message to this client
    # ------------------------------------------------------------------

    async def deliver(
        self,
        topic: str,
        payload: bytes,
        qos: int = 0,
        retain: bool = False,
    ) -> bool:
        """Send a PUBLISH to this client.

        Returns True if sent successfully.
        """
        packet_id = 0
        if qos > 0:
            packet_id = self._allocate_packet_id()
            self._pending_acks[packet_id] = time.time()

        packet = encode_publish(
            topic=topic,
            payload=payload,
            qos=qos,
            retain=retain,
            packet_id=packet_id,
        )

        try:
            self._writer.write(packet)
            await self._writer.drain()
            self.packets_sent += 1
            self.messages_sent += 1
            return True
        except Exception:
            return False

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _send(self, data: bytes) -> None:
        """Write raw bytes to the client."""
        try:
            self._writer.write(data)
            await self._writer.drain()
            self.packets_sent += 1
        except Exception:
            self.state = SessionState.DISCONNECTED

    async def _cleanup(self) -> None:
        """Clean up after disconnect."""
        self.state = SessionState.DISCONNECTED

        # Publish will message if applicable
        if self.has_will and self.will_topic:
            await self._broker.handle_publish(
                topic=self.will_topic,
                payload=self.will_message,
                qos=self.will_qos,
                retain=self.will_retain,
                sender_id=self.client_id,
            )

        # Unregister from broker
        self._broker.unregister_session(self.client_id, self.clean_session)

        # Close transport
        try:
            self._writer.close()
            await self._writer.wait_closed()
        except Exception:
            pass

        logger.info("Client %s disconnected", self.client_id)

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    def get_info(self) -> dict[str, Any]:
        """Return session info for monitoring."""
        return {
            "client_id": self.client_id,
            "state": self.state,
            "username": self.username,
            "connected_at": self.connected_at,
            "last_activity": self.last_activity,
            "keepalive": self.keepalive,
            "packets_received": self.packets_received,
            "packets_sent": self.packets_sent,
            "messages_received": self.messages_received,
            "messages_sent": self.messages_sent,
            "pending_acks": len(self._pending_acks),
        }
