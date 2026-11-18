"""HubIngestServicer: FACTS-checked registration, batched persistence (FB-053)."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
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
from forge.transport.spoke_client import InMemoryChannel, SpokeClient

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
        """ingestion_time is the hub's clock on receipt; the spoke's stamp is spoke_time."""
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
        assert stored.spoke_time == spoke_stamp

        # a spoke that sends no stamp: receipt stamped, nothing invented as spoke_time
        wire = pydantic_to_proto(mes_record(1))
        del wire["timestamp"]["ingestion_time"]
        await servicer.receive_record(sid, wire)
        assert sink.records[1].timestamp.ingestion_time == hub_now
        assert sink.records[1].timestamp.spoke_time is None

    async def test_health_reports_the_measured_clock_offsets(self) -> None:
        """The hub measures the spoke's clock from its stamps and reports it on AdapterHealth."""
        hub_now = datetime(2026, 6, 1, 12, 30, tzinfo=UTC)
        healths: list[tuple[str, AdapterHealth]] = []
        servicer = HubIngestServicer(
            IngestPipeline(fallback_sink=InMemoryRecordSink(), clock=lambda: hub_now),
            batch_size=1,
            on_health=lambda aid, h: healths.append((aid, h)),
        )
        sid = await _session(servicer)
        spoke = mes_record()
        spoke.timestamp.ingestion_time = hub_now - timedelta(seconds=2)  # the spoke's clock at send
        await servicer.receive_record(sid, pydantic_to_proto(spoke))

        wire = await servicer.health("forge-mes", sid)
        assert "clock" not in wire  # hub-side only until FB-092 puts time in the contract
        _aid, health = healths[-1]
        spoke_clock = health.clock["spoke"]
        assert spoke_clock.last_seconds == -2.0 and spoke_clock.samples == 1
        assert spoke_clock.within_tolerance is False  # 1 s provisional tolerance until D-9
        # what GET /v1/adapters/{id}/health returns once the heartbeat is cached
        assert health.model_dump(mode="json")["clock"]["spoke"]["last_seconds"] == -2.0

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


# ---------------------------------------------------------------------------
# The hub <-> spoke time exchange (FB-092, one-clock record P-9)
# ---------------------------------------------------------------------------


class SkewedClocks:
    """One true time that moves 1 ms each time a clock is read; the spoke's is offset from it."""

    def __init__(self, skew_seconds: float) -> None:
        self.t = datetime(2026, 6, 1, 12, tzinfo=UTC)
        self.skew = timedelta(seconds=skew_seconds)

    def _tick(self) -> datetime:
        self.t += timedelta(milliseconds=1)
        return self.t

    def hub(self) -> datetime:
        return self._tick()

    def spoke(self) -> datetime:
        return self._tick() + self.skew


async def _records(n: int) -> AsyncIterator[ContextualRecord]:
    for i in range(n):
        yield mes_record(i)


