# ruff: noqa: TC001, TC003
"""Tests for the spoke-side gRPC client."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest

from forge.core.models.adapter import (
    AdapterManifest,
    AdapterTier,
    DataContract,
)
from forge.core.models.contextual_record import ContextualRecord
from forge.transport.hub_server import InMemoryServicer
from forge.transport.spoke_client import InMemoryChannel, SpokeClient


@pytest.fixture()
def servicer() -> InMemoryServicer:
    return InMemoryServicer()


@pytest.fixture()
def client(servicer: InMemoryServicer) -> SpokeClient:
    channel = InMemoryChannel(servicer)
    return SpokeClient(channel=channel)


@pytest.fixture()
def manifest() -> AdapterManifest:
    return AdapterManifest(
        adapter_id="test-spoke",
        name="Test Spoke",
        version="0.1.0",
        protocol="graphql",
        tier=AdapterTier.MES_MOM,
        data_contract=DataContract(schema_ref="forge://test/v0.1.0"),
    )


class TestSpokeClientLifecycle:
    async def test_register(
        self, client: SpokeClient, manifest: AdapterManifest,
    ) -> None:
        session_id = await client.register(manifest)
        assert session_id.startswith("session-test-spoke-")
        assert client.session_id == session_id

    async def test_configure(
        self, client: SpokeClient, manifest: AdapterManifest,
    ) -> None:
        await client.register(manifest)
        await client.configure({"url": "http://test"})
        # Should not raise

    async def test_start(
        self, client: SpokeClient, manifest: AdapterManifest,
    ) -> None:
        await client.register(manifest)
        await client.configure({})
        await client.start()
        # Should not raise

    async def test_stop(
        self, client: SpokeClient, manifest: AdapterManifest,
    ) -> None:
        await client.register(manifest)
        await client.configure({})
        await client.start()
        flushed = await client.stop()
        assert isinstance(flushed, int)

    async def test_health(
        self, client: SpokeClient, manifest: AdapterManifest,
    ) -> None:
        await client.register(manifest)
        await client.configure({})
        await client.start()
        health = await client.health()
        assert health["state"] == 3  # HEALTHY

    async def test_configure_before_register_raises(
        self, client: SpokeClient,
    ) -> None:
        with pytest.raises(RuntimeError, match="Not registered"):
            await client.configure({})

    async def test_start_before_register_raises(
        self, client: SpokeClient,
    ) -> None:
        with pytest.raises(RuntimeError, match="Not registered"):
            await client.start()


class TestSpokeClientStreaming:
    async def test_stream_records(
        self,
        client: SpokeClient,
        servicer: InMemoryServicer,
        manifest: AdapterManifest,
        sample_record: ContextualRecord,
    ) -> None:
        session_id = await client.register(manifest)
        await client.configure({})
        await client.start()

        async def _gen() -> AsyncIterator[ContextualRecord]:
            for _ in range(5):
                yield sample_record

        count = await client.stream_records(_gen())
        assert count == 5
        assert client.records_sent == 5

        # Verify records arrived at the servicer
        records = await servicer.drain_records(session_id)
        assert len(records) == 5

    async def test_stream_empty_iterator(
        self,
        client: SpokeClient,
        manifest: AdapterManifest,
    ) -> None:
        await client.register(manifest)
        await client.configure({})
        await client.start()

        async def _gen() -> AsyncIterator[ContextualRecord]:
            return
            yield

        count = await client.stream_records(_gen())
        assert count == 0

    async def test_stream_before_register_raises(
        self,
        client: SpokeClient,
        sample_record: ContextualRecord,
    ) -> None:
        async def _gen() -> AsyncIterator[ContextualRecord]:
            yield sample_record

        with pytest.raises(RuntimeError, match="Not registered"):
            await client.stream_records(_gen())

    async def test_cumulative_record_count(
        self,
        client: SpokeClient,
        manifest: AdapterManifest,
        sample_record: ContextualRecord,
    ) -> None:
        await client.register(manifest)
        await client.configure({})
        await client.start()

        async def _gen(n: int) -> AsyncIterator[ContextualRecord]:
            for _ in range(n):
                yield sample_record

        await client.stream_records(_gen(3))
        await client.stream_records(_gen(7))
        assert client.records_sent == 10


class TestInMemoryChannel:
    async def test_closed_channel_raises(
        self, servicer: InMemoryServicer,
    ) -> None:
        channel = InMemoryChannel(servicer)
        await channel.close()
        with pytest.raises(RuntimeError, match="Channel is closed"):
            await channel.send_unary("Health", {})

    async def test_unknown_method_raises(
        self, servicer: InMemoryServicer,
    ) -> None:
        channel = InMemoryChannel(servicer)
        with pytest.raises(ValueError, match="Unknown RPC method"):
            await channel.send_unary("BadMethod", {})
