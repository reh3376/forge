"""ForgeMqttBroker — embedded MQTT 3.1.1 broker.

The main broker class that:
  1. Listens for TCP connections
  2. Creates MqttSession per client
  3. Routes published messages via TopicEngine
  4. Manages $SYS/ system topics for monitoring
  5. Provides local publish/subscribe API for in-process modules

This replaces the need for external Mosquitto or RabbitMQ MQTT plugin
in single-site Forge deployments.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable

from forge.core.broker.protocol import encode_publish
from forge.core.broker.topic_engine import TopicEngine
from forge.core.broker.session import MqttSession, SessionState

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


@dataclass
class BrokerConfig:
    """Forge MQTT broker configuration."""

    # Network
    host: str = "127.0.0.1"
    port: int = 1883
    max_connections: int = 500

    # Authentication (empty = allow anonymous)
    username: str = ""
    password: str = ""
    allow_anonymous: bool = True

    # Limits
    max_packet_size: int = 1_048_576  # 1 MB
    max_topic_length: int = 65535
    max_subscriptions_per_client: int = 100
    max_retained_messages: int = 10_000

    # System topics
    sys_interval: float = 10.0  # $SYS publish interval in seconds

    # Logging
    log_connections: bool = True
    log_publishes: bool = False  # Very verbose


# ---------------------------------------------------------------------------
# Local subscription (in-process)
# ---------------------------------------------------------------------------


@dataclass
class LocalSubscription:
    """An in-process subscription (no TCP, no encoding)."""

    name: str
    topic_filter: str
    callback: Callable[[str, bytes, int, bool], Awaitable[None] | None]


# ---------------------------------------------------------------------------
# ForgeMqttBroker
# ---------------------------------------------------------------------------


class ForgeMqttBroker:
    """Embedded MQTT 3.1.1 broker for Forge platform.

    Usage::

        config = BrokerConfig(host="0.0.0.0", port=1883)
        broker = ForgeMqttBroker(config)
        await broker.start()

        # In-process publish (bypasses TCP)
        await broker.publish("whk/whk01/ot/health/PLC_001", payload, qos=1)

        # In-process subscribe
        async def on_message(topic, payload, qos, retain):
            print(f"Received: {topic}")
        broker.subscribe_local("my-handler", "whk/#", on_message)

        await broker.stop()
    """

    def __init__(self, config: BrokerConfig | None = None) -> None:
        self._config = config or BrokerConfig()
        self._topic_engine = TopicEngine()
        self._server: asyncio.AbstractServer | None = None
        self._sessions: dict[str, MqttSession] = {}
        self._local_subs: list[LocalSubscription] = []
        self._started = False
        self._sys_task: asyncio.Task | None = None

        # Metrics
        self._start_time: float = 0.0
        self._total_connections: int = 0
        self._total_publishes: int = 0
        self._total_bytes_received: int = 0
        self._total_bytes_sent: int = 0

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def is_started(self) -> bool:
        return self._started

    @property
    def topic_engine(self) -> TopicEngine:
        return self._topic_engine

    @property
    def config(self) -> BrokerConfig:
        return self._config

    @property
    def connected_clients(self) -> int:
        return len(self._sessions)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Start the broker (TCP listener + $SYS publisher)."""
        if self._started:
            return

        self._server = await asyncio.start_server(
            self._handle_connection,
            host=self._config.host,
            port=self._config.port,
        )
        self._started = True
        self._start_time = time.time()

        # Start $SYS publisher
        if self._config.sys_interval > 0:
            self._sys_task = asyncio.create_task(
                self._sys_publish_loop(),
                name="forge-broker-sys",
            )

        logger.info(
            "Forge MQTT broker started on %s:%d (max_connections=%d)",
            self._config.host, self._config.port, self._config.max_connections,
        )

    async def stop(self) -> None:
        """Stop the broker gracefully."""
        self._started = False

        # Stop $SYS publisher
        if self._sys_task and not self._sys_task.done():
            self._sys_task.cancel()
            try:
                await self._sys_task
            except asyncio.CancelledError:
                pass

        # Disconnect all sessions
        for session in list(self._sessions.values()):
            session.state = SessionState.DISCONNECTED

        self._sessions.clear()

        # Stop TCP listener
        if self._server:
            self._server.close()
            await self._server.wait_closed()
            self._server = None

        logger.info("Forge MQTT broker stopped")

    # ------------------------------------------------------------------
    # TCP connection handler
    # ------------------------------------------------------------------

    async def _handle_connection(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
    ) -> None:
        """Handle a new TCP connection."""
        if len(self._sessions) >= self._config.max_connections:
            writer.close()
            await writer.wait_closed()
            return

        self._total_connections += 1
        session = MqttSession(reader, writer, self)
        await session.run()

    # ------------------------------------------------------------------
    # Session management
    # ------------------------------------------------------------------

    def register_session(self, session: MqttSession) -> bool:
        """Register a new client session. Returns True if session was present."""
        existing = self._sessions.get(session.client_id)
        session_present = False

        if existing is not None:
            # Disconnect old session (takeover)
            existing.state = SessionState.DISCONNECTED
            if not session.clean_session:
                session_present = True

        self._sessions[session.client_id] = session
        return session_present

    def unregister_session(self, client_id: str, clean_session: bool) -> None:
        """Remove a client session."""
        self._sessions.pop(client_id, None)

        if clean_session:
            self._topic_engine.unsubscribe_all(client_id)

    def get_session(self, client_id: str) -> MqttSession | None:
        """Get an active session by client ID."""
        return self._sessions.get(client_id)

    # ------------------------------------------------------------------
    # Authentication
    # ------------------------------------------------------------------

    def authenticate(self, username: str, password: str) -> bool:
        """Authenticate a client. Returns True if accepted."""
        if self._config.allow_anonymous:
            return True

        if not self._config.username:
            return True  # No credentials configured = accept all

        return (
            username == self._config.username
            and password == self._config.password
        )

    # ------------------------------------------------------------------
    # Message routing (called by session PUBLISH handler)
    # ------------------------------------------------------------------

    async def handle_publish(
        self,
        topic: str,
        payload: bytes,
        qos: int = 0,
        retain: bool = False,
        sender_id: str = "",
    ) -> int:
        """Route a published message to matching subscribers.

        Called by MqttSession when a client publishes, or by
        publish() for in-process publishes.

        Returns the number of subscribers the message was delivered to.
        """
        self._total_publishes += 1

        if self._config.log_publishes:
            logger.debug(
                "PUBLISH %s (qos=%d, retain=%s, from=%s, %d bytes)",
                topic, qos, retain, sender_id, len(payload),
            )

        # Store/clear retained message
        if retain:
            self._topic_engine.set_retained(topic, payload, qos)

        # Match subscriptions
        matches = self._topic_engine.match(topic)

        # Deliver to matched TCP clients
        delivered = 0
        for match in matches:
            if match.client_id == sender_id:
                continue  # Don't echo back to sender

            session = self._sessions.get(match.client_id)
            if session and session.state == SessionState.CONNECTED:
                effective_qos = min(qos, match.granted_qos)
                ok = await session.deliver(topic, payload, effective_qos)
                if ok:
                    delivered += 1

        # Deliver to local (in-process) subscribers
        for local_sub in self._local_subs:
            from forge.core.broker.topic_engine import mqtt_topic_matches
            if mqtt_topic_matches(local_sub.topic_filter, topic):
                try:
                    result = local_sub.callback(topic, payload, qos, retain)
                    if asyncio.iscoroutine(result):
                        await result
                    delivered += 1
                except Exception as exc:
                    logger.error(
                        "Local subscriber %s failed: %s",
                        local_sub.name, exc,
                    )

        return delivered

    # ------------------------------------------------------------------
    # In-process API (for Forge modules)
    # ------------------------------------------------------------------

    async def publish(
        self,
        topic: str,
        payload: bytes | str | dict,
        qos: int = 0,
        retain: bool = False,
    ) -> int:
        """Publish a message from within the Forge process.

        This bypasses TCP — the message goes directly to the topic
        engine and all matched subscribers (both TCP and local).

        Returns the number of subscribers delivered to.
        """
        import json

        if isinstance(payload, dict):
            raw = json.dumps(payload, default=str).encode("utf-8")
        elif isinstance(payload, str):
            raw = payload.encode("utf-8")
        else:
            raw = payload

        return await self.handle_publish(
            topic=topic,
            payload=raw,
            qos=qos,
            retain=retain,
            sender_id="$local",
        )

    def subscribe_local(
        self,
        name: str,
        topic_filter: str,
        callback: Callable[[str, bytes, int, bool], Awaitable[None] | None],
    ) -> None:
        """Subscribe an in-process handler to a topic pattern.

        The callback receives (topic, payload, qos, retain).
        """
        self._local_subs.append(LocalSubscription(
            name=name,
            topic_filter=topic_filter,
            callback=callback,
        ))
        logger.debug("Local subscriber %s registered for %s", name, topic_filter)

    def unsubscribe_local(self, name: str) -> int:
        """Remove all local subscriptions by name."""
        before = len(self._local_subs)
        self._local_subs = [s for s in self._local_subs if s.name != name]
        return before - len(self._local_subs)

    # ------------------------------------------------------------------
    # $SYS topics
    # ------------------------------------------------------------------

    async def _sys_publish_loop(self) -> None:
        """Periodically publish broker metrics to $SYS/ topics."""
        while self._started:
            try:
                await asyncio.sleep(self._config.sys_interval)
                if not self._started:
                    break

                uptime = int(time.time() - self._start_time)
                await self._publish_sys("$SYS/broker/uptime", str(uptime).encode())
                await self._publish_sys(
                    "$SYS/broker/clients/connected",
                    str(self.connected_clients).encode(),
                )
                await self._publish_sys(
                    "$SYS/broker/messages/published",
                    str(self._total_publishes).encode(),
                )
                await self._publish_sys(
                    "$SYS/broker/subscriptions/count",
                    str(self._topic_engine.subscription_count).encode(),
                )
                await self._publish_sys(
                    "$SYS/broker/retained/count",
                    str(self._topic_engine.retained_count).encode(),
                )

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("$SYS publish error: %s", exc)

    async def _publish_sys(self, topic: str, payload: bytes) -> None:
        """Publish a $SYS topic (retained, QoS 0)."""
        await self.handle_publish(
            topic=topic, payload=payload,
            qos=0, retain=True, sender_id="$SYS",
        )

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    def get_status(self) -> dict[str, Any]:
        """Return comprehensive broker status."""
        return {
            "started": self._started,
            "address": f"{self._config.host}:{self._config.port}",
            "uptime": int(time.time() - self._start_time) if self._start_time else 0,
            "connected_clients": self.connected_clients,
            "total_connections": self._total_connections,
            "total_publishes": self._total_publishes,
            "subscriptions": self._topic_engine.subscription_count,
            "retained_messages": self._topic_engine.retained_count,
            "local_subscribers": len(self._local_subs),
            "max_connections": self._config.max_connections,
        }
