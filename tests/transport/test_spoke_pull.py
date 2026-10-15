"""Hub pulls from the spoke: Backfill, Subscribe, Unsubscribe (FB-061)."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import grpc
import grpc.aio
import pytest

from forge.core.models.adapter import AdapterManifest
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
from forge.proto_gen.forge.v1 import adapter_service_pb2 as service_msg
from forge.proto_gen.forge.v1 import adapter_service_pb2_grpc as service_grpc
from forge.transport.proto_bridge import contextual_record_to_proto, timestamp_to_dt
from forge.transport.serialization import pydantic_to_proto
from forge.transport.spoke_callback import CALLBACK_PARAM, WriteDispatcher, WriteDispatchError
from forge.transport.spoke_client import InMemoryChannel
from forge.transport.spoke_pull import (
    BACKFILL_SESSION,
    PullOutcome,
    SubscriptionManager,
    backfill_into_pipeline,
)

MANIFEST_PATH = (
    Path(__file__).resolve().parents[2]
    / "src"
    / "forge"
    / "adapters"
    / "forge_mes"
    / "manifest.json"
)
MANIFEST = AdapterManifest.model_validate(json.loads(MANIFEST_PATH.read_text()))
SCHEMA_REF = MANIFEST.data_contract.schema_ref
T0 = datetime(2026, 6, 1, 12, tzinfo=UTC)


def record(i: int, tag: str = "mes.backend.scheduleorder") -> ContextualRecord:
    return ContextualRecord(
        source=RecordSource(adapter_id="forge-mes", system="forge-mes", tag_path=tag),
        timestamp=RecordTimestamp(source_time=T0 + timedelta(seconds=i)),
        value=RecordValue(
            raw={"i": i, "status": "Active"}, quality=QualityCode.GOOD, data_type="object"
        ),
        context=RecordContext(
            area="distillery01",
            equipment_id="COOKER_01",
            extra={
                "event_type": "audit.update",
                "entity_type": "ScheduleOrder",
                "replay": "backfill",
            },
        ),
        lineage=RecordLineage(
            schema_ref=SCHEMA_REF, adapter_id="forge-mes", adapter_version="0.1.0"
        ),
    )


# ---------------------------------------------------------------------------
# In-memory fake spoke
# ---------------------------------------------------------------------------


class FakeSpoke:
    """What the MES backend serves on Backfill / Subscribe / Unsubscribe."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.subscriptions: dict[str, asyncio.Queue[ContextualRecord | None]] = {}
        self.down = False
        self.explode_mid_stream = False
        self.seq = 0

    async def backfill(self, adapter_id, session_id, tags, start, end, max_records):
        if self.down:
            msg = "spoke down"
            raise ConnectionError(msg)
        self.calls.append(
            {
                "adapter_id": adapter_id,
                "session_id": session_id,
                "tags": tags,
                "start": start,
                "end": end,
                "max_records": max_records,
            }
        )
        for i in range(max_records or 5):
            if self.explode_mid_stream and i == 2:
                msg = "database went away"
                raise RuntimeError(msg)
            yield pydantic_to_proto(record(i))

    async def subscribe(self, adapter_id, session_id, tags):
        if self.down:
            msg = "spoke down"
            raise ConnectionError(msg)
        self.seq += 1
        sid = f"sub-{self.seq}"
        queue: asyncio.Queue[ContextualRecord | None] = asyncio.Queue()
        self.subscriptions[sid] = queue
        self.calls.append({"subscribe": sid, "tags": tags})
        yield {"subscription_id": sid}
        while True:
            item = await queue.get()
            if item is None:
                return
            if self.explode_mid_stream:
                msg = "stream broke"
                raise RuntimeError(msg)
            yield pydantic_to_proto(item)

    async def unsubscribe(self, adapter_id, session_id, subscription_id):
        queue = self.subscriptions.pop(subscription_id, None)
        if queue is None:
            return {"success": False, "message": f"unknown subscription '{subscription_id}'"}
        queue.put_nowait(None)
        return {"success": True, "message": "ended"}

    def push(self, sid: str, rec: ContextualRecord) -> None:
        self.subscriptions[sid].put_nowait(rec)


def dispatcher_for(spoke: FakeSpoke) -> WriteDispatcher:
    async def factory(url: str):
        return InMemoryChannel(spoke)

    dispatcher = WriteDispatcher(channel_factory=factory)
    dispatcher.register_callback("forge-mes", "sess-1", {CALLBACK_PARAM: "mes-backend:50052"})
    return dispatcher


