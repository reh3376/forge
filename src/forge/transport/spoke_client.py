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
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from forge.core.models.adapter import AdapterManifest
from forge.core.models.contextual_record import ContextualRecord
from forge.transport.serialization import pydantic_to_proto

logger = logging.getLogger(__name__)


class TransportChannel(ABC):
    """Abstract transport channel — decouples from real gRPC for testing."""

    @abstractmethod
    async def send_unary(
        self, method: str, request: dict[str, Any],
    ) -> dict[str, Any]:
        """Send a unary RPC and return the response dict."""

    @abstractmethod
    async def send_stream(
        self, method: str, records: AsyncIterator[dict[str, Any]],
    ) -> None:
        """Send a client-streaming RPC with a stream of record dicts."""

    @abstractmethod
    async def close(self) -> None:
        """Close the channel."""


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
    _session_id: str | None = field(default=None, init=False)
    _adapter_id: str | None = field(default=None, init=False)
    _records_sent: int = field(default=0, init=False)

    @property
    def session_id(self) -> str | None:
        return self._session_id

    @property
    def records_sent(self) -> int:
        return self._records_sent

    async def register(self, manifest: AdapterManifest) -> str:
        """Register the adapter with the hub.

        Returns the hub-assigned session_id.
        """
        manifest_dict = pydantic_to_proto(manifest)
        response = await self.channel.send_unary(
            "Register", {"manifest": manifest_dict},
        )
        if not response.get("accepted"):
            msg = f"Registration rejected: {response.get('message')}"
            raise RuntimeError(msg)
        self._session_id = response["session_id"]
        self._adapter_id = manifest.adapter_id
        logger.info(
            "Registered with hub: adapter=%s session=%s",
            manifest.adapter_id, self._session_id,
        )
        return self._session_id

    async def configure(self, params: dict[str, str]) -> None:
        """Configure the adapter on the hub."""
        if self._session_id is None:
            msg = "Not registered — call register() first"
            raise RuntimeError(msg)
        response = await self.channel.send_unary("Configure", {
            "adapter_id": self._adapter_id,
            "session_id": self._session_id,
            "params": params,
        })
        if not response.get("success"):
            msg = f"Configure failed: {response.get('message')}"
            raise RuntimeError(msg)

    async def start(self) -> None:
        """Start the adapter on the hub."""
        if self._session_id is None:
            msg = "Not registered — call register() first"
            raise RuntimeError(msg)
        response = await self.channel.send_unary("Start", {
            "adapter_id": self._adapter_id,
            "session_id": self._session_id,
        })
        if not response.get("success"):
            msg = f"Start failed: {response.get('message')}"
            raise RuntimeError(msg)

    async def stop(self, graceful: bool = True) -> int:
        """Stop the adapter. Returns number of records flushed."""
        if self._session_id is None:
            return 0
        response = await self.channel.send_unary("Stop", {
            "adapter_id": self._adapter_id,
            "session_id": self._session_id,
            "graceful": graceful,
        })
        return response.get("records_flushed", 0)

    async def health(self) -> dict[str, Any]:
        """Get adapter health from hub."""
        if self._session_id is None:
            msg = "Not registered"
            raise RuntimeError(msg)
        return await self.channel.send_unary("Health", {
            "adapter_id": self._adapter_id,
            "session_id": self._session_id,
        })

    async def stream_records(
        self, records: AsyncIterator[ContextualRecord],
    ) -> int:
        """Stream ContextualRecords to the hub.

        This is the primary data path. Each record from the adapter's
        collect() async iterator is serialized to a proto dict and
        streamed over the transport channel.

        Returns the number of records successfully sent.
        """
        if self._session_id is None:
            msg = "Not registered — call register() first"
            raise RuntimeError(msg)

        count = 0

        async def _serialize() -> AsyncIterator[dict[str, Any]]:
            nonlocal count
            async for record in records:
                yield pydantic_to_proto(record)
                count += 1

        await self.channel.send_stream("Collect", _serialize())
        self._records_sent += count
        logger.info("Streamed %d records to hub (total: %d)", count, self._records_sent)
        return count

    async def close(self) -> None:
        """Close the transport channel."""
        await self.channel.close()


class InMemoryChannel(TransportChannel):
    """In-memory transport channel for testing.

    Connects a SpokeClient directly to an AdapterServiceServicer
    without real gRPC. RPC calls are dispatched to the servicer's methods.
    """

    def __init__(self, servicer: Any) -> None:
        """Args: servicer — an AdapterServiceServicer instance."""
        self._servicer = servicer
        self._closed = False

    async def send_unary(
        self, method: str, request: dict[str, Any],
    ) -> dict[str, Any]:
        if self._closed:
            msg = "Channel is closed"
            raise RuntimeError(msg)

        if method == "Register":
            return await self._servicer.register(request["manifest"])
        if method == "Configure":
            return await self._servicer.configure(
                request["adapter_id"],
                request["session_id"],
                request.get("params", {}),
            )
        if method == "Start":
            return await self._servicer.start(
                request["adapter_id"], request["session_id"],
            )
        if method == "Stop":
            return await self._servicer.stop(
                request["adapter_id"],
                request["session_id"],
                request.get("graceful", True),
            )
        if method == "Health":
            return await self._servicer.health(
                request["adapter_id"], request["session_id"],
            )
        msg = f"Unknown RPC method: {method}"
        raise ValueError(msg)

    async def send_stream(
        self, method: str, records: AsyncIterator[dict[str, Any]],
    ) -> None:
        if self._closed:
            msg = "Channel is closed"
            raise RuntimeError(msg)

        if method == "Collect":
            # Find the session to receive records
            sessions = list(self._servicer._sessions.values())
            if not sessions:
                msg = "No sessions registered"
                raise RuntimeError(msg)
            session_id = sessions[-1].session_id

            async for record_dict in records:
                await self._servicer.receive_record(session_id, record_dict)
        else:
            msg = f"Streaming not implemented for method: {method}"
            raise ValueError(msg)

    async def close(self) -> None:
        self._closed = True
