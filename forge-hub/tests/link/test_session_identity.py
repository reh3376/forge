"""FB-292: a module's identity on the link is not a claim in its message.

The three attacks an adversary of the security framework proved on the real hub code
(2026-11-24), run against the fix, with the real HubIngestServicer, WriteDispatcher and gRPC
servicer: (a) a second Register of a running module took over its write-backs; (b) session
ids were guessable and Configure worked on a session the caller never opened; (c) an Ingest
that named no session was filed under the most recent session of any module. And what the
fix adds: a stale session is replaced, an active one never; a session opened under one
certificate identity is refused to another; the same identity may restart at once.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import grpc
import pytest

from forge_core.link.proto_bridge import contextual_record_to_proto
from forge_core.link.serialization import pydantic_to_proto
from forge_core.link.spoke_callback import CALLBACK_PARAM, WriteDispatcher
from forge_core.link.spoke_client import InMemoryChannel
from forge_core.models.adapter import AdapterManifest
from forge_core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge_hub.link.grpc_server import ForgeAdapterServiceServicer
from forge_hub.link.hub_ingest import HubIngestServicer
from forge_hub.link.hub_server import (
    SESSION_ACTIVE,
    SESSION_MISSING,
    SESSION_PEER_MISMATCH,
    SESSION_REPLACED,
    SESSION_UNKNOWN,
    SessionRefusedError,
    is_unguessable_session_id,
)

REPO = Path(__file__).resolve().parents[3]
MANIFEST = REPO / "forge-modules/forge-mes/src/python/forge_mes/manifest.json"


class Spoke:
    def __init__(self, name: str) -> None:
        self.name, self.writes = name, []

    async def write(self, adapter_id, session_id, tag_path, value, confirm):
        self.writes.append((tag_path, value))
        return {"success": True, "message": f"written by {self.name}"}

    async def discover(self, adapter_id, session_id):
        return {"tags": []}


class Ctx:
    """A gRPC context carrying the metadata a test gives it."""

    def __init__(self, md: dict[str, str]) -> None:
        self.md, self.code, self.trailer = md, None, ()

    def invocation_metadata(self):
        return list(self.md.items())

    def set_code(self, code):
        self.code = code

    def set_details(self, details):
        pass

    def set_trailing_metadata(self, trailer):
        self.trailer = trailer


class Hub:
    """The real servicer and dispatcher, with a monotonic clock the test moves."""

    def __init__(self) -> None:
        self.legit, self.evil = Spoke("legit"), Spoke("intruder")
        urls = {"mes-backend:50052": self.legit, "evil:6666": self.evil}

        async def factory(url):
            return InMemoryChannel(urls[url])

        self.dispatcher = WriteDispatcher(channel_factory=factory)
        self.servicer = HubIngestServicer(write_dispatcher=self.dispatcher)
        self.t = 1000.0
        self.servicer.monotonic = lambda: self.t
        self.manifest = pydantic_to_proto(
            AdapterManifest.model_validate(json.loads(MANIFEST.read_text(encoding="utf-8")))
        )

    async def open(self, url: str, peer: str | None = None) -> str:
        reg = await self.servicer.register(self.manifest, peer=peer)
        assert reg["accepted"], reg["message"]
        sid = reg["session_id"]
        await self.servicer.configure("forge-mes", sid, {CALLBACK_PARAM: url})
        await self.servicer.start("forge-mes", sid)
        return sid

    async def write_goes_to(self) -> str:
        out = await self.dispatcher.write(
            "forge-mes", "mes.changeover.cooker.request", {"by": "ot"}
        )
        return out.message


def _record() -> ContextualRecord:
    return ContextualRecord(
        source=RecordSource(adapter_id="forge-mes", system="forge-mes", tag_path="mes.x"),
        timestamp=RecordTimestamp(source_time=datetime(2026, 6, 1, 12, tzinfo=UTC)),
        value=RecordValue(raw=1.0, quality=QualityCode.GOOD, data_type="float64"),
        context=RecordContext(area="distillery01"),
        lineage=RecordLineage(
            schema_ref="forge://schemas/forge-mes/v0.1.0",
            adapter_id="forge-mes",
            adapter_version="0.1.0",
        ),
    )


async def _stream():
    yield contextual_record_to_proto(_record())


async def test_a_second_register_cannot_take_over_a_running_module() -> None:
    """(a) While the module's session is active, a second Register is refused, by name."""
    hub = Hub()
    await hub.open("mes-backend:50052")
    hub.t += 30  # the module is alive: its last call was 30 s ago
    second = await hub.servicer.register(hub.manifest)
    assert second["accepted"] is False and second["refusal_cause"] == SESSION_ACTIVE
    assert await hub.write_goes_to() == "written by legit"
    assert hub.evil.writes == []
    assert hub.servicer.describe_sessions()["refusals"] == {SESSION_ACTIVE: 1}


