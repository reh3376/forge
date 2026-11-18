# ruff: noqa: TC001, TC003
"""Spoke-side gRPC client — pushes ContextualRecords from adapter to hub.

The SpokeClient wraps the gRPC client stub for AdapterService. It handles
connection management, record streaming, and graceful shutdown.

Architecture:
    AdapterBase.collect() ──► SpokeClient.stream_records() ──gRPC──► Hub

Until compiled proto stubs are available, this module provides the client
with an abstract transport layer that can be backed by either real gRPC
or an in-memory mock for testing.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator, Callable, Iterable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from forge.core.clock import (
    CLOCK_REFUSED_STATES,
    ClockRefusedError,
    TimeExchange,
    utc_now,
)
from forge.core.models.adapter import AdapterManifest, SpokeTime
from forge.core.models.contextual_record import ContextualRecord
from forge.transport.serialization import (
    headers_to_spoke_time,
    proto_to_hub_time,
    proto_to_spoke_time,
    pydantic_to_proto,
    spoke_time_to_headers,
    spoke_time_to_proto,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ChannelTls:
    """TLS material for a client channel (hub → spoke callbacks, FB-063).

    ``ca_path`` verifies the server; ``cert_path`` + ``key_path`` make it mTLS.
    Built from ``<prefix>_CA`` / ``_CERT`` / ``_KEY`` by :meth:`from_env`.
    """

    ca_path: str | None = None
    cert_path: str | None = None
    key_path: str | None = None

    @classmethod
    def from_env(cls, prefix: str = "FORGE_SPOKE_TLS") -> ChannelTls | None:
        import os

        ca = os.getenv(f"{prefix}_CA", "").strip() or None
        cert = os.getenv(f"{prefix}_CERT", "").strip() or None
        key = os.getenv(f"{prefix}_KEY", "").strip() or None
        if not (ca or cert or key):
            return None
        return cls(ca_path=ca, cert_path=cert, key_path=key)

    def credentials(self) -> Any:
        """``grpc.ChannelCredentials`` for this material (reads the files)."""
        import grpc

        def read(path: str | None) -> bytes | None:
            return Path(path).read_bytes() if path else None

        if bool(self.cert_path) != bool(self.key_path):
            msg = "ChannelTls needs both cert_path and key_path for a client certificate"
            raise ValueError(msg)
        return grpc.ssl_channel_credentials(
            root_certificates=read(self.ca_path),
            private_key=read(self.key_path),
            certificate_chain=read(self.cert_path),
        )

    def describe(self) -> dict[str, Any]:
        return {
            "ca": bool(self.ca_path),
            "client_certificate": bool(self.cert_path and self.key_path),
        }


class TransportChannel(ABC):
    """Abstract transport channel — decouples from real gRPC for testing."""

    #: Metadata sent with every RPC (e.g. the spoke's callback token, FB-063).
    metadata: list[tuple[str, str]]

    def set_metadata(self, metadata: Iterable[tuple[str, str]]) -> None:
        self.metadata = [(str(k), str(v)) for k, v in metadata]

    @abstractmethod
    async def send_unary(
        self,
        method: str,
        request: dict[str, Any],
    ) -> dict[str, Any]:
        """Send a unary RPC and return the response dict."""

    @abstractmethod
    async def send_stream(
        self,
        method: str,
        records: AsyncIterator[dict[str, Any]],
        *,
        metadata: Iterable[tuple[str, str]] | None = None,
    ) -> dict[str, Any] | None:
        """Send a client-streaming RPC with a stream of record dicts.

        ``metadata`` is sent with this call only, on top of the channel's own (the
        spoke's T1 of the time exchange, FB-092). Returns the hub's response as a
        proto dict (``records_received``, ``success``, ``message``, ``hub_time``),
        or None from a channel that has none to give.
        """

    @abstractmethod
    async def close(self) -> None:
        """Close the channel."""

    def receive_stream(
        self,
        method: str,
        request: dict[str, Any],
    ) -> AsyncIterator[dict[str, Any]]:
        """Open a server-streaming RPC (``Backfill``, ``Subscribe``, ``Collect``)
        and yield response dicts (FB-061, FB-071).

        For ``Subscribe`` the first item is a control dict
        ``{"subscription_id": ...}``; every later item is a record dict.
        Channels that do not serve pull RPCs keep the default.
        """
        msg = f"{type(self).__name__} does not serve server-streaming RPC {method}"
        raise NotImplementedError(msg)


@dataclass
class SpokeClient:
    """Client that spoke sidecars use to communicate with the Forge hub.

    Usage:
        client = SpokeClient(channel=GrpcChannel("hub:50051"))
        session = await client.register(manifest)
        await client.configure(session, params)
        await client.start(session)
        await client.stream_records(session, adapter.collect())
        await client.stop(session)
    """

    channel: TransportChannel
    #: The spoke's own clock: T1 and T4 of the time exchange are read from it (FB-092).
    now: Callable[[], datetime] = utc_now
    _session_id: str | None = field(default=None, init=False)
    _adapter_id: str | None = field(default=None, init=False)
    _records_sent: int = field(default=0, init=False)
    _exchange: TimeExchange | None = field(default=None, init=False)
    _exchanges: int = field(default=0, init=False)

    @property
    def session_id(self) -> str | None:
        return self._session_id

    @property
    def records_sent(self) -> int:
        return self._records_sent

    # -- the time exchange (one clock, FB-092) ---------------------------------

    @property
    def last_exchange(self) -> TimeExchange | None:
        """The last completed exchange with the hub, or None before the first."""
        return self._exchange

    @property
    def exchanges(self) -> int:
        """How many exchanges this client has completed."""
        return self._exchanges

    @property
    def hub_offset_seconds(self) -> float | None:
        """Hub clock minus this spoke's clock, from the last exchange (RFC 5905)."""
        return self._exchange.offset_seconds if self._exchange is not None else None

    def hub_time(self) -> datetime | None:
        """The hub's time as this spoke reads it now: its own clock plus the offset."""
        if self._exchange is None:
            return None
        return self.now() + timedelta(seconds=self._exchange.offset_seconds)

    def _spoke_time_now(self) -> SpokeTime:
        """T1 for a request, with the last exchange's result for the hub's series.

        The measurement is what the hub judges this spoke's clock by (FB-093): every
        Register, Health and Ingest carries it once the first exchange is complete.
        """
        last = self._exchange
        return SpokeTime(
            transmit_time=self.now(),
            offset_seconds=last.offset_seconds if last is not None else None,
            round_trip_seconds=last.round_trip_seconds if last is not None else None,
            measured_at=last.t4 if last is not None else None,
        )

    def _spoke_time(self) -> tuple[datetime, dict[str, Any]]:
        spoke_time = self._spoke_time_now()
        return spoke_time.transmit_time, spoke_time_to_proto(spoke_time)

    def _complete_exchange(self, t1: datetime, response: dict[str, Any] | None) -> None:
        """Take T4 and keep the exchange, when the hub answered with T2 and T3."""
        t4 = self.now()
        hub = proto_to_hub_time((response or {}).get("hub_time"))
        if hub is None:
            return  # a hub from before FB-092: nothing to measure
        self._exchange = TimeExchange(t1, hub.receive_time, hub.transmit_time, t4)
        self._exchanges += 1

    async def register(self, manifest: AdapterManifest) -> str:
        """Register the adapter with the hub.

        Returns the hub-assigned session_id. Raises :class:`ClockRefusedError` when the
        hub refuses this spoke for its clock (FB-093). The refused answer still carries
        the hub's time, so the exchange completes and the next attempt reports a fresh
        measurement: a spoke whose clock is back inside its class is readmitted by
        retrying, after three good probes at least a second apart.
        """
        manifest_dict = pydantic_to_proto(manifest)
        t1, spoke_time = self._spoke_time()
        response = await self.channel.send_unary(
            "Register",
            {"manifest": manifest_dict, "spoke_time": spoke_time},
        )
        self._complete_exchange(t1, response)
        if not response.get("accepted"):
            message = str(response.get("message") or "")
            cause = clock_refusal_cause(response.get("refusal_cause"), message)
            if cause is not None:
                raise ClockRefusedError(f"Registration refused: {message}", cause=cause)
            msg = f"Registration rejected: {message}"
            raise RuntimeError(msg)
        self._session_id = response["session_id"]
        self._adapter_id = manifest.adapter_id
        logger.info(
            "Registered with hub: adapter=%s session=%s",
            manifest.adapter_id,
            self._session_id,
        )
        return self._session_id

    async def configure(self, params: dict[str, str]) -> None:
        """Configure the adapter on the hub."""
        if self._session_id is None:
            msg = "Not registered — call register() first"
            raise RuntimeError(msg)
        response = await self.channel.send_unary(
            "Configure",
            {
                "adapter_id": self._adapter_id,
                "session_id": self._session_id,
                "params": params,
            },
        )
        if not response.get("success"):
            msg = f"Configure failed: {response.get('message')}"
            raise RuntimeError(msg)

    async def start(self) -> None:
        """Start the adapter on the hub."""
        if self._session_id is None:
            msg = "Not registered — call register() first"
            raise RuntimeError(msg)
        response = await self.channel.send_unary(
            "Start",
            {
                "adapter_id": self._adapter_id,
                "session_id": self._session_id,
            },
        )
        if not response.get("success"):
            msg = f"Start failed: {response.get('message')}"
            raise RuntimeError(msg)

    async def stop(self, graceful: bool = True) -> int:
        """Stop the adapter. Returns number of records flushed."""
        if self._session_id is None:
            return 0
        response = await self.channel.send_unary(
            "Stop",
            {
                "adapter_id": self._adapter_id,
                "session_id": self._session_id,
                "graceful": graceful,
            },
        )
        return response.get("records_flushed", 0)

    async def health(self) -> dict[str, Any]:
        """Get adapter health from hub.

        Every call is also a time exchange (FB-092): it sends T1 and the offset and
        round trip of the last exchange, so the hub keeps this spoke's clock series
        two-way, and it measures a new one from the hub's answer.
        """
        if self._session_id is None:
            msg = "Not registered"
            raise RuntimeError(msg)
        t1, spoke_time = self._spoke_time()
        response = await self.channel.send_unary(
            "Health",
            {
                "adapter_id": self._adapter_id,
                "session_id": self._session_id,
                "spoke_time": spoke_time,
            },
        )
        self._complete_exchange(t1, response)
        return response

    async def stream_records(
        self,
        records: AsyncIterator[ContextualRecord],
    ) -> int:
        """Stream ContextualRecords to the hub.

        This is the primary data path. Each record from the adapter's
        collect() async iterator is serialized to a proto dict and
        streamed over the transport channel.

        Returns the number of records successfully sent. Raises
        :class:`ClockRefusedError` when the hub refuses the stream for this spoke's
        clock (FB-093): nothing of it was taken, and the hub's Health answers still
        carry its time, so the spoke goes on measuring until it is readmitted.
        """
        if self._session_id is None:
            msg = "Not registered — call register() first"
            raise RuntimeError(msg)

        count = 0

        async def _serialize() -> AsyncIterator[dict[str, Any]]:
            nonlocal count
            async for record in records:
                if record.timestamp.spoke_time is None:
                    # this spoke's clock as the record leaves it (proto field 10)
                    record.timestamp.spoke_time = self.now()
                yield pydantic_to_proto(record)
                count += 1

        spoke_time = self._spoke_time_now()
        response = await self.channel.send_stream(
            "Collect",
            _serialize(),
            # T1 and the last measurement, in headers: the request is a stream of records
            metadata=spoke_time_to_headers(spoke_time),
        )
        self._complete_exchange(spoke_time.transmit_time, response)
        self._records_sent += count
        logger.info("Streamed %d records to hub (total: %d)", count, self._records_sent)
        return count

    async def close(self) -> None:
        """Close the transport channel."""
        await self.channel.close()


