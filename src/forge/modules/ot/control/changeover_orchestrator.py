"""Drive the MES changeover sequence from the OT module (BACKLOG FB-062).

The MES owns the per-area changeover state machine and publishes it on the
UNS (retained); the OT module owns the equipment. This orchestrator closes
the loop the MES write-back path (FB-054) opened::

    MES publishes (retained)                 OT module                          MES write-back
    <root>/<site>/<area>/changeover/state ─▶ on_state()
       AWAITING_CHANGEOVER                     run CIP per CipPolicy ───────────▶ cip-complete
       CIP_COMPLETE / RECIPE_LOADING           load pending recipe ─┐
    <root>/<site>/<area>/recipe/next ───────▶ on_recipe() ──────────┴─ RecipeWriteAdapter
                                               all parameters CONFIRMED ───────▶ recipe-loaded
       READY_TO_START                          confirm_start() / auto_start ──▶ start-production
       PRODUCTION                              clear pending state

Design decisions:
    D1: Every MES transition is requested through ``MesChangeoverClient``
        with ``confirm=True``; the read-back state updates the local view
        immediately instead of waiting for the MQTT echo.
    D2: Retained messages (replayed on every reconnect) only synchronise
        state unless ``act_on_retained`` is set; ``resume(area)`` lets an
        operator act on the current state after a restart.
    D3: A recipe is downloaded only when its ``scheduleOrderId`` is the
        area's ``nextSOId`` and the MES is in CIP_COMPLETE/RECIPE_LOADING;
        a recipe that arrives early is parked and loaded on the transition.
    D4: ``recipe-loaded`` is only reported when **every** mapped parameter
        read back CONFIRMED; partial downloads leave the MES in
        RECIPE_LOADING for ``retry_recipe()`` or an operator.
    D5: ``start-production`` is gated on ``confirm_start()`` unless the
        area opts into ``auto_start``.
    D6: Every MES write outcome becomes a ContextualRecord
        (``ot.changeover.<area>.<command>``) handed to ``record_sink`` so the
        hub's audit trail (FB-060) sees who asked for what and what the MES
        answered.
"""

from __future__ import annotations

import asyncio
import enum
import logging
from collections import deque
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, Protocol

from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge.modules.ot.control.mes_changeover import (
    CHANGEOVER_AREAS,
    MesChangeoverClient,
    transition_from,
)
from forge.transport.spoke_callback import WriteDispatchError, WriteOutcome

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable, Iterable

    from forge.modules.ot.mqtt.subscriber import IncomingMessage, MqttSubscriber

logger = logging.getLogger(__name__)

OT_ADAPTER_ID = "forge-ot-module"
OT_ADAPTER_VERSION = "0.1.0"
OT_SCHEMA_REF = "forge://schemas/ot-module/v0.1.0"

#: MES changeover states (mirrors backend ``ChangeoverState``).
PRODUCTION = "PRODUCTION"
COOK_COMPLETE = "COOK_COMPLETE"
AWAITING_CHANGEOVER = "AWAITING_CHANGEOVER"
CIP_IN_PROGRESS = "CIP_IN_PROGRESS"
CIP_COMPLETE = "CIP_COMPLETE"
RECIPE_LOADING = "RECIPE_LOADING"
RECIPE_LOADED = "RECIPE_LOADED"
READY_TO_START = "READY_TO_START"
ERROR = "ERROR"

RECIPE_LOAD_STATES = (CIP_COMPLETE, RECIPE_LOADING)


class CipPolicy(enum.StrEnum):
    """What the OT module does when an area enters AWAITING_CHANGEOVER."""

    #: Someone else (Ignition, an operator) reports CIP completion.
    EXTERNAL = "external"
    #: Run the configured :class:`CipRunner`, then report ``cip-complete``.
    RUNNER = "runner"
    #: No CIP for this area; report ``cip-complete`` at once (MES CIP-skipped flow).
    SKIP = "skip"


@dataclass
class CipResult:
    started_at: datetime
    ended_at: datetime
    success: bool = True
    detail: str = ""

    @property
    def duration_seconds(self) -> float:
        return max((self.ended_at - self.started_at).total_seconds(), 0.0)