async def test_session_ids_are_unguessable_and_a_guess_opens_nothing() -> None:
    """(b) The id is 256 random bits; the old form opens nothing and is refused by name."""
    hub = Hub()
    sid = await hub.open("mes-backend:50052")
    assert is_unguessable_session_id(sid, "forge-mes")
    with pytest.raises(SessionRefusedError) as refused:
        await hub.servicer.configure(
            "forge-mes", "session-forge-mes-0", {CALLBACK_PARAM: "evil:6666"}
        )
    assert refused.value.cause == SESSION_UNKNOWN
    assert await hub.write_goes_to() == "written by legit"


@pytest.mark.parametrize(
    ("headers", "cause", "code"),
    [
        ({}, SESSION_MISSING, grpc.StatusCode.FAILED_PRECONDITION),
        ({"x-forge-adapter-id": "forge-mes"}, SESSION_MISSING, grpc.StatusCode.FAILED_PRECONDITION),
        ({"x-forge-session-id": "SID"}, SESSION_MISSING, grpc.StatusCode.FAILED_PRECONDITION),
        (
            {"x-forge-adapter-id": "forge-wms", "x-forge-session-id": "SID"},
            SESSION_UNKNOWN,
            grpc.StatusCode.PERMISSION_DENIED,
        ),
    ],
    ids=["no headers", "no session", "no module", "another module"],
)
async def test_an_ingest_must_name_its_session_and_its_module(headers, cause, code) -> None:
    """(c) Nothing is guessed: no fallback to the most recent session of any module."""
    hub = Hub()
    sid = await hub.open("mes-backend:50052")
    ctx = Ctx({k: (sid if v == "SID" else v) for k, v in headers.items()})
    resp = await ForgeAdapterServiceServicer(hub.servicer).Ingest(_stream(), ctx)
    assert resp.records_received == 0 and resp.success is False
    assert ctx.code == code and ctx.trailer and ctx.trailer[0][1] == cause
    assert all(s.records_received == 0 for s in hub.servicer._sessions.values())


async def test_a_named_ingest_from_the_session_lands_in_it() -> None:
    hub = Hub()
    sid = await hub.open("mes-backend:50052")
    ctx = Ctx({"x-forge-adapter-id": "forge-mes", "x-forge-session-id": sid})
    resp = await ForgeAdapterServiceServicer(hub.servicer).Ingest(_stream(), ctx)
    assert resp.success is True and resp.records_received == 1


async def test_a_stale_session_is_replaced_and_its_write_backs_go_with_it() -> None:
    """A module that died: its session goes quiet past the window; the restarted module's
    Register replaces it, the old callback is dropped, and the replacement is counted."""
    hub = Hub()
    old = await hub.open("evil:6666")  # the old session's callback, to show it is dropped
    hub.t += hub.servicer.stale_seconds + 1
    new = await hub.open("mes-backend:50052")
    assert new != old and old not in hub.servicer._sessions
    assert await hub.write_goes_to() == "written by legit"
    assert hub.servicer.describe_sessions()["refusals"] == {SESSION_REPLACED: 1}


async def test_a_session_is_bound_to_the_identity_that_opened_it() -> None:
    """Under mutual TLS: another certificate is refused; the same one may restart at once."""
    hub = Hub()
    sid = await hub.open("mes-backend:50052", peer="x509:forge-mes")
    assert hub.servicer.check_session("forge-mes", sid, "x509:forge-mes").session_id == sid
    with pytest.raises(SessionRefusedError) as refused:
        hub.servicer.check_session("forge-mes", sid, "x509:someone-else")
    assert refused.value.cause == SESSION_PEER_MISMATCH
    other = await hub.servicer.register(hub.manifest, peer="x509:someone-else")
    assert other["refusal_cause"] == SESSION_ACTIVE  # another identity waits for staleness
    again = await hub.servicer.register(hub.manifest, peer="x509:forge-mes")
    assert again["accepted"] is True and sid not in hub.servicer._sessions  # a quick restart