def clock_refusal_cause(cause: Any, message: str = "") -> str | None:
    """The clock-refusal cause of a refused request, or None for any other refusal.

    ``cause`` is what the hub named (the ``x-forge-refusal-cause`` trailer); a hub
    answer read without its trailers still says it, since the message begins with the
    state (``CLOCK_OUT_OF_TOLERANCE: ...``).
    """
    causes = {state.lower() for state in CLOCK_REFUSED_STATES}
    if isinstance(cause, str) and cause in causes:
        return cause
    for state in CLOCK_REFUSED_STATES:
        if message.startswith(f"{state}:"):
            return state.lower()
    return None


class InMemoryChannel(TransportChannel):
    """In-memory transport channel for testing.

    Connects a SpokeClient directly to an AdapterServiceServicer
    without real gRPC. RPC calls are dispatched to the servicer's methods.
    """

    def __init__(self, servicer: Any) -> None:
        """Args: servicer — an AdapterServiceServicer instance."""
        self._servicer = servicer
        self._closed = False
        self.metadata = []

    async def send_unary(
        self,
        method: str,
        request: dict[str, Any],
    ) -> dict[str, Any]:
        if self._closed:
            msg = "Channel is closed"
            raise RuntimeError(msg)

        if method == "Register":
            received_at = self._received_at()
            spoke_time = proto_to_spoke_time(request.get("spoke_time"))
            if spoke_time is not None:
                result = await self._servicer.register(request["manifest"], spoke_time=spoke_time)
            else:
                result = await self._servicer.register(request["manifest"])
            return self._with_hub_time(result, received_at)
        if method == "Configure":
            return await self._servicer.configure(
                request["adapter_id"],
                request["session_id"],
                request.get("params", {}),
            )
        if method == "Start":
            return await self._servicer.start(
                request["adapter_id"],
                request["session_id"],
            )
        if method == "Stop":
            return await self._servicer.stop(
                request["adapter_id"],
                request["session_id"],
                request.get("graceful", True),
            )
        if method == "Health":
            received_at = self._received_at()
            spoke_time = proto_to_spoke_time(request.get("spoke_time"))
            if spoke_time is not None:
                result = await self._servicer.health(
                    request["adapter_id"], request["session_id"], spoke_time=spoke_time
                )
            else:
                result = await self._servicer.health(request["adapter_id"], request["session_id"])
            return self._with_hub_time(result, received_at)
        if method == "Unsubscribe":
            handler = getattr(self._servicer, "unsubscribe", None)
            if handler is None:
                msg = "Servicer does not serve Unsubscribe"
                raise ValueError(msg)
            return await handler(
                request["adapter_id"], request["session_id"], request.get("subscription_id", "")
            )
        if method in ("Write", "Discover"):
            # Spoke-hosted RPCs (FB-054): dispatched to a servicer that
            # plays the spoke, i.e. exposes write()/discover().
            handler = getattr(self._servicer, method.lower(), None)
            if handler is None:
                msg = f"Servicer does not serve {method}"
                raise ValueError(msg)
            if method == "Write":
                return await handler(
                    request["adapter_id"],
                    request["session_id"],
                    request["tag_path"],
                    request.get("value"),
                    request.get("confirm", False),
                )
            return await handler(request["adapter_id"], request["session_id"])
        msg = f"Unknown RPC method: {method}"
        raise ValueError(msg)

    def _received_at(self) -> datetime | None:
        """T2: the servicer's clock as a request arrives, when it keeps one (FB-092)."""
        clock = getattr(self._servicer, "clock", None)
        return clock() if callable(clock) else None

    def _with_hub_time(
        self, result: dict[str, Any], received_at: datetime | None
    ) -> dict[str, Any]:
        """The response with the hub's half of the exchange (T2, T3), as the wire adds it."""
        stamp = getattr(self._servicer, "hub_time", None)
        if received_at is None or not callable(stamp):
            return result
        return {**result, "hub_time": stamp(received_at)}

    async def send_stream(
        self,
        method: str,
        records: AsyncIterator[dict[str, Any]],
        *,
        metadata: Iterable[tuple[str, str]] | None = None,
    ) -> dict[str, Any] | None:
        if self._closed:
            msg = "Channel is closed"
            raise RuntimeError(msg)

        if method == "Collect":
            received_at = self._received_at()
            # Find the session to receive records
            sessions = list(self._servicer._sessions.values())
            if not sessions:
                msg = "No sessions registered"
                raise RuntimeError(msg)
            session_id = sessions[-1].session_id

            begin = getattr(self._servicer, "begin_ingest", None)
            if callable(begin):
                # as the wire does: the measurement in the call's headers is the probe,
                # and a refused spoke's stream is not read (FB-093)
                await begin(session_id, spoke_time=headers_to_spoke_time(dict(metadata or ())))
            count = 0
            async for record_dict in records:
                await self._servicer.receive_record(session_id, record_dict)
                count += 1
            return self._with_hub_time(
                {"records_received": count, "success": True, "message": "OK"}, received_at
            )
        msg = f"Streaming not implemented for method: {method}"
        raise ValueError(msg)

    async def receive_stream(
        self,
        method: str,
        request: dict[str, Any],
    ) -> AsyncIterator[dict[str, Any]]:
        """Backfill / Subscribe / Collect against a fake spoke exposing
        ``backfill()`` / ``subscribe()`` / ``collect()`` async generators."""
        if self._closed:
            msg = "Channel is closed"
            raise RuntimeError(msg)
        if method == "Backfill":
            handler = getattr(self._servicer, "backfill", None)
            if handler is None:
                msg = "Servicer does not serve Backfill"
                raise ValueError(msg)
            stream = handler(
                request["adapter_id"],
                request["session_id"],
                list(request.get("tags") or []),
                request.get("start_time"),
                request.get("end_time"),
                int(request.get("max_records") or 0),
            )
        elif method == "Subscribe":
            handler = getattr(self._servicer, "subscribe", None)
            if handler is None:
                msg = "Servicer does not serve Subscribe"
                raise ValueError(msg)
            stream = handler(
                request["adapter_id"], request["session_id"], list(request.get("tags") or [])
            )
        elif method == "Collect":
            handler = getattr(self._servicer, "collect", None)
            if handler is None:
                msg = "Servicer does not serve Collect"
                raise ValueError(msg)
            stream = handler(
                request["adapter_id"],
                request["session_id"],
                int(request.get("max_batch_size") or 0),
            )
        else:
            msg = f"Server streaming not implemented for method: {method}"
            raise ValueError(msg)
        async for item in stream:
            yield item

    async def close(self) -> None:
        self._closed = True