class CipRunner(Protocol):
    """Runs the clean-in-place cycle for an area (PLC sequence, timer, ...)."""

    async def run(self, area: str, config: AreaChangeoverConfig) -> CipResult: ...


class RecipeWriter(Protocol):
    """What the orchestrator needs from :class:`RecipeWriteAdapter`."""

    async def execute_recipe_write(
        self,
        equipment_id: str,
        parameters: dict[str, Any],
        production_order_id: str = "",
        recipe_id: str = "",
        requestor: str | None = None,
        role: Any = None,
        reason: str = "",
    ) -> Any: ...


@dataclass
class AreaChangeoverConfig:
    """How one MES changeover area maps onto OT equipment."""

    area: str
    #: ``RecipeWriteConfig.equipment_id`` the recipe parameters are written to.
    equipment_id: str
    #: What the MES records as ``cookerNumber`` on ``recipe-loaded``.
    cooker_number: str
    cip_policy: CipPolicy = CipPolicy.EXTERNAL
    #: Call ``start-production`` as soon as the MES reports READY_TO_START.
    auto_start: bool = False

    def __post_init__(self) -> None:
        if self.area not in CHANGEOVER_AREAS:
            msg = f"unknown changeover area '{self.area}' (expected one of {CHANGEOVER_AREAS})"
            raise ValueError(msg)
        self.cip_policy = CipPolicy(self.cip_policy)


class ChangeoverSequenceError(Exception):
    """An operator action does not fit the area's current MES state."""


# ---------------------------------------------------------------------------
# Recipe payload
# ---------------------------------------------------------------------------


@dataclass
class RecipeSnapshot:
    """The parts of ``recipe/next`` the orchestrator acts on."""

    instance_id: str
    updated_at: str
    schedule_order_id: str
    recipe_id: str = ""
    recipe_name: str = ""
    parameters: dict[str, Any] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def key(self) -> tuple[str, str]:
        return (self.instance_id, self.updated_at)


def _coerce_param(value: Any) -> Any:
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, (int, float)):
        return value
    text = str(value).strip()
    try:
        number = float(text)
    except ValueError:
        return text
    return (
        int(number)
        if number.is_integer() and "." not in text and "e" not in text.lower()
        else number
    )


def _get(d: Any, *path: str) -> Any:
    cur = d
    for key in path:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(key)
    return cur


def parse_recipe_payload(payload: dict[str, Any]) -> RecipeSnapshot:
    """Accept both ``recipe/next`` shapes the MES emits.

    * the raw ``getWithAllComponents`` row (``id``, ``recipeParameters[].
      masterRecipeParameter.recipeParamName`` / ``recipeNumericalSetpoint``)
    * the ``GET /changeover/<area>/next-recipe`` shape (``recipeInstanceId``,
      ``recipeParameters[].name`` / ``value``)
    """
    if not isinstance(payload, dict):
        msg = "recipe payload must be a JSON object"
        raise ValueError(msg)
    instance_id = payload.get("recipeInstanceId") or payload.get("id")
    if not instance_id:
        msg = "recipe payload has no recipeInstanceId/id"
        raise ValueError(msg)
    updated_at = payload.get("updatedAt") or _get(payload, "recipe", "updatedAt") or ""
    schedule_order_id = payload.get("scheduleOrderId") or _get(payload, "scheduleOrder", "id") or ""
    parameters: dict[str, Any] = {}
    for item in payload.get("recipeParameters") or []:
        if not isinstance(item, dict):
            continue
        name = item.get("name") or _get(item, "masterRecipeParameter", "recipeParamName")
        if not name:
            continue
        value = item.get("value")
        if value is None:
            value = item.get("recipeNumericalSetpoint")
        if value is None:
            value = item.get("recipeSetpointBooleanValue")
        if value is None:
            continue
        parameters[str(name)] = _coerce_param(value)
    return RecipeSnapshot(
        instance_id=str(instance_id),
        updated_at=str(updated_at),
        schedule_order_id=str(schedule_order_id),
        recipe_id=str(_get(payload, "recipe", "id") or ""),
        recipe_name=str(_get(payload, "recipe", "name") or _get(payload, "recipe", "Recipe") or ""),
        parameters=parameters,
        raw=payload,
    )


