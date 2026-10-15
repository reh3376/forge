"""ControlRuntime: config → write engine, PLC CIP, recipes, orchestrator, broker, REST (FB-065)."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from fastapi import FastAPI

from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge.modules.ot.control import (
    ControlDependencies,
    ControlRuntime,
    RegistryTagIO,
    WriteRequest,
    WriteRole,
    WriteStatus,
    parse_control_config,
)
from forge.modules.ot.control.api import create_control_router
from forge.modules.ot.mqtt.ingress import ExternalBrokerIngress
from forge.modules.ot.opcua_client.types import ConnectionHealth as UaConnectionHealth
from forge.modules.ot.opcua_client.types import ConnectionState as UaConnectionState
from forge.modules.ot.opcua_client.types import DataType as UaDataType
from forge.modules.ot.opcua_client.types import DataValue as UaDataValue
from forge.modules.ot.opcua_client.types import QualityCode as UaQuality
from forge.modules.ot.tag_engine.models import ExpressionTag, MemoryTag, StandardTag
from forge.modules.ot.tag_engine.providers.acquisition import AcquisitionEngine
from forge.modules.ot.tag_engine.registry import TagRegistry
from forge.transport.spoke_callback import WriteDispatchError, WriteOutcome

SP = "WH/WHK01/Cooker01/TIT_2010/SP"
RR = "WH/WHK01/Cooker01/TIT_2010/RampRate"
CIP_START = "WH/WHK01/Cooker01/CIP/Start"
CIP_STATE = "WH/WHK01/Cooker01/CIP/State"
STATE_T = "whk/whk01/cooker/changeover/state"
RECIPE_T = "whk/whk01/cooker/recipe/next"
CIP_STATE_T = "whk/whk01/cooker/equipment/cipState"

# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------

ACCEPTED = {
    "request": ("PRODUCTION", "COOK_COMPLETE"),
    "cip-complete": ("AWAITING_CHANGEOVER", "CIP_IN_PROGRESS"),
    "recipe-loaded": ("RECIPE_LOADING", "CIP_COMPLETE"),
    "start-production": ("READY_TO_START",),
    "reset": ("ERROR",),
}
NEXT = {
    "request": "AWAITING_CHANGEOVER",
    "cip-complete": "RECIPE_LOADING",
    "recipe-loaded": "READY_TO_START",
    "start-production": "PRODUCTION",
}


class FakeMes:
    """The hub WriteDispatcher with the MES changeover service behind it."""

    def __init__(self) -> None:
        self.states = {"cooker": "PRODUCTION"}
        self.active, self.next = "so-1", "so-2"
        self.calls: list[tuple[str, str, dict[str, Any]]] = []
        self.down = False

    async def write(self, adapter_id, tag_path, value, *, confirm=False):
        if self.down:
            raise WriteDispatchError("transport", "hub unreachable")
        _, _, area, command = tag_path.split(".")
        self.calls.append((area, command, value))
        current = self.states[area]
        if current not in ACCEPTED[command]:
            return WriteOutcome(
                adapter_id=adapter_id,
                tag_path=tag_path,
                success=False,
                message=f"invalid_state: {area} is {current}",
            )
        new = value["targetState"] if command == "reset" else NEXT[command]
        if command == "start-production":
            self.active, self.next = self.next, "so-3"
        self.states[area] = new
        readback = None
        if confirm:
            readback = ContextualRecord(
                source=RecordSource(
                    adapter_id="forge-mes",
                    system="forge-mes",
                    tag_path=f"mes.changeover.{area}.state",
                ),
                timestamp=RecordTimestamp(source_time=datetime(2026, 6, 1, tzinfo=UTC)),
                value=RecordValue(
                    raw={
                        "state": new,
                        "area": area,
                        "activeSOId": self.active,
                        "nextSOId": self.next,
                        "enteredAt": f"2026-06-01T12:00:00.{len(self.calls):03d}Z",
                    },
                    quality=QualityCode.GOOD,
                    data_type="object",
                ),
                context=RecordContext(),
                lineage=RecordLineage(
                    schema_ref="forge://schemas/forge-mes/v0.1.0",
                    adapter_id="forge-mes",
                    adapter_version="0.1.0",
                ),
            )
        return WriteOutcome(
            adapter_id=adapter_id,
            tag_path=tag_path,
            success=True,
            message=f"{area}: {current} -> {new}",
            readback=readback,
        )


class FakePlc:
    """Dict-backed PLC: the CIP start bit flips the state tag to Running, then Complete."""

    def __init__(self) -> None:
        self.values: dict[str, Any] = {CIP_STATE: "Idle"}
        self.writes: list[tuple[str, Any]] = []
        self._polls_left = 0
        self._cip_active = False

    async def write_tag(self, tag_path: str, value: Any) -> None:
        self.writes.append((tag_path, value))
        self.values[tag_path] = value
        if tag_path == CIP_START and value:
            self.values[CIP_STATE] = "Running"
            self._polls_left = 2
            self._cip_active = True

    async def read_tag(self, tag_path: str) -> Any:
        if tag_path == CIP_STATE and self._cip_active and self.values[CIP_STATE] == "Running":
            if self._polls_left <= 0:
                self.values[CIP_STATE] = "Complete"
                self._cip_active = False
            else:
                self._polls_left -= 1
        return self.values.get(tag_path)


class FakeSink:
    def __init__(self) -> None:
        self.records: list[ContextualRecord] = []

    async def write_batch(self, records):
        self.records.extend(records)
        return len(records)


class Clock:
    def __init__(self) -> None:
        self.t = datetime(2026, 6, 1, 12, tzinfo=UTC)

    def now(self) -> datetime:
        self.t += timedelta(milliseconds=1)
        return self.t

    async def sleep(self, seconds: float) -> None:
        self.t += timedelta(seconds=seconds)


def state_payload(state: str, *, entered: str, active: str = "so-1", nxt: str = "so-2") -> dict:
    return {
        "state": state,
        "area": "cooker",
        "activeSOId": active,
        "nextSOId": nxt,
        "error": None,
        "enteredAt": entered,
        "updatedAt": entered,
    }


def recipe_payload(so: str = "so-2") -> dict[str, Any]:
    return {
        "id": "sori-9",
        "scheduleOrderId": so,
        "updatedAt": "2026-06-01T09:00:00.000Z",
        "recipe": {"id": "recipe-1", "Recipe": "Bourbon Mash", "revision": 3},
        "recipeParameters": [
            {
                "recipeNumericalSetpoint": 180,
                "masterRecipeParameter": {"recipeParamName": "target_temp"},
            },
            {
                "recipeNumericalSetpoint": 2.5,
                "masterRecipeParameter": {"recipeParamName": "ramp_rate"},
            },
        ],
    }


def document(*, mqtt: dict[str, Any] | None = None, areas: bool = True) -> dict[str, Any]:
    doc: dict[str, Any] = {
        "site": "whk01",
        "mqtt": mqtt or {"mode": "local", "host": "127.0.0.1", "port": 0},
        "write_tags": [
            {"tag_path": SP, "data_type": "FLOAT", "min_value": 0, "max_value": 212},
            {"tag_path": RR, "data_type": "FLOAT", "min_value": 0, "max_value": 10},
            {"tag_path": CIP_START, "data_type": "BOOLEAN"},
        ],
        "interlocks": [
            {
                "rule_id": "IL-1",
                "name": "No setpoint change while CIP runs",
                "target_tag_pattern": "WH/WHK01/Cooker01/TIT_2010/*",
                "check_tag": CIP_STATE,
                "condition": "EQUALS",
                "check_value": "Running",
            }
        ],
        "permissions": [{"area_pattern": "*", "tag_pattern": "*", "min_role": "ENGINEER"}],
        "recipes": [
            {
                "equipment_id": "Cooker01",
                "area": "cooker",
                "mappings": [
                    {"parameter_name": "target_temp", "tag_path": SP},
                    {"parameter_name": "ramp_rate", "tag_path": RR},
                ],
            }
        ],
    }
    if areas:
        doc["changeover_areas"] = [
            {
                "area": "cooker",
                "equipment_id": "Cooker01",
                "cooker_number": "1",
                "cip_policy": "runner",
                "cip": {
                    "start_tag": CIP_START,
                    "state_tag": CIP_STATE,
                    "poll_interval_seconds": 10,
                    "start_timeout_seconds": 60,
                    "timeout_seconds": 600,
                },
            }
        ]
    return doc


def runtime(doc: dict[str, Any], **deps: Any) -> tuple[ControlRuntime, FakeMes, FakePlc, FakeSink]:
    mes = deps.pop("mes", None) or FakeMes()
    plc = FakePlc()
    sink = FakeSink()
    clock = Clock()
    rt = ControlRuntime(
        parse_control_config(doc),
        ControlDependencies(
            write_dispatcher=mes,
            tag_io=plc,
            record_sink=sink,
            now=clock.now,
            sleep=clock.sleep,
            **deps,
        ),
    )
    return rt, mes, plc, sink


# ---------------------------------------------------------------------------
# The sequence, end to end
# ---------------------------------------------------------------------------


async def test_full_changeover_over_the_embedded_broker() -> None:
    rt, mes, plc, sink = runtime(document())
    assert rt.orchestrator is not None and rt.cip_runner is not None and not rt.started
    await rt.start()
    try:
        broker = rt.broker
        assert broker is not None and broker.is_started and rt.ingress is not None
        audit_topics: list[str] = []
        broker.subscribe_local(
            "test-audit",
            "whk/whk01/+/ot/control/audit/#",
            lambda t, p, q, r: audit_topics.append(t),
        )

        # 1. MES asks for a changeover: the PLC CIP sequence runs, cip-complete goes back.
        mes.states["cooker"] = "AWAITING_CHANGEOVER"
        await broker.publish(
            STATE_T, state_payload("AWAITING_CHANGEOVER", entered="t1"), qos=1, retain=True
        )
        assert plc.writes == [(CIP_START, True)]
        assert [c[1] for c in mes.calls] == ["cip-complete"]
        assert mes.states["cooker"] == "RECIPE_LOADING"
        area = rt.orchestrator.area("cooker")
        assert area.mes_state == "RECIPE_LOADING"  # from the write's read-back
        cip_state = json.loads(broker.topic_engine.get_retained(CIP_STATE_T).payload)
        assert cip_state["state"] == "Complete" and cip_state["duration"] == 30
        assert mes.calls[0][2]["cipDurationSeconds"] == pytest.approx(30, abs=0.1)
        assert audit_topics and audit_topics[0].startswith("whk/whk01/cooker/ot/control/audit/")

        # 2. MES echoes the state and publishes the recipe: setpoints are written through
        #    validation + interlocks + authorisation, read back, then recipe-loaded goes back.
        await broker.publish(
            STATE_T, state_payload("RECIPE_LOADING", entered="t2"), qos=1, retain=True
        )
        await broker.publish(RECIPE_T, recipe_payload(), qos=1, retain=True)
        assert plc.values[SP] == 180 and plc.values[RR] == 2.5
        assert [c[1] for c in mes.calls] == ["cip-complete", "recipe-loaded"]
        assert mes.calls[1][2]["scheduleOrderRecipeInstanceId"] == "sori-9"
        assert mes.calls[1][2]["cookerNumber"] == "1"
        assert mes.states["cooker"] == "READY_TO_START"
        assert area.loaded_recipe_key == ("sori-9", "2026-06-01T09:00:00.000Z")

        # 3. The operator confirms the start over REST.
        app = FastAPI()
        app.include_router(create_control_router(rt))
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://ot") as client:
            await broker.publish(
                STATE_T, state_payload("READY_TO_START", entered="t3"), qos=1, retain=True
            )
            r = await client.get("/api/v1/ot/changeover/cooker")
            assert r.status_code == 200 and r.json()["awaiting_start_confirmation"] is True

            r = await client.post(
                "/api/v1/ot/changeover/cooker/confirm-start", json={"operator_id": "op-7"}
            )
            assert r.status_code == 200, r.text
            assert (
                r.json()["success"] is True
                and r.json()["tag_path"] == "mes.changeover.cooker.start-production"
            )
            assert mes.states["cooker"] == "PRODUCTION"
            assert mes.calls[-1][2] == {"startedBy": "op-7"}

            r = await client.post(
                "/api/v1/ot/changeover/cooker/confirm-start", json={"operator_id": "op-7"}
            )
            assert r.status_code == 409 and "not READY_TO_START" in r.json()["detail"]
            r = await client.post(
                "/api/v1/ot/changeover/cooker/confirm-start", json={"operator_id": ""}
            )
            assert r.status_code == 422
            r = await client.get("/api/v1/ot/changeover/stillhouse")
            assert r.status_code == 404
            r = await client.post("/api/v1/ot/changeover/cooker/retry-recipe")
            assert r.status_code == 409 and "no pending recipe" in r.json()["detail"]
            r = await client.post("/api/v1/ot/changeover/cooker/resume")
            assert r.status_code == 200 and r.json()["mes_state"] == "PRODUCTION"

            r = await client.get("/api/v1/ot/changeover")
            assert r.json()["areas"]["cooker"]["mes_state"] == "PRODUCTION"
            r = await client.get("/api/v1/ot/changeover/cooker/events")
            kinds = [e["kind"] for e in r.json()]
            for expected in (
                "cip_started",
                "cip_finished",
                "recipe_written",
                "awaiting_start_confirmation",
            ):
                assert expected in kinds

            r = await client.get("/api/v1/ot/control/writes")
            rows = r.json()
            assert {row["tag_path"] for row in rows} == {CIP_START, SP, RR}
            assert all(row["status"] == "CONFIRMED" for row in rows)
            assert all(row["requestor"] == "forge-ot-module" for row in rows)
            r = await client.get("/api/v1/ot/control/writes", params={"tag_path": SP, "limit": 5})
            assert [row["requested_value"] for row in r.json()] == [180]
            r = await client.get("/api/v1/ot/control/tags")
            assert [t["tag_path"] for t in r.json()] == sorted([SP, RR, CIP_START])
            assert r.json()[0]["data_type"] in {"FLOAT", "BOOLEAN"}

            r = await client.get("/api/v1/ot/control/status")
            body = r.json()
            assert body["started"] is True and body["mqtt"]["mode"] == "local"
            assert body["mqtt"]["connected"] is True and body["broker"] is not None
            assert body["engine"]["confirmed"] == 3 and body["engine"]["interlock_rules"] == 1
            assert (
                body["cip"]["cooker"]["state"] == "Complete" and body["cip"]["cooker"]["runs"] == 1
            )
            assert body["changeover"]["areas"]["cooker"]["mes_state"] == "PRODUCTION"
            assert body["config"]["recipes"] == {"Cooker01": 2}

        # One audit ContextualRecord per MES write attempt reached the sink ...
        changeover = [r for r in sink.records if r.source.tag_path.startswith("ot.changeover.")]
        assert [r.source.tag_path for r in changeover] == [
            "ot.changeover.cooker.cip-complete",
            "ot.changeover.cooker.recipe-loaded",
            "ot.changeover.cooker.start-production",
        ]
        # ... and one per control write (FB-066), in the order they happened.
        writes = [r for r in sink.records if r.source.tag_path.startswith("ot.control.write.")]
        assert [r.context.extra["target_tag_path"] for r in writes] == [CIP_START, SP, RR]
        assert all(r.context.extra["write_status"] == "CONFIRMED" for r in writes)
        assert writes[0].context.area == "cooker" and writes[0].context.site == "whk01"
        assert rt.status()["audit_records"] == 3
    finally:
        await rt.stop()
    assert not rt.started and rt.broker is None and rt.ingress is None
    await rt.stop()  # idempotent


async def test_interlock_blocks_recipe_download_and_reports_partial() -> None:
    rt, mes, plc, _sink = runtime(document(mqtt={"mode": "none"}))
    await rt.start()
    assert rt.ingress is None  # mode none: messages are fed programmatically
    plc.values[CIP_STATE] = "Running"  # interlock IL-1 condition
    mes.states["cooker"] = "RECIPE_LOADING"
    orch = rt.orchestrator
    assert orch is not None
    await orch.on_state("cooker", state_payload("RECIPE_LOADING", entered="t1"))
    await orch.on_recipe("cooker", recipe_payload())

    assert SP not in plc.values and mes.calls == []  # nothing written, nothing reported
    area = orch.area("cooker")
    assert area.pending_recipe is not None and area.loaded_recipe_key is None
    assert area.events[-1].kind == "recipe_partial"
    journal = rt.engine.get_journal()
    assert {row["status"] for row in journal} == {"REJECTED_INTERLOCK"}
    assert all("IL-1" in row["interlock_error"] for row in journal)

    plc.values[CIP_STATE] = "Complete"
    assert await orch.retry_recipe("cooker") is True
    assert plc.values[SP] == 180 and [c[1] for c in mes.calls] == ["recipe-loaded"]
    await rt.stop()


async def test_runtime_without_areas_is_engine_only() -> None:
    rt, _mes, _plc, _sink = runtime(document(mqtt={"mode": "none"}, areas=False))
    assert rt.orchestrator is None and rt.cip_runner is None
    await rt.start()
    assert rt.ingress is None and rt.status()["changeover"] is None and rt.status()["cip"] == {}

    app = FastAPI()
    app.include_router(create_control_router(rt))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://ot"
    ) as client:
        assert (await client.get("/api/v1/ot/changeover")).status_code == 503
        assert (await client.get("/api/v1/ot/changeover/cooker")).status_code == 503
        assert (await client.get("/api/v1/ot/control/tags")).status_code == 200
    await rt.stop()


async def test_router_before_runtime_exists_is_503() -> None:
    app = FastAPI()
    app.include_router(create_control_router(lambda: None))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://ot"
    ) as client:
        r = await client.get("/api/v1/ot/control/status")
        assert r.status_code == 503 and "not configured" in r.json()["detail"]


class FakeIngress:
    def __init__(self) -> None:
        self.started = False

    async def start(self) -> None:
        self.started = True

    async def stop(self) -> None:
        self.started = False

    def status(self) -> dict[str, Any]:
        return {"mode": "fake", "connected": self.started}


async def test_ingress_modes_and_hooks() -> None:
    seen: list[tuple[str, Any]] = []
    fake = FakeIngress()

    def factory(settings, subscriber, broker):
        seen.append((settings.mode, broker))
        return fake

    rt, _mes, _plc, _sink = runtime(document(mqtt={"mode": "none"}), ingress_factory=factory)
    await rt.start()
    assert fake.started and seen == [("none", None)] and rt.status()["mqtt"]["mode"] == "fake"
    await rt.stop()
    assert not fake.started

    external, _mes, _plc, _sink = runtime(
        document(
            mqtt={"mode": "external", "host": "broker.local", "port": 8883, "client_id": "ot-x"}
        )
    )
    ingress = external._build_ingress()
    assert isinstance(ingress, ExternalBrokerIngress)
    assert (
        ingress.status()["broker"] == "broker.local:8883"
        and ingress.status()["client_id"] == "ot-x"
    )


def test_runtime_needs_tag_io_or_registry() -> None:
    with pytest.raises(ValueError, match="tag_io"):
        ControlRuntime(parse_control_config({}), ControlDependencies(write_dispatcher=FakeMes()))


# ---------------------------------------------------------------------------
# RegistryTagIO
# ---------------------------------------------------------------------------


class FakeProvider:
    def __init__(self) -> None:
        self.plc: dict[str, Any] = {}
        self.reads: list[str] = []

    async def read_current(self, tag_path: str):
        self.reads.append(tag_path)
        if tag_path not in self.plc:
            return None
        return type("DataValue", (), {"value": self.plc[tag_path]})()

    async def write_to_plc(self, tag_path: str, value: Any) -> bool:
        self.plc[tag_path] = value
        return True


async def test_registry_tag_io_routes_memory_and_standard_tags() -> None:
    registry = TagRegistry()
    await registry.register(MemoryTag(path="WH/WHK01/Mem/Flag", data_type=UaDataType.BOOLEAN))
    await registry.register(
        StandardTag(
            path=SP, data_type=UaDataType.FLOAT, opcua_node_id="ns=2;s=SP", connection_name="WHK01"
        )
    )
    await registry.register(
        ExpressionTag(path="WH/WHK01/Calc", data_type=UaDataType.FLOAT, expression="1 + 1")
    )
    provider = FakeProvider()
    io = RegistryTagIO(registry, providers={"WHK01": provider})

    await io.write_tag("WH/WHK01/Mem/Flag", True)
    assert await io.read_tag("WH/WHK01/Mem/Flag") is True
    await io.write_tag(SP, 150.0)
    assert provider.plc[SP] == 150.0
    assert await io.read_tag(SP) == 150.0 and provider.reads == [SP]
    provider.plc.clear()
    assert await io.read_tag(SP) is None  # PLC has nothing; registry value untouched

    with pytest.raises(LookupError):
        await io.read_tag("WH/nope")
    with pytest.raises(TypeError, match="not writable"):
        await io.write_tag("WH/WHK01/Calc", 3)
    no_provider = RegistryTagIO(registry)
    with pytest.raises(RuntimeError, match="no OPC-UA provider"):
        await no_provider.write_tag(SP, 1.0)
    cached = RegistryTagIO(registry, live_reads=False)
    assert await cached.read_tag(SP) is None

    class Acquisition:
        def get_provider(self, name):
            return provider if name == "WHK01" else None

    via_engine = RegistryTagIO(registry, acquisition=Acquisition())
    await via_engine.write_tag(SP, 7.0)
    assert provider.plc[SP] == 7.0


# ---------------------------------------------------------------------------
# PLC connections (FB-069)
# ---------------------------------------------------------------------------


class FakeUaClient:
    """Enough of OpcUaClient for OpcUaProvider: connect/subscribe/read/write/health."""

    def __init__(self, spec) -> None:
        self.spec = spec
        self.state = UaConnectionState.DISCONNECTED
        self.values: dict[str, Any] = {}
        self.connects = 0

    async def connect(self) -> None:
        self.connects += 1
        self.state = UaConnectionState.CONNECTED

    async def disconnect(self) -> None:
        self.state = UaConnectionState.DISCONNECTED

    async def subscribe(self, node_ids, callback, *, interval_ms=500.0, queue_size=10) -> int:
        return 1

    async def unsubscribe(self, sid: int) -> None:
        pass

    async def read(self, node_ids, *, max_age_ms=0):
        return [UaDataValue(value=self.values.get(n), quality=UaQuality.GOOD) for n in node_ids]

    async def write(self, node_id, value, *, data_type=None) -> None:
        self.values[node_id] = value

    def health(self) -> UaConnectionHealth:
        return UaConnectionHealth(
            endpoint_url=self.spec.endpoint, connection_name=self.spec.name, state=self.state
        )


SP_NODE = "ns=2;s=Cooker01.TIT_2010.SP"


async def test_connections_are_composed_started_and_served_over_rest() -> None:
    registry = TagRegistry()
    await registry.register(
        StandardTag(
            path=SP, data_type=UaDataType.FLOAT, opcua_node_id=SP_NODE, connection_name="WHK01"
        )
    )
    await registry.register(  # interlock IL-1 reads this one from the PLC
        StandardTag(
            path=CIP_STATE,
            data_type=UaDataType.STRING,
            opcua_node_id="ns=2;s=Cooker01.CIP.State",
            connection_name="WHK01",
        )
    )
    clients: dict[str, FakeUaClient] = {}

    def factory(spec):
        clients[spec.name] = FakeUaClient(spec)
        return clients[spec.name]

    doc = document(mqtt={"mode": "none"}, areas=False)
    doc["connections"] = [{"name": "WHK01", "endpoint": "opc.tcp://10.0.0.1:4840"}]
    doc["connection_poll_seconds"] = 0
    shared = AcquisitionEngine()
    rt = ControlRuntime(
        parse_control_config(doc),
        ControlDependencies(
            write_dispatcher=FakeMes(), acquisition=shared, plc_client_factory=factory
        ),
        registry=registry,
    )
    assert rt.connections is not None and rt.connections.engine is shared
    assert isinstance(rt.tag_io, RegistryTagIO)

    await rt.start()
    client = clients["WHK01"]
    assert client.connects == 1 and rt.status()["connections"]["connected"] == 1

    # A control write reaches the PLC through the provider and reads back CONFIRMED.
    result = await rt.engine.execute(
        WriteRequest(tag_path=SP, value=150.0, requestor="test", role=WriteRole.ENGINEER)
    )
    assert result.status is WriteStatus.CONFIRMED and client.values[SP_NODE] == 150.0

    app = FastAPI()
    app.include_router(create_control_router(rt))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://ot") as c:
        r = await c.get("/api/v1/ot/control/connections")
        assert r.status_code == 200 and r.json()["connections"]["WHK01"]["connected"] is True
        r = await c.post("/api/v1/ot/control/connections/WHK01/restart")
        assert r.status_code == 200 and r.json()["restarts"] == 1 and client.connects == 2
        assert (await c.post("/api/v1/ot/control/connections/nope/restart")).status_code == 404
        assert (await c.get("/api/v1/ot/control/status")).json()["connections"]["total"] == 1

    await rt.stop()
    assert client.state is UaConnectionState.DISCONNECTED and not rt.connections.started


async def test_connections_need_a_registry_and_absent_connections_report_empty() -> None:
    doc = document(mqtt={"mode": "none"}, areas=False)
    doc["connections"] = [{"name": "WHK01", "endpoint": "opc.tcp://10.0.0.1:4840"}]
    with pytest.raises(ValueError, match="TagRegistry"):
        ControlRuntime(
            parse_control_config(doc),
            ControlDependencies(write_dispatcher=FakeMes(), tag_io=FakePlc()),
        )

    rt, _mes, _plc, _sink = runtime(document(mqtt={"mode": "none"}, areas=False))
    assert rt.connections is None and rt.status()["connections"] is None
    app = FastAPI()
    app.include_router(create_control_router(rt))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://ot") as c:
        assert (await c.get("/api/v1/ot/control/connections")).json()["total"] == 0
        assert (await c.post("/api/v1/ot/control/connections/WHK01/restart")).status_code == 404


async def test_external_mode_builds_a_publisher_for_cip_state_and_audit() -> None:
    """External broker: the runtime owns a publisher for cipState and audit (FB-067)."""
    published: list[dict[str, Any]] = []

    class FakeExternal:
        def __init__(self, config) -> None:
            self.config = config
            self.connected = False

        async def connect(self) -> None:
            self.connected = True

        async def disconnect(self) -> None:
            self.connected = False

        async def publish(self, topic, payload, qos=0, retain=False) -> None:
            published.append({"topic": topic, "payload": payload, "qos": qos, "retain": retain})

    rt, _mes, _plc, _sink = runtime(
        document(
            mqtt={"mode": "external", "host": "broker.local", "port": 8883, "client_id": "ot-x"}
        ),
        ingress_factory=lambda settings, subscriber, broker: FakeIngress(),
        mqtt_client_factory=FakeExternal,
    )
    assert rt.publisher is not None and rt.publisher.config.client_id == "ot-x-pub"
    assert rt.publisher.config.broker_mode == "external"
    await rt.start()
    assert rt.status()["publisher"]["connected"] is True
    assert rt.broker is None  # no embedded broker in external mode

    assert await rt.publish(
        "whk/whk01/cooker/equipment/cipState", {"state": "Running"}, retain=True
    )
    assert published[-1]["topic"].endswith("equipment/cipState") and published[-1]["retain"] is True
    # A control write's audit record is published through the same client.
    await rt.engine.execute(
        WriteRequest(
            tag_path=SP, value=150.0, requestor="test", role=WriteRole.ENGINEER, area="cooker"
        )
    )
    assert any(p["topic"].startswith("whk/whk01/cooker/ot/control/audit/") for p in published)
    await rt.stop()
    assert rt.status()["publisher"]["connected"] is False
