"""Tests for the hub-side gRPC servicer."""

from __future__ import annotations

import pytest

from forge.core.models.adapter import AdapterManifest, AdapterState, AdapterTier, DataContract
from forge.transport.hub_server import InMemoryServicer
from forge.transport.serialization import pydantic_to_proto


@pytest.fixture()
def servicer() -> InMemoryServicer:
    return InMemoryServicer()


@pytest.fixture()
def manifest_dict() -> dict:
    manifest = AdapterManifest(
        adapter_id="test-adapter",
        name="Test Adapter",
        version="0.1.0",
        protocol="graphql",
        tier=AdapterTier.MES_MOM,
        data_contract=DataContract(schema_ref="forge://test/v0.1.0"),
    )
    return pydantic_to_proto(manifest)


class TestRegister:
    async def test_register_returns_session_id(
        self, servicer: InMemoryServicer, manifest_dict: dict,
    ) -> None:
        result = await servicer.register(manifest_dict)
        assert result["accepted"] is True
        assert result["session_id"].startswith("session-test-adapter-")

    async def test_register_creates_session(
        self, servicer: InMemoryServicer, manifest_dict: dict,
    ) -> None:
        result = await servicer.register(manifest_dict)
        session_id = result["session_id"]
        assert session_id in servicer._sessions
        assert servicer._sessions[session_id].adapter_id == "test-adapter"

    async def test_register_creates_record_queue(
        self, servicer: InMemoryServicer, manifest_dict: dict,
    ) -> None:
        result = await servicer.register(manifest_dict)
        session_id = result["session_id"]
        assert session_id in servicer._record_queues


class TestLifecycle:
    async def test_configure(
        self, servicer: InMemoryServicer, manifest_dict: dict,
    ) -> None:
        reg = await servicer.register(manifest_dict)
        sid = reg["session_id"]
        result = await servicer.configure("test-adapter", sid, {"url": "http://test"})
        assert result["success"] is True
        assert servicer._sessions[sid].configured is True
        assert servicer._sessions[sid].state == AdapterState.CONNECTING

    async def test_start_after_configure(
        self, servicer: InMemoryServicer, manifest_dict: dict,
    ) -> None:
        reg = await servicer.register(manifest_dict)
        sid = reg["session_id"]
        await servicer.configure("test-adapter", sid, {})
        result = await servicer.start("test-adapter", sid)
        assert result["success"] is True
        assert servicer._sessions[sid].state == AdapterState.HEALTHY

    async def test_start_without_configure_fails(
        self, servicer: InMemoryServicer, manifest_dict: dict,
    ) -> None:
        reg = await servicer.register(manifest_dict)
        sid = reg["session_id"]
        result = await servicer.start("test-adapter", sid)
        assert result["success"] is False
        assert "Not configured" in result["message"]

    async def test_stop(
        self, servicer: InMemoryServicer, manifest_dict: dict,
    ) -> None:
        reg = await servicer.register(manifest_dict)
        sid = reg["session_id"]
        await servicer.configure("test-adapter", sid, {})
        await servicer.start("test-adapter", sid)
        result = await servicer.stop("test-adapter", sid)
        assert result["success"] is True
        assert servicer._sessions[sid].state == AdapterState.STOPPED

    async def test_health_when_healthy(
        self, servicer: InMemoryServicer, manifest_dict: dict,
    ) -> None:
        reg = await servicer.register(manifest_dict)
        sid = reg["session_id"]
        await servicer.configure("test-adapter", sid, {})
        await servicer.start("test-adapter", sid)
        health = await servicer.health("test-adapter", sid)
        assert health["state"] == 3  # HEALTHY

    async def test_invalid_session_raises(self, servicer: InMemoryServicer) -> None:
        with pytest.raises(ValueError, match="No session"):
            await servicer.configure("test", "bad-session", {})


class TestRecordReceiving:
    async def test_receive_and_drain(
        self, servicer: InMemoryServicer, manifest_dict: dict, sample_record,
    ) -> None:
        reg = await servicer.register(manifest_dict)
        sid = reg["session_id"]
        record_dict = pydantic_to_proto(sample_record)
        await servicer.receive_record(sid, record_dict)

        records = await servicer.drain_records(sid)
        assert len(records) == 1
        assert records[0].source.adapter_id == "whk-wms"

    async def test_receive_increments_counter(
        self, servicer: InMemoryServicer, manifest_dict: dict, sample_record,
    ) -> None:
        reg = await servicer.register(manifest_dict)
        sid = reg["session_id"]
        record_dict = pydantic_to_proto(sample_record)
        await servicer.receive_record(sid, record_dict)
        await servicer.receive_record(sid, record_dict)
        assert servicer._sessions[sid].records_received == 2

    async def test_drain_with_max(
        self, servicer: InMemoryServicer, manifest_dict: dict, sample_record,
    ) -> None:
        reg = await servicer.register(manifest_dict)
        sid = reg["session_id"]
        record_dict = pydantic_to_proto(sample_record)
        for _ in range(5):
            await servicer.receive_record(sid, record_dict)

        records = await servicer.drain_records(sid, max_records=3)
        assert len(records) == 3
        # 2 remaining in queue
        remaining = await servicer.drain_records(sid)
        assert len(remaining) == 2

    async def test_drain_empty_queue(self, servicer: InMemoryServicer) -> None:
        records = await servicer.drain_records("nonexistent")
        assert records == []
