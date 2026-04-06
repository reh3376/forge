# ruff: noqa: E402, UP017, UP042
"""Integration tests for hardened gRPC transport (real server ↔ real client).

These tests start a real grpc.aio server on a random port, connect a
real GrpcChannel client with compiled protobuf stubs, and verify the
full lifecycle:
    register → configure → start → stream records → health → stop

**Wire format**: Binary protobuf (not JSON). Every message is serialized
and deserialized through compiled pb2 stubs, proving that the proto
schema contract is enforced end-to-end over TCP/HTTP2.

This proves that the distributed hub-spoke system works with hardened,
schema-enforced binary protobuf communication.
"""

from __future__ import annotations

import datetime as _dt_mod
import enum
import sys
from datetime import datetime, timezone
from pathlib import Path

# Python 3.10 compat patches (sandbox is 3.10, code targets 3.12+)
if not hasattr(_dt_mod, "UTC"):
    _dt_mod.UTC = _dt_mod.timezone.utc

if not hasattr(enum, "StrEnum"):
    class StrEnum(str, enum.Enum):
        pass
    enum.StrEnum = StrEnum

import pytest

# Ensure src/ and proto_gen/ are importable
_src = Path(__file__).resolve().parent.parent.parent / "src"
if str(_src) not in sys.path:
    sys.path.insert(0, str(_src))
_proto_gen = _src / "forge" / "proto_gen"
if str(_proto_gen) not in sys.path:
    sys.path.insert(0, str(_proto_gen))

from forge.core.models.adapter import (
    AdapterCapabilities,
    AdapterManifest,
    AdapterState,
    AdapterTier,
    ConnectionParam,
    DataContract,
)
from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge.transport.grpc_channel import GrpcChannel
from forge.transport.grpc_server import GrpcServer
from forge.transport.hub_server import InMemoryServicer
from forge.transport.spoke_client import SpokeClient

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def servicer() -> InMemoryServicer:
    """Create a fresh in-memory servicer."""
    return InMemoryServicer()


@pytest.fixture()
async def server(servicer: InMemoryServicer):
    """Start a real gRPC server on a random port, yield it, then stop."""
    srv = GrpcServer(servicer, port=0)  # port=0 → OS picks free port
    await srv.start()
    yield srv
    await srv.stop(grace=1.0)


@pytest.fixture()
async def channel(server: GrpcServer):
    """Create and connect a real GrpcChannel to the test server."""
    ch = GrpcChannel(f"localhost:{server.port}")
    await ch.connect()
    yield ch
    await ch.close()


@pytest.fixture()
def manifest() -> AdapterManifest:
    """Sample adapter manifest."""
    return AdapterManifest(
        adapter_id="test-adapter",
        name="Test Adapter",
        version="0.1.0",
        type="INGESTION",
        protocol="test",
        tier=AdapterTier.MES_MOM,
        capabilities=AdapterCapabilities(
            read=True, write=False, subscribe=True,
            backfill=False, discover=False,
        ),
        data_contract=DataContract(
            schema_ref="forge://schemas/test/v0.1.0",
            output_format="contextual_record",
            context_fields=["equipment_id"],
        ),
        connection_params=[
            ConnectionParam(
                name="url", description="Test endpoint",
                required=True, secret=False,
            ),
        ],
    )


def _make_record(index: int = 0) -> ContextualRecord:
    """Create a test ContextualRecord."""
    return ContextualRecord(
        source=RecordSource(
            adapter_id="test-adapter",
            system="test-system",
            tag_path=f"Area1/Sensor{index}/Temperature",
        ),
        timestamp=RecordTimestamp(
            source_time=datetime(
                2026, 4, 6, 10, index // 60, index % 60, tzinfo=timezone.utc,
            ),
            ingestion_time=datetime(
                2026, 4, 6, 10, index // 60, index % 60, 200000, tzinfo=timezone.utc,
            ),
        ),
        value=RecordValue(
            raw=72.5 + index * 0.1,
            engineering_units="°F",
            quality=QualityCode.GOOD,
            data_type="float64",
        ),
        context=RecordContext(
            equipment_id="FERM-001",
            batch_id="B-TEST-001",
        ),
        lineage=RecordLineage(
            schema_ref="forge://schemas/test/v0.1.0",
            adapter_id="test-adapter",
            adapter_version="0.1.0",
            transformation_chain=["collect"],
        ),
    )


# ---------------------------------------------------------------------------
# Tests: Control plane over hardened gRPC (binary protobuf)
# ---------------------------------------------------------------------------

