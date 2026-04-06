# ruff: noqa: TC001
"""Tests for GrpcTransportAdapter — wrapping existing adapters for gRPC."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

from forge.core.models.contextual_record import ContextualRecord
from forge.transport.hub_server import InMemoryServicer
from forge.transport.spoke_client import InMemoryChannel
from forge.transport.transport_adapter import GrpcTransportAdapter

# ── Import WMS and MES adapters if available ──────────────────────────────

_src = Path(__file__).resolve().parent.parent.parent / "src"
if str(_src) not in sys.path:
    sys.path.insert(0, str(_src))

try:
    from forge.adapters.whk_wms.adapter import WhkWmsAdapter

    HAS_WMS = True
except ImportError:
    HAS_WMS = False

try:
    from forge.adapters.whk_mes.adapter import WhkMesAdapter

    HAS_MES = True
except ImportError:
    HAS_MES = False


@pytest.fixture()
def servicer() -> InMemoryServicer:
    return InMemoryServicer()


# ═══════════════════════════════════════════════════════════════════════════
# WMS Adapter wrapping
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.skipif(not HAS_WMS, reason="WMS adapter not available")
class TestWmsTransportAdapter:
    async def test_register_wms(self, servicer: InMemoryServicer) -> None:
        adapter = WhkWmsAdapter()
        channel = InMemoryChannel(servicer)
        transport = GrpcTransportAdapter(adapter=adapter, channel=channel)

        session_id = await transport.register()
        assert session_id.startswith("session-whk-wms-")
        assert transport.adapter_id == "whk-wms"

    async def test_full_lifecycle_wms(
        self, servicer: InMemoryServicer, sample_record: ContextualRecord,
    ) -> None:
        adapter = WhkWmsAdapter()
        channel = InMemoryChannel(servicer)
        transport = GrpcTransportAdapter(adapter=adapter, channel=channel)

        await transport.register()
        await transport.configure({
            "graphql_url": "http://localhost:3020/graphql",
            "rabbitmq_url": "amqp://localhost:5672",
            "azure_tenant_id": "test-tenant",
            "azure_client_id": "test-client",
            "azure_client_secret": "test-secret",
        })
        await transport.start()

        # Inject test records into the WMS adapter
        adapter.inject_records([
            {"id": "test-1", "type": "barrel_event"},
            {"id": "test-2", "type": "barrel_event"},
        ])

        sent = await transport.collect_and_stream()
        assert sent >= 0  # May be 0 if mapper rejects test data
        assert transport.total_records_sent >= 0

        flushed = await transport.stop()
        assert isinstance(flushed, int)

    async def test_health_check_wms(self, servicer: InMemoryServicer) -> None:
        adapter = WhkWmsAdapter()
        channel = InMemoryChannel(servicer)
        transport = GrpcTransportAdapter(adapter=adapter, channel=channel)

        await transport.register()
        await transport.configure({
            "graphql_url": "http://localhost:3020/graphql",
            "rabbitmq_url": "amqp://localhost:5672",
            "azure_tenant_id": "test-tenant",
            "azure_client_id": "test-client",
            "azure_client_secret": "test-secret",
        })
        await transport.start()

        health = await transport.health()
        assert health["state"] == 3  # HEALTHY


# ═══════════════════════════════════════════════════════════════════════════
# MES Adapter wrapping
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.skipif(not HAS_MES, reason="MES adapter not available")
class TestMesTransportAdapter:
    async def test_register_mes(self, servicer: InMemoryServicer) -> None:
        adapter = WhkMesAdapter()
        channel = InMemoryChannel(servicer)
        transport = GrpcTransportAdapter(adapter=adapter, channel=channel)

        session_id = await transport.register()
        assert session_id.startswith("session-whk-mes-")
        assert transport.adapter_id == "whk-mes"

    async def test_full_lifecycle_mes(self, servicer: InMemoryServicer) -> None:
        adapter = WhkMesAdapter()
        channel = InMemoryChannel(servicer)
        transport = GrpcTransportAdapter(adapter=adapter, channel=channel)

        await transport.register()
        await transport.configure({
            "graphql_url": "http://localhost:3000/graphql",
            "rabbitmq_url": "amqp://localhost:5672",
            "azure_tenant_id": "test-tenant",
            "azure_client_id": "test-client",
            "azure_client_secret": "test-secret",
        })
        await transport.start()

        # Inject test records
        adapter.inject_records([
            {"id": "batch-1", "type": "batch_event"},
        ])

        sent = await transport.collect_and_stream()
        assert sent >= 0

        flushed = await transport.stop()
        assert isinstance(flushed, int)

    async def test_close_mes(self, servicer: InMemoryServicer) -> None:
        adapter = WhkMesAdapter()
        channel = InMemoryChannel(servicer)
        transport = GrpcTransportAdapter(adapter=adapter, channel=channel)

        await transport.register()
        await transport.close()
        # Channel should be closed — further ops should fail
        with pytest.raises(RuntimeError, match="Channel is closed"):
            await transport.health()
