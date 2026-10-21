"""HubIngestServicer: FACTS-checked registration, batched persistence (FB-053)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

from forge.core.models.adapter import AdapterHealth, AdapterManifest
from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge.ingest.pipeline import IngestOutcome, IngestPipeline, InMemoryRecordSink
from forge.transport.grpc_channel import GrpcChannel
from forge.transport.grpc_server import GrpcServer
from forge.transport.hub_ingest import HubIngestServicer
from forge.transport.serialization import pydantic_to_proto
from forge.transport.spoke_client import SpokeClient

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

MES_MANIFEST = Path(__file__).resolve().parents[2] / "src" / "forge" / "adapters"
MES_MANIFEST = MES_MANIFEST / "forge_mes" / "manifest.json"
SCHEMA_REF = "forge://schemas/forge-mes/v0.1.0"


def mes_manifest() -> AdapterManifest:
    return AdapterManifest.model_validate(json.loads(MES_MANIFEST.read_text()))


def mes_record(i: int = 0, *, schema_ref: str = SCHEMA_REF) -> ContextualRecord:
    return ContextualRecord(
        source=RecordSource(
            adapter_id="forge-mes", system="forge-mes", tag_path="mes.backend.step"
        ),
        timestamp=RecordTimestamp(source_time=datetime(2026, 6, 1, 12, i, tzinfo=UTC)),
        value=RecordValue(raw={"id": f"s{i}"}, quality=QualityCode.GOOD, data_type="object"),
        context=RecordContext(
            batch_id="B-1",
            equipment_id="MASH-TUN-01",
            recipe_id="R-1",
            extra={
                "entity_type": "StepExecution",
                "event_type": "step.started",
                "production_order_id": "PO-1",
                "event_timestamp": "2026-06-01T12:00:00Z",
            },
        ),
        lineage=RecordLineage(
            schema_ref=schema_ref, adapter_id="forge-mes", adapter_version="0.1.0"
        ),
    )


async def _session(servicer: HubIngestServicer) -> str:
    reg = await servicer.register(pydantic_to_proto(mes_manifest()))
    assert reg["accepted"], reg
    sid = reg["session_id"]
    await servicer.configure("forge-mes", sid, {"graphql_url": "http://mes/graphql"})
    assert (await servicer.start("forge-mes", sid))["success"]
    return sid


# ---------------------------------------------------------------------------
# Unit: servicer behaviour
# ---------------------------------------------------------------------------


class TestRegistration:
    async def test_conforming_manifest_is_accepted_and_announced(self) -> None:
        seen: list[AdapterManifest] = []
        servicer = HubIngestServicer(on_registered=seen.append)
        reg = await servicer.register(pydantic_to_proto(mes_manifest()))
        assert reg["accepted"] is True
        assert reg["session_id"].startswith("session-forge-mes-")
        assert "ok" in reg["message"]
        assert [m.adapter_id for m in seen] == ["forge-mes"]
        state = servicer.session_state(reg["session_id"])
        assert state is not None and state.facts is not None and state.facts.ok

    async def test_nonconforming_manifest_is_rejected(self) -> None:
        servicer = HubIngestServicer()
        bad = mes_manifest()
        bad.capabilities.write = False
        reg = await servicer.register(pydantic_to_proto(bad))
        assert reg == {
            "accepted": False,
            "message": reg["message"],
            "session_id": "",
        }
        assert "capabilities differ" in reg["message"]
        assert servicer.snapshot()["sessions"] == []

    async def test_unknown_adapter_accepted_with_warning_unless_required(self) -> None:
        unknown = mes_manifest()
        unknown.adapter_id = "mystery"
        lenient = HubIngestServicer()
        assert (await lenient.register(pydantic_to_proto(unknown)))["accepted"] is True
        strict = HubIngestServicer(require_facts=True)
        assert (await strict.register(pydantic_to_proto(unknown)))["accepted"] is False


class TestDataPlane:
    async def test_records_are_batched_into_the_pipeline(self) -> None:
        sink = InMemoryRecordSink()
        servicer = HubIngestServicer(IngestPipeline(fallback_sink=sink), batch_size=2)
        sid = await _session(servicer)

        await servicer.receive_record(sid, pydantic_to_proto(mes_record(0)))
        assert len(sink) == 0  # buffered
        await servicer.receive_record(sid, pydantic_to_proto(mes_record(1)))
        assert len(sink) == 2  # batch size reached
        await servicer.receive_record(sid, pydantic_to_proto(mes_record(2)))
        summary = await servicer.end_of_stream(sid)
        assert len(sink) == 3
        assert summary == "accepted=3 rejected=0 persisted=3 failed=0"

        state = servicer.session_state(sid)
        assert state is not None
        assert state.stats.batches == 2 and state.stats.persisted == 3
        assert state.stream.received == 0  # reset after end_of_stream
        assert servicer._sessions[sid].records_received == 3
        # the base-class queue is not used: nothing accumulates
        assert servicer._record_queues[sid].qsize() == 0

    async def test_hub_stamps_receipt_and_keeps_the_spoke_stamp(self) -> None:
        """ingestion_time is the hub's clock on receipt; the spoke's stamp survives as sent_time."""
        hub_now = datetime(2026, 6, 1, 12, 30, tzinfo=UTC)
        sink = InMemoryRecordSink()
        servicer = HubIngestServicer(
            IngestPipeline(fallback_sink=sink, clock=lambda: hub_now), batch_size=1
        )
        sid = await _session(servicer)

        spoke = mes_record()
        spoke_stamp = spoke.timestamp.ingestion_time  # the spoke's clock, sent on the wire
        await servicer.receive_record(sid, pydantic_to_proto(spoke))
        stored = sink.records[0].timestamp
        assert stored.ingestion_time == hub_now
        assert stored.sent_time == spoke_stamp

        # a spoke that sends no stamp: receipt stamped, nothing invented as sent_time
        wire = pydantic_to_proto(mes_record(1))
        del wire["timestamp"]["ingestion_time"]
        await servicer.receive_record(sid, wire)
        assert sink.records[1].timestamp.ingestion_time == hub_now
        assert sink.records[1].timestamp.sent_time is None

    async def test_bad_records_are_counted_not_fatal(self) -> None:
        sink = InMemoryRecordSink()
        servicer = HubIngestServicer(IngestPipeline(fallback_sink=sink), batch_size=10)
        sid = await _session(servicer)

        await servicer.receive_record(sid, {"not": "a record"})  # unparseable
        await servicer.receive_record(
            sid, pydantic_to_proto(mes_record(1, schema_ref="forge://schemas/forge-mes/v0.0.1"))
        )
        await servicer.receive_record(sid, pydantic_to_proto(mes_record(2)))
        summary = await servicer.end_of_stream(sid)
        assert summary == "accepted=1 rejected=2 persisted=1 failed=0"
        assert len(sink) == 1

        health = await servicer.health("forge-mes", sid)
        assert health["records_collected"] == 1
        assert health["records_failed"] == 2
        assert "schema_ref" in (health.get("error_message") or "")

    async def test_receive_before_start_is_refused(self) -> None:
        servicer = HubIngestServicer()
        reg = await servicer.register(pydantic_to_proto(mes_manifest()))
        with pytest.raises(ValueError, match="not started"):
            await servicer.receive_record(reg["session_id"], pydantic_to_proto(mes_record()))
        with pytest.raises(ValueError, match="No session"):
            await servicer.receive_record("nope", pydantic_to_proto(mes_record()))

    async def test_stop_flushes_and_health_callback_fires(self) -> None:
        sink = InMemoryRecordSink()
        healths: list[tuple[str, AdapterHealth]] = []
        servicer = HubIngestServicer(
            IngestPipeline(fallback_sink=sink),
            batch_size=50,
            on_health=lambda aid, h: healths.append((aid, h)),
        )
        sid = await _session(servicer)
        for i in range(3):
            await servicer.receive_record(sid, pydantic_to_proto(mes_record(i)))
        await servicer.health("forge-mes", sid)
        assert healths and healths[0][0] == "forge-mes"
        result = await servicer.stop("forge-mes", sid, graceful=True)
        assert result["success"] and result["records_flushed"] == 3
        assert len(sink) == 3

        snap = servicer.snapshot()
        assert snap["batch_size"] == 50
        assert snap["sessions"][0]["adapter_id"] == "forge-mes"
        assert snap["sessions"][0]["stats"]["persisted"] == 3
        assert snap["pipeline"]["stats"]["persisted"] == 3

    async def test_flush_all_on_shutdown(self) -> None:
        sink = InMemoryRecordSink()
        servicer = HubIngestServicer(IngestPipeline(fallback_sink=sink), batch_size=50)
        sid = await _session(servicer)
        await servicer.receive_record(sid, pydantic_to_proto(mes_record()))
        assert await servicer.flush_all() == 1
        assert await servicer.flush_all() == 0
        assert len(sink) == 1


# ---------------------------------------------------------------------------
# Live: real gRPC server + SpokeClient streaming into the pipeline
# ---------------------------------------------------------------------------


@pytest.fixture()
def sink() -> InMemoryRecordSink:
    return InMemoryRecordSink()


@pytest.fixture()
def servicer(sink: InMemoryRecordSink) -> HubIngestServicer:
    return HubIngestServicer(IngestPipeline(fallback_sink=sink), batch_size=2)


@pytest.fixture()
async def server(servicer: HubIngestServicer):
    srv = GrpcServer(servicer, port=0)
    await srv.start()
    yield srv
    await srv.stop(grace=1.0)


@pytest.fixture()
async def channel(server: GrpcServer):
    ch = GrpcChannel(f"localhost:{server.port}")
    await ch.connect()
    yield ch
    await ch.close()


class TestLiveIngest:
    async def test_spoke_stream_is_persisted(
        self, channel: GrpcChannel, servicer: HubIngestServicer, sink: InMemoryRecordSink
    ) -> None:
        client = SpokeClient(channel=channel)
        session_id = await client.register(mes_manifest())
        await client.configure({"graphql_url": "http://mes/graphql"})
        await client.start()

        async def gen() -> AsyncIterator[ContextualRecord]:
            for i in range(5):
                yield mes_record(i)

        sent = await client.stream_records(gen())
        assert sent == 5
        assert len(sink) == 5
        state = servicer.session_state(session_id)
        assert state is not None
        assert state.stats.persisted == 5 and state.stats.batches == 3  # 2 + 2 + 1
        assert state.buffer == []

        health = await client.health()
        assert health.get("records_collected") in (5, "5")
        assert await client.stop(graceful=True) == 0

    async def test_rejected_manifest_over_the_wire(self, channel: GrpcChannel) -> None:
        client = SpokeClient(channel=channel)
        bad = mes_manifest()
        bad.data_contract.schema_ref = "forge://schemas/forge-mes/v9"
        with pytest.raises(RuntimeError, match="FACTS conformance failed"):
            await client.register(bad)


# ---------------------------------------------------------------------------
# Durable registry hooks (FB-060)
# ---------------------------------------------------------------------------


class TestRegistryHooks:
    async def test_async_callbacks_are_awaited_and_batches_logged(self) -> None:
        seen: list[str] = []
        logged: list[tuple[str, str, IngestOutcome]] = []

        async def on_registered(manifest: AdapterManifest) -> None:
            seen.append(f"registered:{manifest.adapter_id}")

        async def on_health(adapter_id: str, health: AdapterHealth) -> None:
            seen.append(f"health:{adapter_id}:{health.state.value}")

        async def ingest_log(adapter_id: str, session_id: str, outcome: IngestOutcome) -> None:
            logged.append((adapter_id, session_id, outcome))

        sink = InMemoryRecordSink()
        servicer = HubIngestServicer(
            IngestPipeline(fallback_sink=sink),
            batch_size=2,
            on_registered=on_registered,
            on_health=on_health,
            ingest_log=ingest_log,
        )
        sid = await _session(servicer)
        assert seen == ["registered:forge-mes"]
        for i in range(3):
            await servicer.receive_record(sid, pydantic_to_proto(mes_record(i)))
        await servicer.health("forge-mes", sid)
        assert seen[-1] == "health:forge-mes:HEALTHY"
        assert len(logged) == 1 and logged[0][:2] == ("forge-mes", sid)
        assert logged[0][2].received == 2 and logged[0][2].persisted == 2
        await servicer.stop("forge-mes", sid, graceful=True)
        assert len(logged) == 2 and logged[1][2].received == 1
        assert await servicer.flush_all() == 0 and len(logged) == 2  # empty flushes are not logged

    async def test_failing_log_hook_never_blocks_ingestion(self) -> None:
        def boom(adapter_id: str, session_id: str, outcome: IngestOutcome) -> None:
            raise RuntimeError("log store down")

        sink = InMemoryRecordSink()
        servicer = HubIngestServicer(
            IngestPipeline(fallback_sink=sink), batch_size=1, ingest_log=boom
        )
        sid = await _session(servicer)
        await servicer.receive_record(sid, pydantic_to_proto(mes_record()))
        assert len(sink) == 1