async def wait_for(predicate, *, timeout: float = 3.0) -> None:
    async with asyncio.timeout(timeout):
        while not predicate():
            await asyncio.sleep(0.01)


# ---------------------------------------------------------------------------
# Backfill
# ---------------------------------------------------------------------------


async def test_backfill_streams_batches_into_the_pipeline() -> None:
    spoke = FakeSpoke()
    dispatcher = dispatcher_for(spoke)
    sink = InMemoryRecordSink()
    pipeline = IngestPipeline(fallback_sink=sink)
    logged: list[tuple[str, str, IngestOutcome]] = []

    async def on_batch(adapter_id, session, outcome):
        logged.append((adapter_id, session, outcome))

    outcome = await backfill_into_pipeline(
        dispatcher,
        pipeline,
        adapter_id="forge-mes",
        start=T0,
        end=T0 + timedelta(hours=1),
        tags=["mes.backend"],
        max_records=5,
        manifest=MANIFEST,
        batch_size=2,
        on_batch=on_batch,
    )
    assert (outcome.received, outcome.persisted, outcome.batches) == (5, 5, 3)
    assert outcome.mode == "backfill" and outcome.completed_at is not None
    assert len(sink) == 5 and sink.records[0].value.raw["i"] == 0
    assert [s for _, s, _ in logged] == [BACKFILL_SESSION] * 3
    assert [o.received for _, _, o in logged] == [2, 2, 1]
    call = spoke.calls[0]
    assert call["session_id"] == "sess-1" and call["tags"] == ["mes.backend"]
    assert call["start"] == T0 and call["max_records"] == 5
    assert outcome.to_dict()["errors"] == []


async def test_backfill_failures_surface_but_keep_what_landed() -> None:
    spoke = FakeSpoke()
    dispatcher = dispatcher_for(spoke)
    sink = InMemoryRecordSink()
    pipeline = IngestPipeline(fallback_sink=sink)

    spoke.down = True
    with pytest.raises(WriteDispatchError) as info:
        await backfill_into_pipeline(
            dispatcher, pipeline, adapter_id="forge-mes", start=T0, end=T0, manifest=MANIFEST
        )
    assert info.value.code == "transport" and "spoke down" in info.value.message

    spoke.down = False
    spoke.explode_mid_stream = True
    with pytest.raises(WriteDispatchError):
        await backfill_into_pipeline(
            dispatcher,
            pipeline,
            adapter_id="forge-mes",
            start=T0,
            end=T0,
            manifest=MANIFEST,
            batch_size=1,
        )
    assert len(sink) == 2  # the two records before the failure were ingested

    bare = WriteDispatcher(channel_factory=lambda url: InMemoryChannel(spoke))
    with pytest.raises(WriteDispatchError) as info:
        async for _ in bare.backfill("nope", T0, T0):
            pass
    assert info.value.code == "no_callback"
    await dispatcher.close()


# ---------------------------------------------------------------------------
# Subscriptions
# ---------------------------------------------------------------------------


async def test_subscription_manager_ingests_until_stopped() -> None:
    spoke = FakeSpoke()
    dispatcher = dispatcher_for(spoke)
    sink = InMemoryRecordSink()
    pipeline = IngestPipeline(fallback_sink=sink)
    logged: list[str] = []
    manager = SubscriptionManager(
        dispatcher,
        pipeline,
        manifest_for=lambda aid: MANIFEST,
        on_batch=lambda aid, session, outcome: logged.append(session),
        batch_size=2,
        flush_interval=0.05,
    )

    handle = await manager.start("forge-mes", ["mes.backend"])
    assert handle.subscription_id == "sub-1" and spoke.calls[-1]["tags"] == ["mes.backend"]
    assert manager.list("forge-mes") == [handle] and not handle.ended

    spoke.push("sub-1", record(1))
    spoke.push("sub-1", record(2))
    await wait_for(lambda: len(sink) == 2)  # batch_size reached
    spoke.push("sub-1", record(3))
    await wait_for(lambda: len(sink) == 3)  # periodic flush of a partial batch
    assert handle.outcome.received == 3 and handle.outcome.persisted == 3
    assert logged == ["subscription:sub-1"] * 2
    assert manager.snapshot()["active"] == 1

    stopped = await manager.stop("forge-mes", "sub-1")
    assert stopped is handle and handle.ended and handle.outcome.completed_at is not None
    assert "sub-1" not in spoke.subscriptions  # Unsubscribe reached the spoke
    assert manager.list() == [] and manager.snapshot()["active"] == 0
    with pytest.raises(KeyError):
        await manager.stop("forge-mes", "sub-1")
    await manager.close()
    await dispatcher.close()