# ---------------------------------------------------------------------------
# Runtime state
# ---------------------------------------------------------------------------


@dataclass
class OrchestrationEvent:
    at: datetime
    area: str
    kind: str
    detail: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {"at": self.at.isoformat(), "area": self.area, "kind": self.kind, **self.detail}


@dataclass
class AreaRuntime:
    config: AreaChangeoverConfig
    mes_state: str | None = None
    state_key: tuple[str, str] | None = None
    active_so_id: str | None = None
    next_so_id: str | None = None
    pending_recipe: RecipeSnapshot | None = None
    loaded_recipe_key: tuple[str, str] | None = None
    last_recipe_result: dict[str, Any] | None = None
    cip_in_progress: bool = False
    awaiting_start_confirmation: bool = False
    last_error: str | None = None
    events: deque[OrchestrationEvent] = field(default_factory=lambda: deque(maxlen=200))
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    writes: int = 0
    writes_failed: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "area": self.config.area,
            "equipment_id": self.config.equipment_id,
            "cip_policy": self.config.cip_policy.value,
            "auto_start": self.config.auto_start,
            "mes_state": self.mes_state,
            "active_so_id": self.active_so_id,
            "next_so_id": self.next_so_id,
            "pending_recipe": self.pending_recipe.instance_id if self.pending_recipe else None,
            "loaded_recipe": self.loaded_recipe_key[0] if self.loaded_recipe_key else None,
            "last_recipe_result": self.last_recipe_result,
            "cip_in_progress": self.cip_in_progress,
            "awaiting_start_confirmation": self.awaiting_start_confirmation,
            "writes": self.writes,
            "writes_failed": self.writes_failed,
            "last_error": self.last_error,
            "last_event": self.events[-1].to_dict() if self.events else None,
        }


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


