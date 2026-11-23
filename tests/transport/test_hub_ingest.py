"""HubIngestServicer: FACTS-checked registration, batched persistence (FB-053)."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

from forge_core.clock import ClockRefusedError
from forge_core.link.grpc_channel import GrpcChannel
from forge_core.link.serialization import pydantic_to_proto
from forge_core.link.spoke_client import InMemoryChannel, SpokeClient
from forge_core.models.adapter import AdapterHealth, AdapterManifest, AdapterState
from forge_core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge_hub.ingest.pipeline import IngestOutcome, IngestPipeline, InMemoryRecordSink
from forge_hub.link.grpc_server import GrpcServer
from forge_hub.link.hub_ingest import HubIngestServicer

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

    def advance(self, seconds: float) -> None:
        self.t += timedelta(seconds=seconds)

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
        # the records did not feed the spoke link: it is the two-way series now, and the
        # Ingest call carried the measurement of the Health before it in its headers
        assert offsets.stats("forge-mes")["spoke"].samples == 2

        # the next Health reports the newest exchange
        await client.health()
        assert offsets.stats("forge-mes")["spoke"].samples == 3

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
        servicer.hub_time = None  # type: ignore[method-assign]  # an older hub answers without it
        client = SpokeClient(channel=InMemoryChannel(servicer))
        await client.register(mes_manifest())
        assert client.last_exchange is None and client.exchanges == 0
        assert client.hub_offset_seconds is None

    async def test_a_spoke_that_sends_no_time_is_measured_one_way(self) -> None:
        """A spoke that reports nothing is measured one-way from its records, until the
        hub refuses it for a clock it cannot read (FB-093, ``TestSpokeClockGate``)."""
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


# ---------------------------------------------------------------------------
# The hub fails closed on a spoke's clock (FB-093 hub half, one-clock record P-5)
# ---------------------------------------------------------------------------

OUT_OF_TOLERANCE = "CLOCK_OUT_OF_TOLERANCE"
UNREADABLE = "CLOCK_UNREADABLE"
PARAMS = {"graphql_url": "http://mes/graphql"}


class GatedHub:
    """A hub and one spoke on clocks the test moves; ``seen`` is what the registry is told."""

    def __init__(self, skew_seconds: float) -> None:
        self.clocks = SkewedClocks(skew_seconds)
        self.sink = InMemoryRecordSink()
        self.seen: list[AdapterHealth] = []
        self.servicer = HubIngestServicer(
            IngestPipeline(fallback_sink=self.sink, clock=self.clocks.hub),
            batch_size=1,
            on_health=lambda _adapter_id, health: self.seen.append(health),
        )
        self.gates = self.servicer.gates

    def spoke(self) -> SpokeClient:
        return SpokeClient(channel=InMemoryChannel(self.servicer), now=self.clocks.spoke)

    async def started(self) -> SpokeClient:
        client = self.spoke()
        await client.register(mes_manifest())
        await client.configure(PARAMS)
        await client.start()
        return client

    async def probes(self, client: SpokeClient, n: int) -> None:
        """``n`` Health calls 30 s apart: each reports the exchange of the call before."""
        for _ in range(n):
            self.clocks.advance(30)
            await client.health()

    @property
    def state(self) -> str:
        return self.gates.state("forge-mes")


class TestSpokeClockGate:
    async def test_three_measurements_outside_the_class_refuse_the_spoke(self) -> None:
        """Three in a row, then Register and Ingest are refused, with the cause, never silent."""
        hub = GatedHub(2.0)  # the spoke's clock is 2 s ahead; it declared it-lan, 10 ms
        client = await hub.started()

        await hub.probes(client, 2)
        assert hub.state == "OK"
        assert await client.stream_records(_records(1)) == 1  # two bad probes: still served
        assert len(hub.sink) == 1

        hub.clocks.advance(30)
        health = await client.health()  # the third
        assert hub.state == OUT_OF_TOLERANCE
        # the spoke is told on the wire: its state and the cause
        assert health["error_message"].startswith(
            f"{OUT_OF_TOLERANCE}: clock spoke:forge-mes is +2.0"
        )
        assert "tolerance class it-lan allows 0.01 s" in health["error_message"]

        with pytest.raises(ClockRefusedError) as ingest:
            await client.stream_records(_records(2))
        assert ingest.value.cause == "clock_out_of_tolerance"
        assert len(hub.sink) == 1  # nothing of the refused stream was taken

        restarted = hub.spoke()
        with pytest.raises(ClockRefusedError) as register:
            await restarted.register(mes_manifest())
        assert register.value.cause == "clock_out_of_tolerance"
        assert restarted.session_id is None
        assert restarted.exchanges == 1  # the refused answer still carried the hub's time

        # the hub's own view, as the registry, the API and the CLI get it
        told = hub.seen[-1]
        assert told.state == AdapterState.DEGRADED and told.last_healthy is None
        assert told.clock_state == OUT_OF_TOLERANCE
        assert told.last_refusal == told.error_message
        assert told.refusals == {"clock_out_of_tolerance": 2}  # one Ingest, one Register
        gate = told.clock_gate
        assert gate is not None and gate["clock_id"] == "spoke:forge-mes"
        assert gate["tolerance_class"] == "it-lan" and gate["tolerance_seconds"] == 0.010
        assert gate["since"] is not None and gate["entries"] == 1
        assert gate["last_offset_seconds"] == pytest.approx(2.0)
        snapshot = hub.servicer.snapshot()
        assert snapshot["clock_gates"]["refused"] == {"forge-mes": OUT_OF_TOLERANCE}
        assert snapshot["sessions"][0]["clock_state"] == OUT_OF_TOLERANCE

    async def test_three_good_measurements_readmit_the_spoke(self) -> None:
        """Health is answered while refused, so the spoke goes on measuring and comes back."""
        hub = GatedHub(2.0)
        client = await hub.started()
        await hub.probes(client, 3)
        assert hub.state == OUT_OF_TOLERANCE

        hub.clocks.skew = timedelta(0)  # the spoke's clock is put right
        await hub.probes(client, 1)  # reports the exchange taken before the fix: still bad
        await hub.probes(client, 2)  # two good probes are not enough
        assert hub.state == OUT_OF_TOLERANCE
        with pytest.raises(ClockRefusedError):
            await client.stream_records(_records(1))

        await hub.probes(client, 1)  # the third good probe
        assert hub.state == "OK"
        told = hub.seen[-1]
        assert told.state == AdapterState.HEALTHY and told.clock_state == "OK"
        assert told.last_refusal is None and told.error_message is None
        assert told.refusals == {"clock_out_of_tolerance": 1}  # what was refused stays counted
        assert await client.stream_records(_records(2)) == 2
        assert len(hub.sink) == 2

    async def test_a_refused_spoke_that_lost_its_session_returns_by_retrying_register(
        self,
    ) -> None:
        """A Register that reports a measurement is a probe; the refused answer carries T2, T3."""
        hub = GatedHub(2.0)
        client = await hub.started()
        await hub.probes(client, 3)
        assert hub.state == OUT_OF_TOLERANCE

        hub.clocks.skew = timedelta(0)
        restarted = hub.spoke()  # a new process: no session and no measurement yet
        attempts = 0
        while restarted.session_id is None:
            hub.clocks.advance(5)
            attempts += 1
            assert attempts < 10
            try:
                await restarted.register(mes_manifest())
            except ClockRefusedError:
                continue
        # the first attempt had nothing to report; the next three reported good measurements
        assert attempts == 4
        assert hub.state == "OK"

    async def test_a_spoke_that_reports_no_measurement_is_refused(self) -> None:
        """A clock the hub cannot read: three requests without a measurement, then refusal."""
        hub = GatedHub(0.0)
        sid = await _session(hub.servicer)  # a first Register cannot carry one: not counted
        for _ in range(2):
            hub.clocks.advance(30)
            await hub.servicer.health("forge-mes", sid)
        assert hub.state == "OK"
        await hub.servicer.receive_record(sid, pydantic_to_proto(mes_record(0)))

        hub.clocks.advance(30)
        await hub.servicer.health("forge-mes", sid)
        assert hub.state == UNREADABLE
        told = hub.seen[-1]
        assert told.state == AdapterState.DEGRADED
        assert told.error_message is not None
        assert told.error_message.startswith(
            f"{UNREADABLE}: clock spoke:forge-mes could not be read for 3 consecutive probes"
        )
        assert "carried no time-exchange measurement" in told.error_message
        with pytest.raises(ClockRefusedError) as begin:
            await hub.servicer.begin_ingest(sid)
        assert begin.value.cause == "clock_unreadable"
        with pytest.raises(ClockRefusedError):
            await hub.servicer.receive_record(sid, pydantic_to_proto(mes_record(1)))
        assert len(hub.sink) == 1
        assert hub.gates.refused_requests("forge-mes") == {"clock_unreadable": 2}

    async def test_an_ingest_call_is_a_probe_too(self) -> None:
        """A spoke that only streams is judged by the measurement in its Ingest headers."""
        hub = GatedHub(2.0)
        client = await hub.started()
        for i in range(2):
            hub.clocks.advance(30)
            assert await client.stream_records(_records(1)) == 1, i
        hub.clocks.advance(30)
        with pytest.raises(ClockRefusedError):  # refused by this very call's measurement
            await client.stream_records(_records(1))
        assert hub.state == OUT_OF_TOLERANCE and len(hub.sink) == 2

    async def test_a_burst_of_requests_is_one_probe(self) -> None:
        """At most one probe a second: a transient cannot refuse a spoke, nor readmit one."""
        hub = GatedHub(2.0)
        client = await hub.started()
        for _ in range(6):
            await client.health()  # a millisecond apart
        assert hub.state == "OK"
        gate = hub.gates.describe_gate("forge-mes")
        assert gate is not None and gate["consecutive_out_of_tolerance"] == 1
        # every measurement still went on the series
        assert hub.servicer.pipeline.offsets.stats("forge-mes")["spoke"].samples == 6

    async def test_a_manifest_without_time_governance_is_refused(self) -> None:
        """No declared class, nothing to hold the clock to: the check is not optional."""
        seen: list[AdapterHealth] = []
        servicer = HubIngestServicer(on_health=lambda _aid, health: seen.append(health))
        bare = mes_manifest()
        bare.time_governance = None
        reg = await servicer.register(pydantic_to_proto(bare))
        assert reg["accepted"] is False and reg["session_id"] == ""
        assert reg["refusal_cause"] == "time_governance_missing"
        assert reg["message"].startswith("time_governance_missing: the manifest of 'forge-mes'")
        snapshot = servicer.snapshot()
        assert snapshot["sessions"] == []
        assert snapshot["refused_registrations"] == {"forge-mes": 1}
        assert seen[-1].state == AdapterState.DEGRADED
        assert seen[-1].refusals == {"time_governance_missing": 1}
        with pytest.raises(RuntimeError, match="time_governance_missing"):
            await SpokeClient(channel=InMemoryChannel(servicer)).register(bare)

    async def test_the_refusal_crosses_the_real_wire(
        self, channel: GrpcChannel, servicer: HubIngestServicer, sink: InMemoryRecordSink
    ) -> None:
        """accepted=false on Register, FAILED_PRECONDITION on Ingest, the cause in the trailer."""
        client = SpokeClient(channel=channel)
        await client.register(mes_manifest())
        await client.configure(PARAMS)
        await client.start()
        assert await client.stream_records(_records(1)) == 1

        # three measurements 5 s off, as the spoke would have reported them
        start = servicer.clock()
        for i in range(3):
            at = start + timedelta(seconds=30 * (i + 1))
            servicer.gates.probe(
                "forge-mes", at, offset_seconds=-5.0, round_trip_seconds=0.002, measured_at=at
            )
        assert servicer.gates.state("forge-mes") == OUT_OF_TOLERANCE

        with pytest.raises(ClockRefusedError) as ingest:
            await client.stream_records(_records(3))
        assert ingest.value.cause == "clock_out_of_tolerance"
        assert OUT_OF_TOLERANCE in str(ingest.value) and "+5.0" in str(ingest.value)
        assert len(sink) == 1

        restarted = SpokeClient(channel=channel)
        with pytest.raises(ClockRefusedError) as register:
            await restarted.register(mes_manifest())
        assert register.value.cause == "clock_out_of_tolerance"
        assert restarted.exchanges == 1  # the hub's time came back with the refusal

        health = await client.health()  # still answered, and it says why
        assert OUT_OF_TOLERANCE in health["error_message"]