class TestGrpcControlPlane:
    """Test control-plane RPCs (Register, Configure, Start, Stop, Health)
    over a real gRPC connection with compiled protobuf serialization."""

    async def test_register(
        self, channel: GrpcChannel, manifest: AdapterManifest,
    ) -> None:
        """Register an adapter over real gRPC with binary protobuf."""
        client = SpokeClient(channel=channel)
        session_id = await client.register(manifest)
        assert session_id.startswith("session-test-adapter-")

    async def test_full_lifecycle(
        self, channel: GrpcChannel, manifest: AdapterManifest,
    ) -> None:
        """Full control-plane lifecycle over real gRPC."""
        client = SpokeClient(channel=channel)
        await client.register(manifest)

        # Configure
        await client.configure({"url": "http://test:3000"})

        # Start
        await client.start()

        # Health
        health = await client.health()
        assert health.get("state") in (
            "HEALTHY",
            AdapterState.HEALTHY.value,
            # proto enum uses int values
            3,
        )

        # Stop
        flushed = await client.stop(graceful=True)
        assert isinstance(flushed, int)

    async def test_configure_before_register_fails(
        self, channel: GrpcChannel,
    ) -> None:
        """Calling configure without register should fail."""
        client = SpokeClient(channel=channel)
        with pytest.raises(RuntimeError, match="Not registered"):
            await client.configure({"url": "test"})


# ---------------------------------------------------------------------------
# Tests: Data plane (record streaming) over hardened gRPC
# ---------------------------------------------------------------------------

class TestGrpcDataPlane:
    """Test record streaming over real gRPC with binary protobuf."""

    async def test_stream_records(
        self,
        channel: GrpcChannel,
        manifest: AdapterManifest,
        servicer: InMemoryServicer,
    ) -> None:
        """Stream ContextualRecords from spoke to hub over binary protobuf."""
        client = SpokeClient(channel=channel)
        session_id = await client.register(manifest)
        await client.configure({"url": "http://test:3000"})
        await client.start()

        # Create an async iterator of records
        records = [_make_record(i) for i in range(5)]

        async def record_stream():
            for r in records:
                yield r

        sent = await client.stream_records(record_stream())
        assert sent == 5

        # Verify records arrived at the hub
        received = await servicer.drain_records(session_id)
        assert len(received) == 5
        assert received[0].value.raw == pytest.approx(72.5)
        assert received[4].value.raw == pytest.approx(72.9)

    async def test_stream_large_batch(
        self,
        channel: GrpcChannel,
        manifest: AdapterManifest,
        servicer: InMemoryServicer,
    ) -> None:
        """Stream a larger batch of records over real gRPC."""
        client = SpokeClient(channel=channel)
        session_id = await client.register(manifest)
        await client.configure({"url": "http://test:3000"})
        await client.start()

        batch_size = 100
        records = [_make_record(i) for i in range(batch_size)]

        async def record_stream():
            for r in records:
                yield r

        sent = await client.stream_records(record_stream())
        assert sent == batch_size

        received = await servicer.drain_records(session_id)
        assert len(received) == batch_size

    async def test_stream_empty(
        self,
        channel: GrpcChannel,
        manifest: AdapterManifest,
    ) -> None:
        """Streaming an empty iterator should work without errors."""
        client = SpokeClient(channel=channel)
        await client.register(manifest)
        await client.configure({"url": "http://test:3000"})
        await client.start()

        async def empty_stream():
            return
            yield

        sent = await client.stream_records(empty_stream())
        assert sent == 0

    async def test_record_value_types(
        self,
        channel: GrpcChannel,
        manifest: AdapterManifest,
        servicer: InMemoryServicer,
    ) -> None:
        """Verify different RecordValue types survive binary protobuf round-trip."""
        client = SpokeClient(channel=channel)
        session_id = await client.register(manifest)
        await client.configure({"url": "http://test:3000"})
        await client.start()

        # Test various value types
        test_cases = [
            ("float", 72.5, "float64"),
            ("int", 42, "int64"),
            ("string", "test-value", "string"),
            ("bool", True, "bool"),
        ]

        records = []
        for i, (_label, raw, dtype) in enumerate(test_cases):
            r = _make_record(i)
            r = ContextualRecord(
                source=r.source,
                timestamp=r.timestamp,
                value=RecordValue(
                    raw=raw, engineering_units="", quality=QualityCode.GOOD,
                    data_type=dtype,
                ),
                context=r.context,
                lineage=r.lineage,
            )
            records.append(r)

        async def record_stream():
            for r in records:
                yield r

        sent = await client.stream_records(record_stream())
        assert sent == len(test_cases)

        received = await servicer.drain_records(session_id)
        assert len(received) == len(test_cases)

        # Verify each value type survived the round-trip
        assert received[0].value.raw == pytest.approx(72.5)  # float
        assert received[1].value.raw == 42  # int
        assert received[2].value.raw == "test-value"  # string
        assert received[3].value.raw is True  # bool


