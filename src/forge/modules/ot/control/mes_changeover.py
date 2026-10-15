"""Drive the MES changeover state machine from the OT module (FB-054).

The MES backend exposes its per-area changeover commands as writable
tags on the hub → spoke ``Write`` path::

    mes.changeover.<area>.<command>      area ∈ cooker | fermentation | barreling
                                         command ∈ request | cip-complete |
                                                   recipe-loaded | start-production | reset

Each command carries the same JSON payload the backend's REST endpoint
takes (``POST /api/changeover/<area>/<command>``), so Ignition and the OT
module speak one contract. With ``confirm=True`` the backend returns a
read-back ``ContextualRecord`` on ``mes.changeover.<area>.state`` holding
the area state after the transition.

Typical OT sequence after the MES publishes ``changeover/state =
AWAITING_CHANGEOVER``: run CIP → :meth:`cip_complete` (MES publishes
``recipe/next``) → load the recipe through ``RecipeWriteAdapter`` →
:meth:`recipe_loaded` → operator go → :meth:`start_production`.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from forge.transport.spoke_callback import WriteDispatcher, WriteOutcome

CHANGEOVER_AREAS = ("cooker", "fermentation", "barreling")
CHANGEOVER_COMMANDS = (
    "request",
    "cip-complete",
    "recipe-loaded",
    "start-production",
    "reset",
)
RESET_TARGETS = ("AWAITING_CHANGEOVER", "CIP_COMPLETE")


def changeover_tag(area: str, command: str) -> str:
    """Tag path for an MES changeover command (validated)."""
    if area not in CHANGEOVER_AREAS:
        msg = f"unknown changeover area '{area}' (expected one of {CHANGEOVER_AREAS})"
        raise ValueError(msg)
    if command not in CHANGEOVER_COMMANDS:
        msg = f"unknown changeover command '{command}' (expected one of {CHANGEOVER_COMMANDS})"
        raise ValueError(msg)
    return f"mes.changeover.{area}.{command}"


def _iso(value: datetime | str) -> str:
    return value.isoformat() if isinstance(value, datetime) else str(value)


def _payload(**fields: Any) -> dict[str, Any]:
    return {k: v for k, v in fields.items() if v is not None}


def transition_from(outcome: WriteOutcome) -> dict[str, Any] | None:
    """The MES area state carried by a confirmed write's read-back, if any."""
    record = outcome.readback
    if record is None:
        return None
    raw = record.value.raw
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            return None
    return raw if isinstance(raw, dict) else None


class MesChangeoverClient:
    """Typed wrapper over the hub's :class:`WriteDispatcher` for MES changeover.

    Args:
        dispatcher: The hub's write dispatcher (``app.state.write_dispatcher``).
        adapter_id: MES adapter id; override per environment.
        confirm: Ask the backend for the read-back state on every command.
    """

    def __init__(
        self,
        dispatcher: WriteDispatcher,
        adapter_id: str = "forge-mes",
        *,
        confirm: bool = True,
    ) -> None:
        self._dispatcher = dispatcher
        self.adapter_id = adapter_id
        self.confirm = confirm

    async def send(self, area: str, command: str, payload: dict[str, Any]) -> WriteOutcome:
        """Write one command; raises ``WriteDispatchError`` when undeliverable."""
        return await self._dispatcher.write(
            self.adapter_id, changeover_tag(area, command), payload, confirm=self.confirm
        )

    async def request(
        self,
        area: str,
        requested_by: str,
        *,
        force: bool = False,
        reason: str | None = None,
        notes: str | None = None,
    ) -> WriteOutcome:
        """PRODUCTION / COOK_COMPLETE → AWAITING_CHANGEOVER."""
        return await self.send(
            area,
            "request",
            _payload(requestedBy=requested_by, force=force or None, reason=reason, notes=notes),
        )

    async def cip_complete(
        self,
        area: str,
        cip_start: datetime | str,
        cip_end: datetime | str,
        *,
        duration_seconds: float | None = None,
        reported_by: str | None = None,
    ) -> WriteOutcome:
        """AWAITING_CHANGEOVER / CIP_IN_PROGRESS → CIP_COMPLETE → RECIPE_LOADING.

        The MES publishes ``recipe/next`` for the area as part of this
        transition.
        """
        return await self.send(
            area,
            "cip-complete",
            _payload(
                cipStartTime=_iso(cip_start),
                cipEndTime=_iso(cip_end),
                cipDurationSeconds=duration_seconds,
                reportedBy=reported_by,
            ),
        )

    async def recipe_loaded(
        self,
        area: str,
        recipe_instance_id: str,
        source_updated_at: datetime | str,
        cooker_number: str,
        *,
        loaded_by: str | None = None,
    ) -> WriteOutcome:
        """RECIPE_LOADING / CIP_COMPLETE → RECIPE_LOADED → READY_TO_START.

        ``source_updated_at`` must be the recipe instance's ``updatedAt``
        read from ``recipe/next``; the MES refuses a stale version.
        """
        return await self.send(
            area,
            "recipe-loaded",
            _payload(
                scheduleOrderRecipeInstanceId=recipe_instance_id,
                sourceUpdatedAt=_iso(source_updated_at),
                cookerNumber=cooker_number,
                loadedBy=loaded_by,
            ),
        )

    async def start_production(
        self, area: str, started_by: str, *, notes: str | None = None
    ) -> WriteOutcome:
        """READY_TO_START → PRODUCTION (advances the schedule-order queue)."""
        return await self.send(
            area, "start-production", _payload(startedBy=started_by, notes=notes)
        )

    async def reset(
        self, area: str, target_state: str, reset_by: str, *, reason: str | None = None
    ) -> WriteOutcome:
        """ERROR → AWAITING_CHANGEOVER | CIP_COMPLETE."""
        if target_state not in RESET_TARGETS:
            msg = f"reset target must be one of {RESET_TARGETS}, not '{target_state}'"
            raise ValueError(msg)
        return await self.send(
            area, "reset", _payload(targetState=target_state, resetBy=reset_by, reason=reason)
        )
