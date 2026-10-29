"""Broker → ``MqttSubscriber`` transports (FB-065).

``MqttSubscriber`` only routes messages; something has to receive them
from a broker and call ``process_message``. Two transports:

* :class:`LocalBrokerIngress` — in-process subscription on the embedded
  :class:`~forge.core.broker.ForgeMqttBroker` (the MES backend publishes
  to the hub's broker port). Retained messages matching the subscriber's
  filters are replayed on start, flagged ``retain=True`` so handlers can
  treat them as state synchronisation.
* :class:`ExternalBrokerIngress` — an ``aiomqtt`` client to an external
  broker with reconnect and exponential back-off. ``aiomqtt`` is an
  optional dependency (``forge-platform[ot]``); the client factory is
  injectable for tests.

Both expose ``start()``, ``stop()`` and ``status()``.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from typing import TYPE_CHECKING, Any, Protocol

from forge.modules.ot.mqtt.subscriber import IncomingMessage

if TYPE_CHECKING:
    from collections.abc import Callable

    from forge.core.broker.broker import ForgeMqttBroker
    from forge.modules.ot.mqtt.subscriber import MqttSubscriber

logger = logging.getLogger(__name__)


class MqttIngress(Protocol):
    async def start(self) -> None: ...
    async def stop(self) -> None: ...
    def status(self) -> dict[str, Any]: ...


# ---------------------------------------------------------------------------
# Embedded broker
# ---------------------------------------------------------------------------


class LocalBrokerIngress:
    """Feed a subscriber from the embedded Forge broker without TCP."""

    def __init__(
        self,
        broker: ForgeMqttBroker,
        subscriber: MqttSubscriber,
        *,
        name: str = "forge-ot-ingress",
        replay_retained: bool = True,
    ) -> None:
        self._broker = broker
        self._subscriber = subscriber
        self._name = name
        self._replay_retained = replay_retained
        self._filters: list[str] = []
        self._started = False
        self._delivered = 0
        self._replayed = 0

    @property
    def started(self) -> bool:
        return self._started

    async def start(self) -> None:
        if self._started:
            return
        self._filters = sorted(self._subscriber.get_topic_filters())
        for topic_filter in self._filters:
            # The ingress replays the retained store itself (``_replay``: one copy
            # per topic across overlapping filters, the stored timestamp), so the
            # broker's per-filter replay on subscribe is turned off here.
            await self._broker.subscribe_local(
                self._name, topic_filter, self._deliver, replay_retained=False
            )
        self._started = True
        if self._replay_retained:
            await self._replay()
        logger.info("Local MQTT ingress '%s' on %s", self._name, self._filters)

    async def _replay(self) -> None:
        seen: set[str] = set()
        engine = self._broker.topic_engine
        for topic_filter in self._filters:
            for retained in engine.get_retained_for(topic_filter):
                if retained.topic in seen:
                    continue
                seen.add(retained.topic)
                self._replayed += 1
                await self._subscriber.process_message(
                    IncomingMessage(
                        topic=retained.topic,
                        payload=retained.payload,
                        qos=retained.qos,
                        retain=True,
                        timestamp=retained.timestamp,
                    )
                )

    async def _deliver(self, topic: str, payload: bytes, qos: int, retain: bool) -> None:
        # A live message arrives with retain=False from the broker (MQTT 3.1.1
        # §3.3.1.3, FB-068); only ``_replay`` marks a message retain=True.
        self._delivered += 1
        await self._subscriber.process_message(
            IncomingMessage(
                topic=topic, payload=payload, qos=qos, retain=retain, timestamp=time.time()
            )
        )

    async def stop(self) -> None:
        if not self._started:
            return
        self._broker.unsubscribe_local(self._name)
        self._started = False

    def status(self) -> dict[str, Any]:
        return {
            "mode": "local",
            "connected": self._started and self._broker.is_started,
            "filters": list(self._filters),
            "delivered": self._delivered,
            "replayed": self._replayed,
        }


# ---------------------------------------------------------------------------
# External broker (aiomqtt)
# ---------------------------------------------------------------------------


def _aiomqtt_factory(
    *,
    host: str,
    port: int,
    username: str,
    password: str,
    client_id: str,
    use_tls: bool,
    ca_certs: str,
    certfile: str,
    keyfile: str,
) -> Callable[[], Any]:
    def factory() -> Any:
        try:
            import aiomqtt
        except ImportError as exc:  # pragma: no cover — depends on the install
            msg = "mqtt.mode='external' needs aiomqtt (pip install 'forge-platform[ot]')"
            raise RuntimeError(msg) from exc
        tls_params = None
        if use_tls:
            tls_params = aiomqtt.TLSParameters(
                ca_certs=ca_certs or None, certfile=certfile or None, keyfile=keyfile or None
            )
        return aiomqtt.Client(
            hostname=host,
            port=port,
            username=username or None,
            password=password or None,
            identifier=client_id,
            tls_params=tls_params,
        )

    return factory


class ExternalBrokerIngress:
    """Feed a subscriber from an external MQTT broker (aiomqtt).

    ``client_factory`` returns an object usable as ``async with``, with
    ``await subscribe(topic_filter, qos=...)`` and an async-iterable
    ``messages`` whose items carry ``topic``, ``payload``, ``qos`` and
    ``retain`` — the ``aiomqtt.Client`` surface.
    """

    def __init__(
        self,
        subscriber: MqttSubscriber,
        *,
        host: str = "127.0.0.1",
        port: int = 1883,
        username: str = "",
        password: str = "",
        client_id: str = "forge-ot-control",
        use_tls: bool = False,
        ca_certs: str = "",
        certfile: str = "",
        keyfile: str = "",
        reconnect_min_delay: float = 1.0,
        reconnect_max_delay: float = 60.0,
        client_factory: Callable[[], Any] | None = None,
    ) -> None:
        self._subscriber = subscriber
        self._host = host
        self._port = port
        self._client_id = client_id
        self._min_delay = reconnect_min_delay
        self._max_delay = reconnect_max_delay
        self._client_factory = client_factory or _aiomqtt_factory(
            host=host,
            port=port,
            username=username,
            password=password,
            client_id=client_id,
            use_tls=use_tls,
            ca_certs=ca_certs,
            certfile=certfile,
            keyfile=keyfile,
        )
        self._task: asyncio.Task[None] | None = None
        self._running = False
        self._connected = False
        self._filters: list[str] = []
        self._delivered = 0
        self._errors = 0
        self._reconnects = 0
        self._last_error = ""

    @property
    def connected(self) -> bool:
        return self._connected

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._filters = sorted(self._subscriber.get_topic_filters())
        self._task = asyncio.create_task(self._run(), name="forge-ot-mqtt-ingress")

    async def _run(self) -> None:
        delay = self._min_delay
        while self._running:
            try:
                async with self._client_factory() as client:
                    for topic_filter in self._filters:
                        await client.subscribe(topic_filter, qos=1)
                    self._connected = True
                    delay = self._min_delay
                    logger.info(
                        "MQTT ingress connected to %s:%d as %s (%s)",
                        self._host,
                        self._port,
                        self._client_id,
                        self._filters,
                    )
                    async for message in client.messages:
                        await self._handle(message)
                    # The message stream ended: the broker closed the session.
                    msg = "message stream closed"
                    raise ConnectionError(msg)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                if not self._running:
                    break
                self._connected = False
                self._errors += 1
                self._last_error = f"{type(exc).__name__}: {exc}"
                logger.warning(
                    "MQTT ingress to %s:%d lost (%s); retrying in %.0fs",
                    self._host,
                    self._port,
                    self._last_error,
                    delay,
                )
                await asyncio.sleep(delay)
                delay = min(delay * 2, self._max_delay)
                self._reconnects += 1
        self._connected = False

    async def _handle(self, message: Any) -> None:
        topic = getattr(message.topic, "value", None) or str(message.topic)
        payload = message.payload
        if isinstance(payload, str):
            payload = payload.encode("utf-8")
        elif not isinstance(payload, bytes | bytearray):
            payload = str(payload).encode("utf-8")
        self._delivered += 1
        await self._subscriber.process_message(
            IncomingMessage(
                topic=topic,
                payload=bytes(payload),
                qos=int(getattr(message, "qos", 0) or 0),
                retain=bool(getattr(message, "retain", False)),
                timestamp=time.time(),
            )
        )

    async def stop(self) -> None:
        self._running = False
        task, self._task = self._task, None
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        self._connected = False

    def status(self) -> dict[str, Any]:
        return {
            "mode": "external",
            "connected": self._connected,
            "broker": f"{self._host}:{self._port}",
            "client_id": self._client_id,
            "filters": list(self._filters),
            "delivered": self._delivered,
            "errors": self._errors,
            "reconnects": self._reconnects,
            "last_error": self._last_error,
        }