async def test_subscription_stream_errors_end_the_handle() -> None:
    spoke = FakeSpoke()
    dispatcher = dispatcher_for(spoke)
    pipeline = IngestPipeline(fallback_sink=InMemoryRecordSink())
    manager = SubscriptionManager(dispatcher, pipeline, flush_interval=0)

    handle = await manager.start("forge-mes")
    spoke.explode_mid_stream = True
    spoke.push(handle.subscription_id, record(1))
    await wait_for(lambda: handle.ended)
    assert "stream broke" in (handle.last_error or "")
    assert handle.to_dict()["active"] is False

    spoke.down = True
    with pytest.raises(WriteDispatchError):
        await manager.start("forge-mes")
    await manager.close()
    await dispatcher.close()


def test_pull_outcome_accumulates() -> None:
    outcome = PullOutcome(adapter_id="forge-mes", mode="backfill")
    outcome.add(IngestOutcome(received=3, accepted=2, rejected=1, persisted=2, errors=["bad"]))
    outcome.add(IngestOutcome(received=1, accepted=1, persisted=1))
    assert (outcome.received, outcome.persisted, outcome.rejected, outcome.batches) == (4, 3, 1, 2)
    assert outcome.to_dict()["errors"] == ["bad"]


# ---------------------------------------------------------------------------
# Live: real gRPC server-streaming to a spoke stub
# ---------------------------------------------------------------------------


class PullStub(service_grpc.AdapterServiceServicer):
    def __init__(self) -> None:
        self.backfill_requests: list[service_msg.BackfillRequest] = []
        self.queue: asyncio.Queue[ContextualRecord | None] = asyncio.Queue()
        self.unsubscribed: list[str] = []

    async def Backfill(self, request, context):  # noqa: N802
        self.backfill_requests.append(request)
        for i in range(request.max_records or 3):
            yield contextual_record_to_proto(record(i))

    async def Subscribe(self, request, context):  # noqa: N802
        await context.send_initial_metadata((("subscription-id", "sub-7"),))
        while True:
            item = await self.queue.get()
            if item is None:
                return
            yield contextual_record_to_proto(item)

    async def Unsubscribe(self, request, context):  # noqa: N802
        self.unsubscribed.append(request.subscription_id)
        self.queue.put_nowait(None)
        return service_msg.UnsubscribeResponse(success=True, message="ended")


@pytest.fixture()
async def pull_server():
    stub = PullStub()
    server = grpc.aio.server()
    service_grpc.add_AdapterServiceServicer_to_server(stub, server)
    port = server.add_insecure_port("localhost:0")
    await server.start()
    yield stub, port
    await server.stop(grace=0.5)


async def test_live_backfill_and_subscription(pull_server) -> None:
    stub, port = pull_server
    dispatcher = WriteDispatcher()
    dispatcher.register_callback("forge-mes", "expected", {CALLBACK_PARAM: f"localhost:{port}"})

    got = [
        r
        async for r in dispatcher.backfill(
            "forge-mes", T0, T0 + timedelta(hours=2), tags=["mes.backend"], max_records=4
        )
    ]
    assert [r.value.raw["i"] for r in got] == [0, 1, 2, 3]
    assert got[0].context.extra["replay"] == "backfill" and got[0].lineage.schema_ref == SCHEMA_REF
    req = stub.backfill_requests[0]
    assert list(req.tags) == ["mes.backend"] and req.max_records == 4
    assert timestamp_to_dt(req.start_time) == T0
    assert timestamp_to_dt(req.end_time) == T0 + timedelta(hours=2)

    sid, stream = await dispatcher.subscribe("forge-mes", ["mes.backend"])
    assert sid == "sub-7"
    stub.queue.put_nowait(record(9))
    first = await anext(stream)
    assert first.value.raw["i"] == 9 and first.source.tag_path == "mes.backend.scheduleorder"
    assert (await dispatcher.unsubscribe("forge-mes", sid))["success"] is True
    assert stub.unsubscribed == ["sub-7"]
    assert await anext(stream, None) is None  # the spoke ended the stream
    await dispatcher.close()
