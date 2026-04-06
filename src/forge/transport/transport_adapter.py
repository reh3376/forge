# ruff: noqa: TC001
"""GrpcTransportAdapter — wraps any AdapterBase to stream over gRPC.

This is the bridge between the existing adapter interface (collect(),
subscribe(), write(), etc.) and the gRPC transport layer. Existing
adapter classes (WhkWmsAdapter, WhkMesAdapter) require ZERO code changes
to work with gRPC — they just get wrapped in this adapter.

Usage:
    from forge.adapters.whk_wms.adapter import WhkWmsAdapter
    from forge.transport.transport_adapter import GrpcTransportAdapter

    wms = WhkWmsAdapter()
    transport = GrpcTransportAdapter(adapter=wms, channel=grpc_channel)
    await transport.register()
    await transport.configure(params)
    await transport.start()
    sent = await transport.collect_and_stream()
    await transport.stop()
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from forge.adapters.base.interface import AdapterBase
from forge.transport.spoke_client import SpokeClient, TransportChannel

logger = logging.getLogger(__name__)


@dataclass
class GrpcTransportAdapter:
    """Wraps an AdapterBase to stream records over gRPC to the hub.

    The wrapped adapter's collect() async iterator produces ContextualRecords.
    This class pipes them through a SpokeClient to the hub server.
    """

    adapter: AdapterBase
    channel: TransportChannel
    _client: SpokeClient = field(init=False)
    _total_sent: int = field(default=0, init=False)

    def __post_init__(self) -> None:
        self._client = SpokeClient(channel=self.channel)

    @property
    def adapter_id(self) -> str:
        return self.adapter.adapter_id

    @property
    def total_records_sent(self) -> int:
        return self._total_sent

    async def register(self) -> str:
        """Register the wrapped adapter with the hub."""
        session_id = await self._client.register(self.adapter.manifest)
        logger.info(
            "Transport registered adapter %s (session: %s)",
            self.adapter_id, session_id,
        )
        return session_id

    async def configure(self, params: dict[str, str]) -> None:
        """Configure the wrapped adapter via the hub."""
        # Configure on hub side
        await self._client.configure(params)
        # Configure the local adapter
        await self.adapter.configure(params)

    async def start(self) -> None:
        """Start the wrapped adapter and notify the hub."""
        await self._client.start()
        await self.adapter.start()

    async def stop(self) -> int:
        """Stop the wrapped adapter and close the transport.

        Returns the number of records flushed during shutdown.
        """
        await self.adapter.stop()
        flushed = await self._client.stop(graceful=True)
        return flushed

    async def collect_and_stream(self) -> int:
        """Run one collection cycle: collect from adapter, stream to hub.

        Calls the wrapped adapter's collect() method and streams every
        yielded ContextualRecord to the hub via the SpokeClient.

        Returns the number of records streamed in this cycle.
        """
        sent = await self._client.stream_records(self.adapter.collect())
        self._total_sent += sent
        logger.info(
            "Collect cycle: %d records streamed (total: %d)",
            sent, self._total_sent,
        )
        return sent

    async def health(self) -> dict[str, Any]:
        """Get health status from the hub."""
        return await self._client.health()

    async def close(self) -> None:
        """Close the transport channel."""
        await self._client.close()