class TestTimeExchange:
    async def test_register_health_and_ingest_each_complete_an_exchange(self) -> None:
        """T1 out, T2 and T3 back, T4 on arrival; the spoke reports and the hub keeps the series."""
        clocks = SkewedClocks(2.0)  # the spoke's clock runs 2 s ahead of the hub's
        sink = InMemoryRecordSink()
        servicer = HubIngestServicer(
            IngestPipeline(fallback_sink=sink, clock=clocks.hub),
            batch_size=1,  # the in-memory channel has no end-of-stream flush
        )
        client = SpokeClient(channel=InMemoryChannel(servicer), now=clocks.spoke)
        offsets = servicer.pipeline.offsets

        assert client.last_exchange is None and client.hub_time() is None
        await client.register(mes_manifest())
        measured = client.last_exchange
        assert measured is not None and client.exchanges == 1
        assert measured.offset_seconds == pytest.approx(-2.0)  # hub minus spoke
        assert measured.round_trip_seconds == pytest.approx(0.002)  # 1 ms each way
        assert client.hub_offset_seconds == pytest.approx(-2.0)
        # the spoke can now read hub time off its own clock: its reading is the true time
        assert client.hub_time() == clocks.t

        # the hub learns the spoke's clock when the spoke reports it, with its next Health
        assert not offsets.measured_two_way("forge-mes")
        health = await client.health()
        assert "hub_time" in health and client.exchanges == 2
        assert offsets.measured_two_way("forge-mes")
        spoke_clock = offsets.stats("forge-mes")["spoke"]
        assert spoke_clock.last_seconds == pytest.approx(2.0)  # the series is spoke minus hub
        assert spoke_clock.round_trip_seconds == pytest.approx(0.002)
        assert spoke_clock.within_tolerance is False and spoke_clock.samples == 1
        # two-way, so it is held to the class the spoke declared (it-lan, 10 ms), not to 1 s
        assert spoke_clock.tolerance_seconds == 0.010

        await client.configure({"graphql_url": "http://mes/graphql"})
        await client.start()
        assert await client.stream_records(_records(3)) == 3
        assert client.exchanges == 3  # the Ingest response carried T2 and T3 too
        assert len(sink) == 3
        for record in sink.records:
            ts = record.timestamp
            # the spoke stated its own send time; the hub stamped receipt with its own clock
            assert ts.spoke_time is not None
            assert (ts.spoke_time - ts.ingestion_time).total_seconds() == pytest.approx(
                2.0, abs=0.05
            )
        # the records did not feed the spoke link: it is the two-way series now
        assert offsets.stats("forge-mes")["spoke"].samples == 1

        # the next Health reports the newest exchange
        await client.health()
        assert offsets.stats("forge-mes")["spoke"].samples == 2

    async def test_the_exchange_crosses_the_real_wire(
        self, channel: GrpcChannel, servicer: HubIngestServicer, sink: InMemoryRecordSink
    ) -> None:
        """RegisterRequest.spoke_time, HubTime on the three responses, T1 in the Ingest header."""
        client = SpokeClient(channel=channel)
        await client.register(mes_manifest())
        first = client.last_exchange
        assert first is not None and client.exchanges == 1
        assert first.t1 <= first.t4 and first.t2 <= first.t3
        assert first.round_trip_seconds >= 0
        assert abs(first.offset_seconds) < 0.5  # one machine, one clock

        await client.configure({"graphql_url": "http://mes/graphql"})
        await client.start()
        health = await client.health()
        assert "hub_time" in health and client.exchanges == 2
        offsets = servicer.pipeline.offsets
        assert offsets.measured_two_way("forge-mes")
        spoke_clock = offsets.stats("forge-mes")["spoke"]
        assert spoke_clock.round_trip_seconds == pytest.approx(first.round_trip_seconds)
        assert spoke_clock.last_seconds == pytest.approx(-first.offset_seconds)

        assert await client.stream_records(_records(4)) == 4
        assert client.exchanges == 3
        assert len(sink) == 4 and all(r.timestamp.spoke_time is not None for r in sink.records)

    async def test_a_hub_that_sends_no_time_leaves_the_spoke_unmeasured(self) -> None:
        """A hub from before FB-092 answers without T2 and T3: no exchange, and nothing breaks."""
        servicer = HubIngestServicer(IngestPipeline(fallback_sink=InMemoryRecordSink()))
        servicer.clock = None  # type: ignore[assignment]  # what an older hub's transport lacks
        client = SpokeClient(channel=InMemoryChannel(servicer))
        await client.register(mes_manifest())
        assert client.last_exchange is None and client.exchanges == 0
        assert client.hub_offset_seconds is None

    async def test_a_spoke_that_sends_no_time_is_still_served(self) -> None:
        """A spoke from before FB-092 sends no T1 and reports nothing: measured one-way."""
        hub_now = datetime(2026, 6, 1, 12, 30, tzinfo=UTC)
        servicer = HubIngestServicer(
            IngestPipeline(fallback_sink=InMemoryRecordSink(), clock=lambda: hub_now), batch_size=1
        )
        sid = await _session(servicer)
        old = mes_record()
        old.timestamp.ingestion_time = hub_now - timedelta(seconds=2)  # its send time, the old way
        await servicer.receive_record(sid, pydantic_to_proto(old))
        await servicer.health("forge-mes", sid)  # no spoke_time
        offsets = servicer.pipeline.offsets
        assert not offsets.measured_two_way("forge-mes")
        one_way = offsets.stats("forge-mes")["spoke"]
        assert one_way.last_seconds == -2.0 and one_way.round_trip_seconds is None