class ChangeoverOrchestrator:
    """React to MES changeover topics and answer through the write-back path.

    Args:
        mes: Typed client over the hub's ``WriteDispatcher``.
        recipe_writer: :class:`RecipeWriteAdapter` (or anything with
            ``execute_recipe_write``) that pushes recipe parameters to PLCs.
        areas: One config per MES changeover area this module serves.
        cip_runner: Required for areas with ``CipPolicy.RUNNER``.
        record_sink: Receives one ContextualRecord per MES write outcome
            (``async write_batch(records)``).
        on_event: Optional callback for every orchestration event.
        topic_root: First topic level of the UNS (``whk`` → ``whk/<site>/<area>/...``).
        act_on_retained: Act on retained (replayed) state messages, not just
            live transitions.
        requested_by: Identity recorded on MES writes and PLC writes.
        now: Clock, injectable for tests.
    """

    def __init__(
        self,
        mes: MesChangeoverClient,
        recipe_writer: RecipeWriter,
        *,
        areas: Iterable[AreaChangeoverConfig],
        cip_runner: CipRunner | None = None,
        record_sink: Any | None = None,
        on_event: Callable[[OrchestrationEvent], Awaitable[None] | None] | None = None,
        topic_root: str = "whk",
        act_on_retained: bool = False,
        requested_by: str = OT_ADAPTER_ID,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self._mes = mes
        self._recipe_writer = recipe_writer
        self._cip_runner = cip_runner
        self._record_sink = record_sink
        self._on_event = on_event
        self._topic_root = topic_root
        self._act_on_retained = act_on_retained
        self._requested_by = requested_by
        self._now = now or (lambda: datetime.now(UTC))
        self._areas: dict[str, AreaRuntime] = {}
        for config in areas:
            if config.cip_policy is CipPolicy.RUNNER and cip_runner is None:
                msg = f"area '{config.area}' uses CipPolicy.RUNNER but no cip_runner was given"
                raise ValueError(msg)
            self._areas[config.area] = AreaRuntime(config=config)
        if not self._areas:
            msg = "at least one AreaChangeoverConfig is required"
            raise ValueError(msg)

    # -- wiring ---------------------------------------------------------------

    @property
    def topic_filters(self) -> list[str]:
        root = self._topic_root
        return [f"{root}/+/+/changeover/state", f"{root}/+/+/recipe/next"]

    def bind(self, subscriber: MqttSubscriber) -> None:
        """Register the two MES topics on an ``MqttSubscriber``."""
        for topic_filter in self.topic_filters:
            subscriber.subscribe(
                topic_filter, self.handle_message, name="changeover-orchestrator", qos=1
            )

    async def handle_message(self, msg: IncomingMessage) -> bool:
        """Dispatch an MQTT message; returns True when it was for one of our areas."""
        parts = msg.topic.split("/")
        if len(parts) != 5 or parts[0] != self._topic_root:
            return False
        _site, area, group, leaf = parts[1], parts[2], parts[3], parts[4]
        if area not in self._areas:
            return False
        try:
            payload = msg.payload_json()
        except ValueError as exc:
            await self._error(area, "bad_payload", f"{msg.topic}: {exc}")
            return True
        if (group, leaf) == ("changeover", "state"):
            await self.on_state(area, payload, retained=bool(msg.retain))
            return True
        if (group, leaf) == ("recipe", "next"):
            await self.on_recipe(area, payload, retained=bool(msg.retain))
            return True
        return False

    # -- MES → OT -------------------------------------------------------------

    async def on_state(self, area: str, payload: Any, *, retained: bool = False) -> None:
        """Handle ``changeover/state``."""
        rt = self._runtime(area)
        if not isinstance(payload, dict) or not payload.get("state"):
            await self._error(area, "bad_payload", "changeover/state without a state")
            return
        async with rt.lock:
            state = str(payload["state"])
            key = (state, str(payload.get("enteredAt") or ""))
            changed = key != rt.state_key
            rt.state_key = key
            rt.mes_state = state
            rt.active_so_id = payload.get("activeSOId") or None
            rt.next_so_id = payload.get("nextSOId") or None
            if state == PRODUCTION:
                rt.pending_recipe = None
                rt.loaded_recipe_key = None
                rt.awaiting_start_confirmation = False
            if not changed:
                return
            await self._event(
                rt,
                "state",
                state=state,
                retained=retained,
                active_so_id=rt.active_so_id,
                next_so_id=rt.next_so_id,
            )
            if retained and not self._act_on_retained:
                return
            await self._act(rt)

    async def on_recipe(self, area: str, payload: Any, *, retained: bool = False) -> None:
        """Handle ``recipe/next``."""
        rt = self._runtime(area)
        try:
            snapshot = parse_recipe_payload(payload)
        except ValueError as exc:
            await self._error(area, "bad_recipe", str(exc))
            return
        async with rt.lock:
            if rt.loaded_recipe_key == snapshot.key:
                return
            rt.pending_recipe = snapshot
            await self._event(
                rt,
                "recipe",
                recipe_instance_id=snapshot.instance_id,
                schedule_order_id=snapshot.schedule_order_id,
                parameters=len(snapshot.parameters),
                retained=retained,
            )
            if retained and not self._act_on_retained:
                return
            if rt.mes_state in RECIPE_LOAD_STATES:
                await self._load_pending_recipe(rt)

    # -- operator actions -----------------------------------------------------

    async def confirm_start(self, area: str, operator_id: str) -> WriteOutcome:
        """Operator go-ahead: READY_TO_START → PRODUCTION.

        ``operator_id`` is the acting subject: it goes to the MES as
        ``startedBy`` and onto the audit record and event as ``actor``
        (the hub user when the call comes over REST, FB-082).
        """
        rt = self._runtime(area)
        async with rt.lock:
            if rt.mes_state != READY_TO_START:
                msg = f"{area} is {rt.mes_state or 'unknown'}, not READY_TO_START"
                raise ChangeoverSequenceError(msg)
            outcome = await self._write(
                rt,
                "start-production",
                self._mes.start_production(area, operator_id),
                actor=operator_id,
            )
            if outcome is not None and outcome.success:
                rt.awaiting_start_confirmation = False
            if outcome is None:
                msg = f"start-production for {area} could not be delivered: {rt.last_error}"
                raise ChangeoverSequenceError(msg)
            return outcome

    async def retry_recipe(self, area: str, *, actor: str | None = None) -> bool:
        """Re-run the pending recipe download (after a partial failure).

        ``actor`` (who asked, when known) is recorded as an
        ``operator_action`` event before the download runs.
        """
        rt = self._runtime(area)
        async with rt.lock:
            if rt.pending_recipe is None:
                msg = f"{area} has no pending recipe"
                raise ChangeoverSequenceError(msg)
            if rt.mes_state not in RECIPE_LOAD_STATES:
                msg = f"{area} is {rt.mes_state or 'unknown'}; recipes load in {RECIPE_LOAD_STATES}"
                raise ChangeoverSequenceError(msg)
            if actor:
                await self._event(rt, "operator_action", action="retry_recipe", actor=actor)
            return await self._load_pending_recipe(rt)

    async def resume(self, area: str, *, actor: str | None = None) -> None:
        """Act on the area's current (possibly retained) MES state.

        ``actor`` (who asked, when known) is recorded as an
        ``operator_action`` event before the state is acted on.
        """
        rt = self._runtime(area)
        async with rt.lock:
            if rt.mes_state is None:
                msg = f"{area}: no MES state received yet"
                raise ChangeoverSequenceError(msg)
            if actor:
                await self._event(rt, "operator_action", action="resume", actor=actor)
            await self._act(rt)

    # -- observability --------------------------------------------------------

    def area(self, area: str) -> AreaRuntime:
        return self._runtime(area)

    def snapshot(self) -> dict[str, Any]:
        return {
            "topic_filters": self.topic_filters,
            "act_on_retained": self._act_on_retained,
            "areas": {area: rt.to_dict() for area, rt in self._areas.items()},
        }

    def events(self, area: str) -> list[OrchestrationEvent]:
        return list(self._runtime(area).events)

    # -- internals ------------------------------------------------------------

    def _runtime(self, area: str) -> AreaRuntime:
        rt = self._areas.get(area)
        if rt is None:
            msg = f"area '{area}' is not managed by this orchestrator ({sorted(self._areas)})"
            raise KeyError(msg)
        return rt

    async def _act(self, rt: AreaRuntime) -> None:
        """Take the action the current MES state calls for (lock held)."""
        state = rt.mes_state
        area = rt.config.area
        if state == AWAITING_CHANGEOVER:
            await self._run_cip(rt)
        elif state in RECIPE_LOAD_STATES:
            if rt.pending_recipe is not None:
                await self._load_pending_recipe(rt)
            else:
                await self._event(rt, "waiting_for_recipe", next_so_id=rt.next_so_id)
        elif state == READY_TO_START:
            if rt.config.auto_start:
                await self._write(
                    rt, "start-production", self._mes.start_production(area, self._requested_by)
                )
            else:
                rt.awaiting_start_confirmation = True
                await self._event(rt, "awaiting_start_confirmation")
        elif state == ERROR:
            await self._event(rt, "mes_error", error=rt.last_error)

    async def _run_cip(self, rt: AreaRuntime) -> None:
        area = rt.config.area
        policy = rt.config.cip_policy
        if policy is CipPolicy.EXTERNAL:
            await self._event(rt, "cip_external")
            return
        if policy is CipPolicy.SKIP:
            now = self._now()
            await self._event(rt, "cip_skipped")
            await self._write(
                rt,
                "cip-complete",
                self._mes.cip_complete(
                    area, now, now, duration_seconds=0, reported_by=self._requested_by
                ),
            )
            return
        assert self._cip_runner is not None  # validated in __init__
        rt.cip_in_progress = True
        await self._event(rt, "cip_started")
        try:
            result = await self._cip_runner.run(area, rt.config)
        except Exception as exc:
            rt.cip_in_progress = False
            await self._error(area, "cip_failed", f"{type(exc).__name__}: {exc}")
            return
        rt.cip_in_progress = False
        if not result.success:
            await self._error(area, "cip_failed", result.detail or "CIP runner reported failure")
            return
        await self._event(rt, "cip_finished", duration_seconds=result.duration_seconds)
        await self._write(
            rt,
            "cip-complete",
            self._mes.cip_complete(
                area,
                result.started_at,
                result.ended_at,
                duration_seconds=result.duration_seconds,
                reported_by=self._requested_by,
            ),
        )

    async def _load_pending_recipe(self, rt: AreaRuntime) -> bool:
        """Push the pending recipe to the PLC; report recipe-loaded when confirmed."""
        area = rt.config.area
        snapshot = rt.pending_recipe
        if snapshot is None:
            return False
        if (
            rt.next_so_id
            and snapshot.schedule_order_id
            and snapshot.schedule_order_id != rt.next_so_id
        ):
            await self._event(
                rt,
                "recipe_mismatch",
                recipe_schedule_order_id=snapshot.schedule_order_id,
                next_so_id=rt.next_so_id,
            )
            return False
        try:
            result = await self._recipe_writer.execute_recipe_write(
                equipment_id=rt.config.equipment_id,
                parameters=dict(snapshot.parameters),
                production_order_id=snapshot.schedule_order_id,
                recipe_id=snapshot.recipe_id or snapshot.instance_id,
                requestor=self._requested_by,
                reason=f"Changeover recipe download {snapshot.recipe_name or snapshot.instance_id}",
            )
        except Exception as exc:
            await self._error(area, "recipe_write_failed", f"{type(exc).__name__}: {exc}")
            return False
        summary = result.to_dict() if hasattr(result, "to_dict") else {"success": bool(result)}
        rt.last_recipe_result = summary
        if not getattr(result, "success", False):
            confirmed = summary.get("confirmed", 0)
            total = summary.get("total_parameters", 0)
            await self._error(
                area,
                "recipe_partial",
                f"{confirmed}/{total} parameters confirmed "
                f"({summary.get('failed', 0)} failed, {summary.get('skipped', 0)} skipped)",
            )
            return False
        await self._event(
            rt,
            "recipe_written",
            recipe_instance_id=snapshot.instance_id,
            parameters=summary.get("total_parameters", len(snapshot.parameters)),
            batch_id=summary.get("batch_id"),
        )
        outcome = await self._write(
            rt,
            "recipe-loaded",
            self._mes.recipe_loaded(
                area,
                snapshot.instance_id,
                snapshot.updated_at,
                rt.config.cooker_number,
                loaded_by=self._requested_by,
            ),
        )
        if outcome is not None and outcome.success:
            rt.loaded_recipe_key = snapshot.key
            rt.pending_recipe = None
            if rt.mes_state == READY_TO_START:
                await self._act(rt)
            return True
        return False

    async def _write(
        self,
        rt: AreaRuntime,
        command: str,
        call: Awaitable[WriteOutcome],
        *,
        actor: str | None = None,
    ) -> WriteOutcome | None:
        """Run one MES write, update local state from the read-back, record it.

        ``actor`` is the person behind an operator action (confirm-start);
        system-initiated writes leave it unset and are attributed to
        ``requested_by``.
        """
        area = rt.config.area
        rt.writes += 1
        try:
            outcome = await call
        except WriteDispatchError as exc:
            rt.writes_failed += 1
            rt.last_error = f"{command}: {exc.code}: {exc.message}"
            await self._event(
                rt, "write_undeliverable", command=command, code=exc.code, error=exc.message
            )
            await self._sink_outcome(rt, command, None, exc, actor=actor)
            return None
        except Exception as exc:  # keep the subscriber alive
            rt.writes_failed += 1
            rt.last_error = f"{command}: {type(exc).__name__}: {exc}"
            await self._event(rt, "write_error", command=command, error=str(exc))
            await self._sink_outcome(rt, command, None, exc, actor=actor)
            return None

        readback = transition_from(outcome)
        if outcome.success:
            new_state = (readback or {}).get("state")
            if isinstance(new_state, str) and new_state:
                rt.mes_state = new_state
                rt.state_key = (new_state, str((readback or {}).get("enteredAt") or ""))
                rt.active_so_id = (readback or {}).get("activeSOId") or rt.active_so_id
                rt.next_so_id = (readback or {}).get("nextSOId") or rt.next_so_id
            rt.last_error = None
        else:
            rt.writes_failed += 1
            rt.last_error = f"{command}: {outcome.message}"
        await self._event(
            rt,
            "write",
            command=command,
            success=outcome.success,
            message=outcome.message,
            mes_state=rt.mes_state,
            **({"actor": actor} if actor else {}),
        )
        await self._sink_outcome(rt, command, outcome, None, actor=actor)
        logger.info(
            "Changeover %s %s: %s (%s)",
            area,
            command,
            "ok" if outcome.success else "refused",
            outcome.message,
        )
        return outcome

    async def _sink_outcome(
        self,
        rt: AreaRuntime,
        command: str,
        outcome: WriteOutcome | None,
        error: Exception | None,
        *,
        actor: str | None = None,
    ) -> None:
        if self._record_sink is None:
            return
        record = self.outcome_record(rt, command, outcome, error, actor=actor)
        try:
            await self._record_sink.write_batch([record])
        except Exception:  # pragma: no cover - sink problems must not stop the sequence
            logger.exception("record sink failed for %s %s", rt.config.area, command)

    def outcome_record(
        self,
        rt: AreaRuntime,
        command: str,
        outcome: WriteOutcome | None,
        error: Exception | None,
        *,
        actor: str | None = None,
    ) -> ContextualRecord:
        """One ContextualRecord per MES write attempt (audit trail).

        ``operator_id`` is the acting subject when there is one (an operator's
        confirm-start), otherwise the orchestrator's own identity;
        ``extra.write_requested_by`` is always the identity on the hub write.
        """
        now = self._now()
        area = rt.config.area
        readback = transition_from(outcome) if outcome is not None else None
        success = bool(outcome.success) if outcome is not None else False
        raw: dict[str, Any] = {
            "command": command,
            "success": success,
            "message": outcome.message if outcome is not None else str(error),
            "mes_state": rt.mes_state,
            "readback": readback,
            "recipe_instance_id": rt.pending_recipe.instance_id if rt.pending_recipe else None,
            "recipe_result": rt.last_recipe_result if command == "recipe-loaded" else None,
        }
        if error is not None:
            raw["error"] = f"{type(error).__name__}: {error}"
        quality = QualityCode.GOOD if success else QualityCode.BAD
        extra = {
            "event_type": f"changeover.{command}",
            "entity_type": "Changeover",
            "changeover_area": area,
            "write_requested_by": self._requested_by,
            "event_timestamp": now.isoformat(),
        }
        if actor:
            extra["actor"] = actor
        if rt.active_so_id:
            extra["schedule_order_id"] = rt.active_so_id
        if rt.next_so_id:
            extra["next_schedule_order_id"] = rt.next_so_id
        return ContextualRecord(
            source=RecordSource(
                adapter_id=OT_ADAPTER_ID,
                system="forge-ot",
                tag_path=f"ot.changeover.{area}.{command}",
            ),
            timestamp=RecordTimestamp(source_time=now, server_time=now),
            value=RecordValue(raw=raw, quality=quality, data_type="object"),
            context=RecordContext(
                area=area,
                equipment_id=rt.config.equipment_id,
                operating_mode=rt.mes_state,
                operator_id=actor or self._requested_by,
                extra=extra,
            ),
            lineage=RecordLineage(
                schema_ref=OT_SCHEMA_REF,
                adapter_id=OT_ADAPTER_ID,
                adapter_version=OT_ADAPTER_VERSION,
                transformation_chain=["ot:changeover-orchestrator"],
            ),
        )

    async def _event(self, rt: AreaRuntime, kind: str, **detail: Any) -> None:
        event = OrchestrationEvent(at=self._now(), area=rt.config.area, kind=kind, detail=detail)
        rt.events.append(event)
        if self._on_event is not None:
            try:
                result = self._on_event(event)
                if asyncio.iscoroutine(result):
                    await result
            except Exception:  # pragma: no cover - observers must not break the sequence
                logger.exception("on_event callback failed")

    async def _error(self, area: str, kind: str, message: str) -> None:
        rt = self._runtime(area)
        rt.last_error = message
        logger.warning("Changeover %s %s: %s", area, kind, message)
        await self._event(rt, kind, error=message)
