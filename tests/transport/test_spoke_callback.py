"""Hub → spoke write-back: WriteDispatcher, servicer wiring, live gRPC (FB-054)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
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
from forge.proto_gen.forge.v1 import adapter_service_pb2 as service_msg
from forge.proto_gen.forge.v1 import adapter_service_pb2_grpc as service_grpc
from forge.transport.grpc_channel import GrpcChannel
from forge.transport.grpc_server import GrpcServer
from forge.transport.hub_ingest import HubIngestServicer
from forge.transport.proto_bridge import contextual_record_to_proto, get_typed_value
from forge.transport.serialization import pydantic_to_proto
from forge.transport.spoke_callback import (
    CALLBACK_PARAM,
    SpokeCallbackClient,
    WriteDispatcher,
    WriteDispatchError,
)
from forge.transport.spoke_client import InMemoryChannel, SpokeClient

MES_MANIFEST = Path(__file__).resolve().parents[2] / "src" / "forge" / "adapters"
MES_MANIFEST = MES_MANIFEST / "forge_mes" / "manifest.json"


def mes_manifest() -> AdapterManifest:
    return AdapterManifest.model_validate(json.loads(MES_MANIFEST.read_text()))


def state_record(area: str, state: str) -> ContextualRecord:
    return ContextualRecord(
        source=RecordSource(
            adapter_id="forge-mes", system="forge-mes", tag_path=f"mes.changeover.{area}.state"
        ),
        timestamp=RecordTimestamp(source_time=datetime(2026, 6, 1, 12, tzinfo=UTC)),
        value=RecordValue(
            raw={"area": area, "state": state}, quality=QualityCode.GOOD, data_type="object"
        ),
        context=RecordContext(area="distillery01", extra={"event_type": "changeover.cip-complete"}),
        lineage=RecordLineage(
            schema_ref="forge://schemas/forge-mes/v0.1.0",
            adapter_id="forge-mes",
            adapter_version="0.1.0",
        ),
    )


# ---------------------------------------------------------------------------
# A fake spoke (in-memory): what the MES backend does on Write / Discover
# ---------------------------------------------------------------------------


class FakeSpoke:
    def __init__(self) -> None:
        self.writes: list[dict[str, Any]] = []
        self.refuse = False
        self.explode = False

    async def write(self, adapter_id, session_id, tag_path, value, confirm):
        if self.explode:
            raise ConnectionError("spoke down")
        self.writes.append(
            {
                "adapter_id": adapter_id,
                "session_id": session_id,
                "tag_path": tag_path,
                "value": value,
                "confirm": confirm,
            }
        )
        if self.refuse:
            return {"success": False, "message": "state PRODUCTION does not allow cip-complete"}
        readback = pydantic_to_proto(state_record("cooker", "RECIPE_LOADING")) if confirm else None
        return {"success": True, "message": "ok", "readback": readback}

    async def discover(self, adapter_id, session_id):
        return {"tags": [{"tag_path": "mes.changeover.cooker.cip-complete", "data_type": "object"}]}


def in_memory_dispatcher(spoke: FakeSpoke, **kwargs) -> WriteDispatcher:
    async def factory(url: str):
        assert url == "mes-backend:50052"
        return InMemoryChannel(spoke)

    return WriteDispatcher(channel_factory=factory, **kwargs)


class TestWriteDispatcher:
    async def test_write_goes_to_the_registered_callback_and_counts(self) -> None:
        spoke = FakeSpoke()
        dispatcher = in_memory_dispatcher(spoke)
        target = dispatcher.register_callback(
            "forge-mes", "sess-1", {CALLBACK_PARAM: "mes-backend:50052", "graphql_url": "x"}
        )
        assert target is not None and target.url == "mes-backend:50052"

        outcome = await dispatcher.write(
            "forge-mes",
            "mes.changeover.cooker.cip-complete",
            {"cipStartTime": "a", "cipEndTime": "b"},
            confirm=True,
        )
        assert outcome.success and outcome.message == "ok"
        assert outcome.readback is not None
        assert outcome.readback.value.raw == {"area": "cooker", "state": "RECIPE_LOADING"}
        assert outcome.completed_at is not None
        assert spoke.writes[0]["session_id"] == "sess-1"
        assert spoke.writes[0]["confirm"] is True

        snap = dispatcher.snapshot()
        assert snap["callback_param"] == CALLBACK_PARAM
        t = snap["targets"][0]
        assert (t["writes"], t["succeeded"], t["failed"]) == (1, 1, 0)
        assert t["last_outcome"]["readback"]["source"]["tag_path"] == "mes.changeover.cooker.state"

    async def test_refused_write_is_a_failed_outcome_not_an_error(self) -> None:
        spoke = FakeSpoke()
        spoke.refuse = True
        dispatcher = in_memory_dispatcher(spoke)
        dispatcher.register_callback("forge-mes", "sess-1", {CALLBACK_PARAM: "mes-backend:50052"})
        outcome = await dispatcher.write("forge-mes", "mes.changeover.cooker.cip-complete", {})
        assert not outcome.success and "does not allow" in outcome.message
        target = dispatcher.target_for("forge-mes")
        assert target is not None and target.failed == 1 and target.last_error == outcome.message

    async def test_transport_failure_raises_and_drops_the_channel(self) -> None:
        spoke = FakeSpoke()
        dispatcher = in_memory_dispatcher(spoke)
        dispatcher.register_callback("forge-mes", "sess-1", {CALLBACK_PARAM: "mes-backend:50052"})
        await dispatcher.write("forge-mes", "t", 1)
        assert "forge-mes" in dispatcher._channels

        spoke.explode = True
        with pytest.raises(WriteDispatchError) as info:
            await dispatcher.write("forge-mes", "t", 2)
        assert info.value.code == "transport" and "spoke down" in info.value.message
        assert "forge-mes" not in dispatcher._channels  # reconnects next time
        target = dispatcher.target_for("forge-mes")
        assert target is not None and target.writes == 2 and target.failed == 1

        spoke.explode = False
        assert (await dispatcher.write("forge-mes", "t", 3)).success
        await dispatcher.close()

    async def test_unknown_adapter_missing_callback_and_capability_gate(self) -> None:
        caps = {"forge-mes": True, "whk-wms": False}
        dispatcher = in_memory_dispatcher(FakeSpoke(), can_write=caps.get)

        with pytest.raises(WriteDispatchError) as info:
            await dispatcher.write("nope", "t", 1)
        assert info.value.code == "unknown_adapter"

        with pytest.raises(WriteDispatchError) as info:
            await dispatcher.write("forge-mes", "t", 1)
        assert info.value.code == "no_callback"

        dispatcher.register_callback("whk-wms", "s", {CALLBACK_PARAM: "mes-backend:50052"})
        with pytest.raises(WriteDispatchError) as info:
            await dispatcher.write("whk-wms", "t", 1)
        assert info.value.code == "not_writable"
        # Discover is a read; the capability gate does not apply
        assert await dispatcher.discover("whk-wms") == [
            {"tag_path": "mes.changeover.cooker.cip-complete", "data_type": "object"}
        ]

    async def test_forget_and_reconfigure(self) -> None:
        dispatcher = in_memory_dispatcher(FakeSpoke())
        dispatcher.register_callback("forge-mes", "sess-1", {CALLBACK_PARAM: "mes-backend:50052"})
        await dispatcher.write("forge-mes", "t", 1)
        dispatcher.forget("sess-1")
        assert dispatcher.target_for("forge-mes") is None
        with pytest.raises(WriteDispatchError) as info:
            await dispatcher.write("forge-mes", "t", 1)
        assert info.value.code == "no_callback"

        # a re-Configure without the param drops an earlier callback
        dispatcher.register_callback("forge-mes", "sess-2", {CALLBACK_PARAM: "mes-backend:50052"})
        assert dispatcher.register_callback("forge-mes", "sess-2", {}) is None
        assert dispatcher.target_for("forge-mes") is None

    async def test_callback_client_over_in_memory_channel(self) -> None:
        client = SpokeCallbackClient(InMemoryChannel(FakeSpoke()), "forge-mes", "s")
        res = await client.write("t", {"a": 1}, confirm=False)
        assert res == {"success": True, "message": "ok", "readback": None}
        assert (await client.discover())[0]["tag_path"].startswith("mes.changeover")


# ---------------------------------------------------------------------------
# HubIngestServicer feeds the dispatcher from Configure / Stop
# ---------------------------------------------------------------------------


class TestServicerWiring:
    async def test_configure_registers_and_stop_forgets(self) -> None:
        spoke = FakeSpoke()
        dispatcher = in_memory_dispatcher(spoke)
        servicer = HubIngestServicer(write_dispatcher=dispatcher)
        reg = await servicer.register(pydantic_to_proto(mes_manifest()))
        sid = reg["session_id"]
        await servicer.configure(
            "forge-mes",
            sid,
            {"graphql_url": "http://mes/graphql", CALLBACK_PARAM: "mes-backend:50052"},
        )
        target = dispatcher.target_for("forge-mes")
        assert target is not None and target.session_id == sid
        assert servicer.snapshot()["sessions"][0]["callback_url"] == "mes-backend:50052"

        await servicer.start("forge-mes", sid)
        outcome = await dispatcher.write(
            "forge-mes", "mes.changeover.cooker.request", {"requestedBy": "ot"}
        )
        assert outcome.success and spoke.writes[0]["session_id"] == sid

        await servicer.stop("forge-mes", sid)
        assert dispatcher.target_for("forge-mes") is None


# ---------------------------------------------------------------------------
# Live: hub dials a real spoke-hosted AdapterService over gRPC
# ---------------------------------------------------------------------------


class SpokeStub(service_grpc.AdapterServiceServicer):
    """What the MES backend serves: Write + Discover; nothing else."""

    def __init__(self) -> None:
        self.requests: list[service_msg.WriteRequest] = []
        self.expected_session = "expected"

    async def Write(self, request, context):  # noqa: N802
        self.requests.append(request)
        if request.session_id != self.expected_session:
            await context.abort(grpc.StatusCode.PERMISSION_DENIED, "unknown session")
        value = get_typed_value(request)
        if request.tag_path.endswith("explode"):
            await context.abort(grpc.StatusCode.INTERNAL, "boom")
        response = service_msg.WriteResponse(success=True, message=f"got {type(value).__name__}")
        if request.confirm:
            response.readback.CopyFrom(
                contextual_record_to_proto(state_record("cooker", "RECIPE_LOADING"))
            )
        return response

    async def Discover(self, request, context):  # noqa: N802
        from google.protobuf.struct_pb2 import Struct

        meta = Struct()
        meta.update({"area": "cooker", "command": "cip-complete"})
        return service_msg.DiscoverResponse(
            tags=[
                service_msg.TagDescriptor(
                    tag_path="mes.changeover.cooker.cip-complete",
                    data_type="object",
                    description="Report CIP completion",
                    metadata=meta,
                )
            ]
        )


@pytest.fixture()
async def spoke_server():
    stub = SpokeStub()
    server = grpc.aio.server()
    service_grpc.add_AdapterServiceServicer_to_server(stub, server)
    port = server.add_insecure_port("localhost:0")
    await server.start()
    yield stub, port
    await server.stop(grace=0.5)


class TestLiveWriteBack:
    async def test_typed_values_readback_and_discover(self, spoke_server) -> None:
        stub, port = spoke_server
        dispatcher = WriteDispatcher()
        dispatcher.register_callback("forge-mes", "expected", {CALLBACK_PARAM: f"localhost:{port}"})

        out = await dispatcher.write(
            "forge-mes", "mes.changeover.cooker.cip-complete", {"cipStartTime": "a"}, confirm=True
        )
        assert out.success and out.message == "got dict"
        assert out.readback is not None
        assert out.readback.source.tag_path == "mes.changeover.cooker.state"
        assert out.readback.value.raw == {"area": "cooker", "state": "RECIPE_LOADING"}
        assert stub.requests[-1].WhichOneof("typed_value") == "json_value"

        cases = ((1.5, "float"), (7, "int"), (True, "bool"), ("x", "str"), (b"\x01", "bytes"))
        for value, expect in cases:
            out = await dispatcher.write("forge-mes", "mes.t", value)
            assert out.success and out.message == f"got {expect}", (value, out.message)
            assert out.readback is None

        tags = await dispatcher.discover("forge-mes")
        assert tags == [
            {
                "tag_path": "mes.changeover.cooker.cip-complete",
                "data_type": "object",
                "description": "Report CIP completion",
                "engineering_units": "",
                "metadata": {"area": "cooker", "command": "cip-complete"},
            }
        ]
        await dispatcher.close()

    async def test_rpc_errors_surface_as_transport_failures(self, spoke_server) -> None:
        _stub, port = spoke_server
        dispatcher = WriteDispatcher()
        dispatcher.register_callback("forge-mes", "expected", {CALLBACK_PARAM: f"localhost:{port}"})
        with pytest.raises(WriteDispatchError) as info:
            await dispatcher.write("forge-mes", "mes.explode", 1)
        assert info.value.code == "transport" and "boom" in info.value.message

        dispatcher.register_callback(
            "forge-mes", "wrong-session", {CALLBACK_PARAM: f"localhost:{port}"}
        )
        with pytest.raises(WriteDispatchError) as info:
            await dispatcher.write("forge-mes", "mes.t", 1)
        assert "unknown session" in info.value.message
        await dispatcher.close()

    async def test_full_loop_spoke_registers_with_callback_then_hub_writes(
        self, spoke_server
    ) -> None:
        """Spoke → hub handshake carries the callback; hub → spoke write uses it."""
        stub, port = spoke_server
        dispatcher = WriteDispatcher()
        servicer = HubIngestServicer(write_dispatcher=dispatcher)
        hub = GrpcServer(servicer, port=0)
        await hub.start()
        channel = GrpcChannel(f"localhost:{hub.port}")
        await channel.connect()
        try:
            spoke = SpokeClient(channel=channel)
            sid = await spoke.register(mes_manifest())
            await spoke.configure(
                {"graphql_url": "http://mes/graphql", CALLBACK_PARAM: f"localhost:{port}"}
            )
            await spoke.start()
            # the hub-issued session id travels back to the spoke on every Write
            target = dispatcher.target_for("forge-mes")
            assert target is not None and target.session_id == sid
            stub.expected_session = sid
            out = await dispatcher.write(
                "forge-mes", "mes.changeover.cooker.request", {"requestedBy": "ot"}
            )
            assert out.success and stub.requests[-1].session_id == sid
            assert stub.requests[-1].adapter_id == "forge-mes"
            assert json.loads(stub.requests[-1].json_value) == {"requestedBy": "ot"}
            await spoke.stop()
            assert dispatcher.target_for("forge-mes") is None
        finally:
            await channel.close()
            await dispatcher.close()
            await hub.stop(grace=0.5)