# ---------------------------------------------------------------------------
# Tests: End-to-end with GrpcTransportAdapter
# ---------------------------------------------------------------------------

class TestGrpcTransportAdapter:
    """Test the full transport adapter wrapping over hardened gRPC."""

    async def test_transport_adapter_lifecycle(
        self,
        channel: GrpcChannel,
        servicer: InMemoryServicer,
    ) -> None:
        """GrpcTransportAdapter works with hardened binary protobuf gRPC."""
        from forge.transport.transport_adapter import GrpcTransportAdapter

        # Create a minimal mock adapter
        class MockAdapter:
            adapter_id = "mock-adapter"
            manifest = AdapterManifest(
                adapter_id="mock-adapter",
                name="Mock",
                version="0.1.0",
                type="INGESTION",
                protocol="test",
                tier=AdapterTier.MES_MOM,
                capabilities=AdapterCapabilities(read=True),
                data_contract=DataContract(
                    schema_ref="forge://test/v1",
                    output_format="contextual_record",
                    context_fields=["equipment_id"],
                ),
            )
            _configured = False
            _started = False
            _stopped = False

            async def configure(self, params: dict) -> None:
                self._configured = True

            async def start(self) -> None:
                self._started = True

            async def stop(self) -> None:
                self._stopped = True

            async def collect(self):
                for i in range(3):
                    yield _make_record(i)

        adapter = MockAdapter()
        transport = GrpcTransportAdapter(adapter=adapter, channel=channel)

        # Full lifecycle
        session_id = await transport.register()
        assert session_id.startswith("session-mock-adapter-")

        await transport.configure({"url": "http://test:3000"})
        assert adapter._configured

        await transport.start()
        assert adapter._started

        # Collect and stream
        sent = await transport.collect_and_stream()
        assert sent == 3

        # Verify records arrived
        received = await servicer.drain_records(session_id)
        assert len(received) == 3

        # Health
        health = await transport.health()
        assert health is not None

        # Stop
        await transport.stop()
        assert adapter._stopped


# ---------------------------------------------------------------------------
# Tests: Proto wire format verification
# ---------------------------------------------------------------------------

class TestProtoWireFormat:
    """Verify that data actually uses binary protobuf on the wire,
    not JSON or other fallback serialization."""

    async def test_proto_messages_are_binary(self) -> None:
        """Proto messages serialize to compact binary, not JSON text."""
        from forge.transport.proto_bridge import (
            contextual_record_to_proto,
        )

        record = _make_record(0)
        proto_record = contextual_record_to_proto(record)
        binary = proto_record.SerializeToString()

        # Binary protobuf should be compact (< 200 bytes for a record)
        assert len(binary) < 300
        # Should NOT be valid JSON
        assert not binary.startswith(b"{")
        # Should contain some of the field values in binary form
        assert b"test-adapter" in binary
        assert b"Area1/Sensor0/Temperature" in binary

    async def test_proto_round_trip_through_binary(self) -> None:
        """Proto message → binary → proto message preserves all fields."""
        from forge.proto_gen.forge.v1 import contextual_record_pb2 as cr_pb2
        from forge.transport.proto_bridge import (
            contextual_record_to_proto,
            proto_to_contextual_record,
        )

        original = _make_record(42)
        proto_msg = contextual_record_to_proto(original)
        binary = proto_msg.SerializeToString()

        # Deserialize from binary
        restored_proto = cr_pb2.ContextualRecord()
        restored_proto.ParseFromString(binary)
        restored = proto_to_contextual_record(restored_proto)

        assert restored.source.adapter_id == original.source.adapter_id
        assert restored.source.tag_path == original.source.tag_path
        assert restored.value.raw == pytest.approx(original.value.raw)
        assert restored.value.engineering_units == original.value.engineering_units
        assert restored.context.equipment_id == original.context.equipment_id
        assert restored.lineage.transformation_chain == original.lineage.transformation_chain
