"""ChangeoverOrchestrator: MES changeover topics → OT actions → MES write-back (FB-062)."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

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
    AreaChangeoverConfig,
    ChangeoverOrchestrator,
    ChangeoverSequenceError,
    CipPolicy,
    CipResult,
    MesChangeoverClient,
    RecipeWriteResult,
    parse_recipe_payload,
)
from forge.modules.ot.control.changeover_orchestrator import OT_ADAPTER_ID
from forge.modules.ot.mqtt.subscriber import IncomingMessage, MqttSubscriber
from forge.transport.spoke_callback import WriteDispatchError, WriteOutcome

# ---------------------------------------------------------------------------
# Fakes: the hub dispatcher + MES state machine, the PLC recipe writer, a sink
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
    """Plays the hub WriteDispatcher and the MES changeover service behind it."""

    def __init__(self, state: str = "PRODUCTION") -> None:
        self.states: dict[str, str] = {"cooker": state, "fermentation": state, "barreling": state}
        self.active = "so-1"
        self.next = "so-2"
        self.calls: list[tuple[str, str, dict[str, Any]]] = []
        self.down = False
        self.refuse = False

    async def write(self, adapter_id, tag_path, value, *, confirm=False):
        if self.down:
            raise WriteDispatchError("transport", "hub unreachable")
        _, _, area, command = tag_path.split(".")
        self.calls.append((area, command, value))
        current = self.states[area]
        if self.refuse or current not in ACCEPTED[command]:
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


class FakeRecipeWriter:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.fail_params: set[str] = set()
        self.explode = False

    async def execute_recipe_write(
        self,
        equipment_id,
        parameters,
        production_order_id="",
        recipe_id="",
        requestor=None,
        role=None,
        reason="",
    ):
        if self.explode:
            raise RuntimeError("OPC-UA session lost")
        self.calls.append(
            {
                "equipment_id": equipment_id,
                "parameters": parameters,
                "production_order_id": production_order_id,
                "recipe_id": recipe_id,
                "requestor": requestor,
                "reason": reason,
            }
        )
        result = RecipeWriteResult(
            batch_id="batch-1",
            equipment_id=equipment_id,
            production_order_id=production_order_id,
            recipe_id=recipe_id,
            total_parameters=len(parameters),
        )
        for name, value in parameters.items():
            if name in self.fail_params:
                result.failed += 1
                result.results.append(
                    {"parameter": name, "value": value, "status": "REJECTED", "error": "interlock"}
                )
            else:
                result.confirmed += 1
                result.results.append(
                    {"parameter": name, "value": value, "status": "CONFIRMED", "error": ""}
                )
        result.completed_at = datetime.now(UTC)
        return result


class FakeSink:
    def __init__(self) -> None:
        self.records: list[ContextualRecord] = []

    async def write_batch(self, records):
        self.records.extend(records)
        return len(records)


class FakeCip:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []
        self.fail = False

    async def run(self, area, config):
        self.calls.append((area, config.equipment_id))
        start = datetime(2026, 6, 1, 8, tzinfo=UTC)
        return CipResult(
            started_at=start,
            ended_at=start + timedelta(minutes=45),
            success=not self.fail,
            detail="drain valve" if self.fail else "",
        )


STATE_T = "whk/whk01/cooker/changeover/state"
RECIPE_T = "whk/whk01/cooker/recipe/next"


def state_payload(
    state: str, *, entered: str = "2026-06-01T10:00:00.000Z", active="so-1", nxt="so-2"
) -> dict[str, Any]:
    return {
        "state": state,
        "area": "cooker",
        "activeSOId": active,
        "nextSOId": nxt,
        "error": None,
        "enteredAt": entered,
        "updatedAt": entered,
    }


def prisma_recipe(so: str = "so-2", updated: str = "2026-06-01T09:00:00.000Z") -> dict[str, Any]:
    """Shape the MES publishes on recipe/next (getWithAllComponents row)."""
    return {
        "id": "sori-9",
        "scheduleOrderId": so,
        "updatedAt": updated,
        "scheduleOrder": {"id": so, "status": "Queued", "name": "SO-002"},
        "recipe": {"id": "recipe-1", "Recipe": "Bourbon Mash", "revision": 3},
        "recipeBoms": [],
        "mashingProtocols": [],
        "recipeParameters": [
            {
                "id": "p1",
                "recipeNumericalSetpoint": 180,
                "units": {"name": "degF"},
                "masterRecipeParameter": {"id": "m1", "recipeParamName": "target_temp"},
            },
            {
                "id": "p2",
                "recipeNumericalSetpoint": 2.5,
                "units": {"name": "degF/min"},
                "masterRecipeParameter": {"id": "m2", "recipeParamName": "ramp_rate"},
            },
            {
                "id": "p3",
                "recipeSetpointBooleanValue": True,
                "masterRecipeParameter": {"id": "m3", "recipeParamName": "agitator"},
            },
            {"id": "p4", "masterRecipeParameter": {"id": "m4", "recipeParamName": "unset"}},
        ],
    }


def make(mes: FakeMes | None = None, writer: FakeRecipeWriter | None = None, **kw):
    mes = mes or FakeMes()
    writer = writer or FakeRecipeWriter()
    sink = FakeSink()
    areas = kw.pop("areas", None) or [
        AreaChangeoverConfig(
            area="cooker",
            equipment_id="Distillery01/COOKER_01",
            cooker_number="1",
            cip_policy=CipPolicy.SKIP,
        )
    ]
    clock = {"t": datetime(2026, 6, 1, 12, tzinfo=UTC)}

    def now():
        clock["t"] += timedelta(seconds=1)
        return clock["t"]

    orch = ChangeoverOrchestrator(
        MesChangeoverClient(mes), writer, areas=areas, record_sink=sink, now=now, **kw
    )
    return orch, mes, writer, sink


def kinds(orch, area="cooker") -> list[str]:
    return [e.kind for e in orch.events(area)]


# ---------------------------------------------------------------------------
# Payload parsing + config
# ---------------------------------------------------------------------------


def test_parse_recipe_payload_accepts_both_shapes_and_coerces_numbers() -> None:
    snap = parse_recipe_payload(prisma_recipe())
    assert snap.instance_id == "sori-9" and snap.schedule_order_id == "so-2"
    assert snap.updated_at == "2026-06-01T09:00:00.000Z"
    assert snap.recipe_id == "recipe-1" and snap.recipe_name == "Bourbon Mash"
    assert snap.parameters == {"target_temp": 180, "ramp_rate": 2.5, "agitator": True}
    assert snap.key == ("sori-9", "2026-06-01T09:00:00.000Z")

    rest = {
        "scheduleOrderId": "so-2",
        "recipeInstanceId": "sori-9",
        "updatedAt": "2026-06-01T09:00:00.000Z",
        "recipe": {"id": "recipe-1", "name": "Bourbon Mash", "revision": "v3"},
        "recipeParameters": [
            {"id": "p1", "name": "Cooker Temperature", "value": "180", "units": "degF"},
            {"id": "p2", "name": "Ramp", "value": "2.50", "units": "degF/min"},
            {"id": "p3", "name": "Mode", "value": "auto"},
        ],
    }
    snap = parse_recipe_payload(rest)
    assert snap.parameters == {"Cooker Temperature": 180, "Ramp": 2.5, "Mode": "auto"}
    assert isinstance(snap.parameters["Cooker Temperature"], int)

    with pytest.raises(ValueError, match="recipeInstanceId"):
        parse_recipe_payload({"recipeParameters": []})
    with pytest.raises(ValueError, match="JSON object"):
        parse_recipe_payload(["nope"])  # type: ignore[arg-type]


def test_config_validation() -> None:
    with pytest.raises(ValueError, match="unknown changeover area"):
        AreaChangeoverConfig(area="stillhouse", equipment_id="x", cooker_number="1")
    cfg = AreaChangeoverConfig(
        area="cooker", equipment_id="x", cooker_number="1", cip_policy="runner"
    )  # type: ignore[arg-type]
    assert cfg.cip_policy is CipPolicy.RUNNER
    with pytest.raises(ValueError, match="cip_runner"):
        ChangeoverOrchestrator(MesChangeoverClient(FakeMes()), FakeRecipeWriter(), areas=[cfg])
    with pytest.raises(ValueError, match="at least one"):
        ChangeoverOrchestrator(MesChangeoverClient(FakeMes()), FakeRecipeWriter(), areas=[])


# ---------------------------------------------------------------------------
# The sequence
# ---------------------------------------------------------------------------


async def test_full_sequence_with_cip_skipped_and_operator_confirmation() -> None:
    orch, mes, writer, sink = make()

    # MES: PRODUCTION -> AWAITING_CHANGEOVER (live transition)
    mes.states["cooker"] = "AWAITING_CHANGEOVER"
    await orch.on_state("cooker", state_payload("AWAITING_CHANGEOVER"))
    assert mes.calls[0][1] == "cip-complete"
    cip = mes.calls[0][2]
    assert cip["cipDurationSeconds"] == 0 and cip["reportedBy"] == "forge-ot-module"
    assert cip["cipStartTime"] == cip["cipEndTime"]
    # the read-back moved the local view without waiting for the MQTT echo
    assert orch.area("cooker").mes_state == "RECIPE_LOADING"
    assert mes.states["cooker"] == "RECIPE_LOADING"

    # MES publishes recipe/next during cip-complete
    await orch.on_recipe("cooker", prisma_recipe())
    assert writer.calls == [
        {
            "equipment_id": "Distillery01/COOKER_01",
            "parameters": {"target_temp": 180, "ramp_rate": 2.5, "agitator": True},
            "production_order_id": "so-2",
            "recipe_id": "recipe-1",
            "requestor": "forge-ot-module",
            "reason": "Changeover recipe download Bourbon Mash",
        }
    ]
    assert mes.calls[1][1] == "recipe-loaded"
    assert mes.calls[1][2] == {
        "scheduleOrderRecipeInstanceId": "sori-9",
        "sourceUpdatedAt": "2026-06-01T09:00:00.000Z",
        "cookerNumber": "1",
        "loadedBy": "forge-ot-module",
    }
    rt = orch.area("cooker")
    assert rt.mes_state == "READY_TO_START"
    assert rt.awaiting_start_confirmation is True
    assert rt.loaded_recipe_key == ("sori-9", "2026-06-01T09:00:00.000Z")
    assert rt.pending_recipe is None

    # the retained state echo for READY_TO_START must not start production by itself
    await orch.on_state(
        "cooker", state_payload("READY_TO_START", entered="2026-06-01T10:05:00.000Z")
    )
    assert [c[1] for c in mes.calls] == ["cip-complete", "recipe-loaded"]

    outcome = await orch.confirm_start("cooker", "operator-7")
    assert outcome.success
    assert mes.calls[2] == ("cooker", "start-production", {"startedBy": "operator-7"})
    assert rt.mes_state == "PRODUCTION" and rt.awaiting_start_confirmation is False
    assert rt.active_so_id == "so-2" and rt.next_so_id == "so-3"

    assert kinds(orch) == [
        "state",
        "cip_skipped",
        "write",
        "recipe",
        "recipe_written",
        "write",
        "awaiting_start_confirmation",
        "state",
        "awaiting_start_confirmation",
        "write",
    ]
    # audit: one ContextualRecord per MES write
    assert [r.source.tag_path for r in sink.records] == [
        "ot.changeover.cooker.cip-complete",
        "ot.changeover.cooker.recipe-loaded",
        "ot.changeover.cooker.start-production",
    ]
    rec = sink.records[1]
    assert rec.value.quality is QualityCode.GOOD
    assert (
        rec.value.raw["success"] is True and rec.value.raw["readback"]["state"] == "READY_TO_START"
    )
    assert rec.value.raw["recipe_result"]["confirmed"] == 3
    assert rec.context.extra["event_type"] == "changeover.recipe-loaded"
    assert rec.context.extra["changeover_area"] == "cooker"
    assert rec.context.equipment_id == "Distillery01/COOKER_01"
    assert rec.lineage.adapter_id == "forge-ot-module"
    assert rec.lineage.transformation_chain == ["ot:changeover-orchestrator"]

    snap = orch.snapshot()
    assert snap["areas"]["cooker"]["writes"] == 3 and snap["areas"]["cooker"]["writes_failed"] == 0
    assert snap["areas"]["cooker"]["mes_state"] == "PRODUCTION"
    assert snap["topic_filters"] == ["whk/+/+/changeover/state", "whk/+/+/recipe/next"]


async def test_cip_runner_policy_reports_the_runner_times() -> None:
    cip = FakeCip()
    areas = [
        AreaChangeoverConfig(
            area="cooker", equipment_id="E", cooker_number="2", cip_policy=CipPolicy.RUNNER
        )
    ]
    orch, mes, _, _ = make(areas=areas, cip_runner=cip)
    mes.states["cooker"] = "AWAITING_CHANGEOVER"
    await orch.on_state("cooker", state_payload("AWAITING_CHANGEOVER"))
    assert cip.calls == [("cooker", "E")]
    assert mes.calls[0][2] == {
        "cipStartTime": "2026-06-01T08:00:00+00:00",
        "cipEndTime": "2026-06-01T08:45:00+00:00",
        "cipDurationSeconds": 2700.0,
        "reportedBy": "forge-ot-module",
    }
    assert kinds(orch) == ["state", "cip_started", "cip_finished", "write"]
    assert orch.area("cooker").cip_in_progress is False

    # a failing CIP never reports completion
    cip.fail = True
    mes.states["cooker"] = "AWAITING_CHANGEOVER"
    await orch.on_state(
        "cooker", state_payload("AWAITING_CHANGEOVER", entered="2026-06-01T11:00:00.000Z")
    )
    assert len(mes.calls) == 1
    assert kinds(orch)[-1] == "cip_failed"
    assert "drain valve" in orch.area("cooker").last_error


async def test_external_cip_policy_waits_and_recipe_can_arrive_early() -> None:
    areas = [
        AreaChangeoverConfig(
            area="cooker", equipment_id="E", cooker_number="1", cip_policy=CipPolicy.EXTERNAL
        )
    ]
    orch, mes, writer, _ = make(areas=areas)
    mes.states["cooker"] = "AWAITING_CHANGEOVER"
    await orch.on_state("cooker", state_payload("AWAITING_CHANGEOVER"))
    assert mes.calls == [] and kinds(orch) == ["state", "cip_external"]

    # Ignition reports CIP; the MES publishes the recipe before the state echo
    mes.states["cooker"] = "RECIPE_LOADING"
    await orch.on_recipe("cooker", prisma_recipe())
    assert writer.calls == [] and orch.area("cooker").pending_recipe is not None
    assert kinds(orch)[-1] == "recipe"

    await orch.on_state(
        "cooker", state_payload("RECIPE_LOADING", entered="2026-06-01T10:30:00.000Z")
    )
    assert len(writer.calls) == 1
    assert [c[1] for c in mes.calls] == ["recipe-loaded"]
    assert orch.area("cooker").mes_state == "READY_TO_START"


async def test_retained_messages_sync_state_only_until_resume_and_duplicates_are_ignored() -> None:
    orch, mes, _, _ = make()
    mes.states["cooker"] = "AWAITING_CHANGEOVER"
    await orch.on_state("cooker", state_payload("AWAITING_CHANGEOVER"), retained=True)
    assert orch.area("cooker").mes_state == "AWAITING_CHANGEOVER"
    assert mes.calls == []
    assert kinds(orch) == ["state"]

    # same retained message again (reconnect): nothing new
    await orch.on_state("cooker", state_payload("AWAITING_CHANGEOVER"), retained=True)
    assert kinds(orch) == ["state"]

    await orch.resume("cooker")
    assert [c[1] for c in mes.calls] == ["cip-complete"]

    # opting in acts on retained messages
    orch2, mes2, _, _ = make(act_on_retained=True)
    mes2.states["cooker"] = "AWAITING_CHANGEOVER"
    await orch2.on_state("cooker", state_payload("AWAITING_CHANGEOVER"), retained=True)
    assert [c[1] for c in mes2.calls] == ["cip-complete"]

    with pytest.raises(ChangeoverSequenceError, match="no MES state"):
        await make()[0].resume("cooker")


async def test_partial_recipe_download_is_not_reported_and_can_be_retried() -> None:
    orch, mes, writer, sink = make()
    writer.fail_params = {"ramp_rate"}
    mes.states["cooker"] = "RECIPE_LOADING"
    await orch.on_state("cooker", state_payload("RECIPE_LOADING"))
    await orch.on_recipe("cooker", prisma_recipe())
    assert len(writer.calls) == 1 and mes.calls == []
    rt = orch.area("cooker")
    assert rt.pending_recipe is not None and rt.loaded_recipe_key is None
    assert rt.last_recipe_result["failed"] == 1 and rt.last_recipe_result["confirmed"] == 2
    assert kinds(orch)[-1] == "recipe_partial"
    assert "2/3 parameters confirmed" in rt.last_error

    writer.fail_params = set()
    assert await orch.retry_recipe("cooker", actor="alice") is True
    assert len(writer.calls) == 2
    actions = [e for e in orch.events("cooker") if e.kind == "operator_action"]
    assert actions[-1].detail == {"action": "retry_recipe", "actor": "alice"}
    assert [c[1] for c in mes.calls] == ["recipe-loaded"]
    assert rt.mes_state == "READY_TO_START" and rt.pending_recipe is None
    with pytest.raises(ChangeoverSequenceError, match="no pending recipe"):
        await orch.retry_recipe("cooker")

    # a writer exception is contained
    writer.explode = True
    mes.states["cooker"] = "RECIPE_LOADING"
    rt.mes_state = "RECIPE_LOADING"
    await orch.on_recipe("cooker", prisma_recipe(updated="2026-06-01T09:30:00.000Z"))
    assert kinds(orch)[-1] == "recipe_write_failed" and "OPC-UA session lost" in rt.last_error
    assert len(sink.records) == 1  # only the one successful recipe-loaded write was audited


async def test_recipe_for_another_schedule_order_is_not_downloaded() -> None:
    orch, mes, writer, _ = make()
    mes.states["cooker"] = "RECIPE_LOADING"
    await orch.on_state("cooker", state_payload("RECIPE_LOADING", nxt="so-2"))
    await orch.on_recipe("cooker", prisma_recipe(so="so-77"))
    assert writer.calls == [] and mes.calls == []
    assert kinds(orch)[-1] == "recipe_mismatch"
    assert orch.events("cooker")[-1].detail == {
        "recipe_schedule_order_id": "so-77",
        "next_so_id": "so-2",
    }


async def test_hub_outage_and_refusals_are_recorded_not_raised() -> None:
    orch, mes, _, sink = make()
    mes.down = True
    mes.states["cooker"] = "AWAITING_CHANGEOVER"
    await orch.on_state("cooker", state_payload("AWAITING_CHANGEOVER"))
    rt = orch.area("cooker")
    assert kinds(orch)[-1] == "write_undeliverable"
    assert rt.writes == 1 and rt.writes_failed == 1
    assert "hub unreachable" in rt.last_error
    assert sink.records[-1].value.quality is QualityCode.BAD
    assert "hub unreachable" in sink.records[-1].value.raw["error"]

    # operator confirmation while the hub is down surfaces as a sequence error
    mes.down = False
    mes.states["cooker"] = "READY_TO_START"
    await orch.on_state(
        "cooker", state_payload("READY_TO_START", entered="2026-06-01T11:00:00.000Z")
    )
    mes.down = True
    with pytest.raises(ChangeoverSequenceError, match="could not be delivered"):
        await orch.confirm_start("cooker", "op")
    mes.down = False

    # the MES refusing a command (state drift) is a failed write, state unchanged locally
    mes.refuse = True
    outcome = await orch.confirm_start("cooker", "op")
    assert outcome.success is False and rt.mes_state == "READY_TO_START"
    assert rt.writes_failed == 3  # cip-complete (down), start (down), start (refused)
    mes.refuse = False

    with pytest.raises(ChangeoverSequenceError, match="not READY_TO_START"):
        mes.states["cooker"] = "PRODUCTION"
        await orch.on_state(
            "cooker", state_payload("PRODUCTION", entered="2026-06-01T11:30:00.000Z")
        )
        await orch.confirm_start("cooker", "op")


async def test_auto_start_starts_production_on_ready() -> None:
    areas = [
        AreaChangeoverConfig(
            area="barreling",
            equipment_id="BARREL-LINE",
            cooker_number="B1",
            cip_policy=CipPolicy.SKIP,
            auto_start=True,
        )
    ]
    orch, mes, _, _ = make(areas=areas, requested_by="forge-ot-barreling")
    mes.states["barreling"] = "READY_TO_START"
    await orch.on_state("barreling", {"state": "READY_TO_START", "enteredAt": "x"})
    assert mes.calls == [("barreling", "start-production", {"startedBy": "forge-ot-barreling"})]
    assert orch.area("barreling").mes_state == "PRODUCTION"
    with pytest.raises(KeyError, match="not managed"):
        orch.area("cooker")


async def test_bind_and_handle_message_route_mqtt_topics() -> None:
    orch, mes, writer, _ = make()
    subscriber = MqttSubscriber()
    orch.bind(subscriber)
    assert sorted(subscriber.get_topic_filters()) == [
        "whk/+/+/changeover/state",
        "whk/+/+/recipe/next",
    ]

    mes.states["cooker"] = "AWAITING_CHANGEOVER"
    live = IncomingMessage(
        topic=STATE_T, payload=json.dumps(state_payload("AWAITING_CHANGEOVER")).encode()
    )
    assert await subscriber.process_message(live) == 1
    assert [c[1] for c in mes.calls] == ["cip-complete"]

    recipe = IncomingMessage(
        topic=RECIPE_T, payload=json.dumps(prisma_recipe()).encode(), retain=True
    )
    assert await subscriber.process_message(recipe) == 1
    # retained recipe: parked, not loaded
    assert writer.calls == [] and orch.area("cooker").pending_recipe is not None
    await orch.resume("cooker")
    assert len(writer.calls) == 1 and [c[1] for c in mes.calls] == ["cip-complete", "recipe-loaded"]

    # other areas / topics / sites are ignored; bad JSON is recorded
    assert (
        await orch.handle_message(
            IncomingMessage(topic="whk/whk01/fermentation/changeover/state", payload=b"{}")
        )
        is False
    )
    assert (
        await orch.handle_message(
            IncomingMessage(topic="whk/whk01/cooker/queue/depth", payload=b"{}")
        )
        is False
    )
    assert (
        await orch.handle_message(
            IncomingMessage(topic="other/whk01/cooker/changeover/state", payload=b"{}")
        )
        is False
    )
    assert await orch.handle_message(IncomingMessage(topic=STATE_T, payload=b"{not json")) is True
    assert kinds(orch)[-1] == "bad_payload"
    assert (
        await orch.handle_message(IncomingMessage(topic=STATE_T, payload=b'{"area":"cooker"}'))
        is True
    )
    assert kinds(orch)[-1] == "bad_payload"
    assert subscriber.get_stats()["errors"] == 0


async def test_operator_actions_record_the_actor() -> None:
    """FB-082: confirm-start puts the operator on the write event and the audit
    record; resume logs who asked; programmatic callers add nothing."""
    orch, mes, _writer, sink = make()
    mes.states["cooker"] = "READY_TO_START"
    await orch.on_state(
        "cooker", state_payload("READY_TO_START", entered="2026-06-01T10:05:00.000Z")
    )
    outcome = await orch.confirm_start("cooker", "alice")
    assert outcome.success
    event = orch.events("cooker")[-1]
    assert event.kind == "write" and event.detail["actor"] == "alice"
    record = sink.records[-1]
    assert record.context.operator_id == "alice" and record.context.extra["actor"] == "alice"
    assert record.context.extra["write_requested_by"] == OT_ADAPTER_ID

    await orch.resume("cooker", actor="bob")
    actions = [e for e in orch.events("cooker") if e.kind == "operator_action"]
    assert actions == [actions[-1]] and actions[-1].detail == {"action": "resume", "actor": "bob"}

    before = len(orch.events("cooker"))
    await orch.resume("cooker")
    assert [e.kind for e in orch.events("cooker")[before:]] == []
