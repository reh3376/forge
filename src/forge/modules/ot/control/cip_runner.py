"""PLC-backed clean-in-place runner for the changeover orchestrator (FB-065).

The Ignition changeover specification leaves CIP to the PLC: Ignition
starts the sequence, watches a state tag (``Idle`` → ``Running`` →
``Complete`` | ``Faulted``) and publishes
``<root>/<site>/<area>/equipment/cipState`` while it runs. This module is
the OT-module replacement for that role.

:class:`PlcCipRunner` implements the orchestrator's ``CipRunner`` protocol:

1. The start command is a normal control write through the
   :class:`~forge.modules.ot.control.write_engine.ControlWriteEngine`, so
   it passes validation, interlocks and authorisation and lands in the
   write journal like every other PLC write.
2. The state tag is polled until it reads the complete or faulted value;
   both timeouts (PLC never starts, CIP never finishes) end the run as a
   failure with a human-readable detail.
3. Every state change is handed to an ``on_state`` callback with the
   ``cipState`` payload the specification defines, so the runtime can
   publish it for HMIs and the MES.

A PLC that holds ``Complete`` from the previous cycle is handled: when the
state already reads complete before the start command, the runner waits
for ``Running`` (or any non-complete value) before it accepts ``Complete``.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from forge.modules.ot.control.changeover_orchestrator import OT_ADAPTER_ID, CipResult
from forge.modules.ot.control.models import DataType, WriteRequest, WriteRole, WriteStatus

if TYPE_CHECKING:
    from forge.modules.ot.control.changeover_orchestrator import AreaChangeoverConfig
    from forge.modules.ot.control.interlock import TagReader
    from forge.modules.ot.control.write_engine import ControlWriteEngine

logger = logging.getLogger(__name__)

CIP_IDLE = "Idle"
CIP_RUNNING = "Running"
CIP_COMPLETE = "Complete"
CIP_FAULTED = "Faulted"

#: ``(area, cipState payload)`` → awaited when it returns a coroutine.
CipStateListener = Callable[[str, dict[str, Any]], Awaitable[None] | None]


@dataclass
class PlcCipSpec:
    """Which PLC tags drive one area's CIP sequence."""

    #: Written with ``start_value`` to launch the sequence (a one-shot bit, usually).
    start_tag: str
    #: Read while the sequence runs; compared with the three state values below.
    state_tag: str
    start_value: Any = True
    start_data_type: DataType = DataType.BOOLEAN
    running_value: Any = CIP_RUNNING
    complete_value: Any = CIP_COMPLETE
    faulted_value: Any = CIP_FAULTED
    fault_code_tag: str | None = None
    fault_message_tag: str | None = None
    poll_interval_seconds: float = 2.0
    #: The PLC must report ``running_value`` within this long after the start write.
    start_timeout_seconds: float = 60.0
    #: Whole-sequence limit measured from the start write.
    timeout_seconds: float = 3600.0

    def __post_init__(self) -> None:
        self.start_data_type = DataType(self.start_data_type)
        for name in ("poll_interval_seconds", "start_timeout_seconds", "timeout_seconds"):
            if getattr(self, name) <= 0:
                msg = f"{name} must be positive"
                raise ValueError(msg)
        if not self.start_tag or not self.state_tag:
            msg = "start_tag and state_tag are required"
            raise ValueError(msg)


@dataclass
class CipRunStatus:
    """What the runner last did for an area (for the REST status)."""

    area: str
    state: str = CIP_IDLE
    started_at: datetime | None = None
    ended_at: datetime | None = None
    fault_code: Any = None
    fault_message: str | None = None
    runs: int = 0
    failures: int = 0
    last_detail: str = ""
    last_payload: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "area": self.area,
            "state": self.state,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "fault_code": self.fault_code,
            "fault_message": self.fault_message,
            "runs": self.runs,
            "failures": self.failures,
            "last_detail": self.last_detail,
        }


def _matches(actual: Any, expected: Any) -> bool:
    """Loose equality for PLC state values (ints, bools, strings, enums-as-strings)."""
    if actual is None:
        return False
    if actual == expected:
        return True
    if isinstance(actual, bool) or isinstance(expected, bool):
        return False
    try:
        return float(actual) == float(expected)
    except (TypeError, ValueError):
        return str(actual).strip().lower() == str(expected).strip().lower()


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


class PlcCipRunner:
    """Run an area's CIP sequence on the PLC and report how it went."""

    def __init__(
        self,
        engine: ControlWriteEngine,
        tag_reader: TagReader,
        specs: Mapping[str, PlcCipSpec],
        *,
        requested_by: str = OT_ADAPTER_ID,
        role: WriteRole = WriteRole.ENGINEER,
        on_state: CipStateListener | None = None,
        now: Callable[[], datetime] | None = None,
        sleep: Callable[[float], Awaitable[None]] | None = None,
    ) -> None:
        self._engine = engine
        self._reader = tag_reader
        self._specs: dict[str, PlcCipSpec] = dict(specs)
        self._requested_by = requested_by
        self._role = role
        self._on_state = on_state
        self._now = now or (lambda: datetime.now(UTC))
        self._sleep = sleep or asyncio.sleep
        self._status: dict[str, CipRunStatus] = {
            area: CipRunStatus(area=area) for area in self._specs
        }

    # -- introspection --------------------------------------------------------

    @property
    def areas(self) -> list[str]:
        return sorted(self._specs)

    def spec_for(self, area: str) -> PlcCipSpec | None:
        return self._specs.get(area)

    def status(self) -> dict[str, Any]:
        return {area: st.to_dict() for area, st in sorted(self._status.items())}

    # -- CipRunner protocol ---------------------------------------------------

    async def run(self, area: str, config: AreaChangeoverConfig) -> CipResult:
        spec = self._specs.get(area)
        if spec is None:
            msg = f"no PLC CIP sequence configured for area '{area}'"
            raise LookupError(msg)
        status = self._status.setdefault(area, CipRunStatus(area=area))
        status.runs += 1
        status.fault_code = None
        status.fault_message = None
        status.ended_at = None

        try:
            initial = await self._reader.read_tag(spec.state_tag)
        except Exception as exc:
            started = self._now()
            return await self._fail(
                area, spec, status, started, started, f"cannot read {spec.state_tag}: {exc}"
            )
        stale_complete = _matches(initial, spec.complete_value)

        request = WriteRequest(
            tag_path=spec.start_tag,
            value=spec.start_value,
            data_type=spec.start_data_type,
            requestor=self._requested_by,
            role=self._role,
            reason=f"CIP start: {area} changeover ({config.equipment_id})",
            area=config.area,
            equipment_id=config.equipment_id,
        )
        started_at = self._now()
        result = await self._engine.execute(request)
        if result.status not in (WriteStatus.CONFIRMED, WriteStatus.UNCONFIRMED):
            error = (
                result.validation_error
                or result.interlock_error
                or result.auth_error
                or result.write_error
                or result.readback_error
                or result.status.value
            )
            detail = f"CIP start write {result.status.value}: {error}"
            return await self._fail(area, spec, status, started_at, started_at, detail)

        status.state = CIP_RUNNING
        status.started_at = started_at
        await self._emit(area, status, CIP_RUNNING, started_at, None)

        seen_running = False
        try:
            while True:
                await self._sleep(spec.poll_interval_seconds)
                now = self._now()
                elapsed = (now - started_at).total_seconds()
                state = await self._reader.read_tag(spec.state_tag)

                if _matches(state, spec.faulted_value):
                    code = await self._read_optional(spec.fault_code_tag)
                    message = await self._read_optional(spec.fault_message_tag)
                    detail = "PLC reported CIP fault"
                    if code is not None:
                        detail += f" {code}"
                    if message:
                        detail += f": {message}"
                    return await self._fail(
                        area, spec, status, started_at, now, detail, code=code, message=message
                    )
                if _matches(state, spec.running_value):
                    seen_running = True
                elif _matches(state, spec.complete_value) and (seen_running or not stale_complete):
                    status.state = CIP_COMPLETE
                    status.ended_at = now
                    status.last_detail = ""
                    await self._emit(area, status, CIP_COMPLETE, started_at, now)
                    return CipResult(started_at=started_at, ended_at=now, success=True)

                if not seen_running and elapsed >= spec.start_timeout_seconds:
                    detail = (
                        f"PLC did not start CIP within {spec.start_timeout_seconds:g}s "
                        f"({spec.state_tag}={state!r})"
                    )
                    return await self._fail(area, spec, status, started_at, now, detail)
                if elapsed >= spec.timeout_seconds:
                    detail = (
                        f"CIP timed out after {spec.timeout_seconds:g}s "
                        f"({spec.state_tag}={state!r})"
                    )
                    return await self._fail(area, spec, status, started_at, now, detail)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            now = self._now()
            return await self._fail(
                area, spec, status, started_at, now, f"CIP monitoring failed: {exc}"
            )

    # -- internals ------------------------------------------------------------

    async def _read_optional(self, tag_path: str | None) -> Any:
        if not tag_path:
            return None
        try:
            return await self._reader.read_tag(tag_path)
        except Exception as exc:
            logger.warning("CIP: cannot read %s: %s", tag_path, exc)
            return None

    async def _fail(
        self,
        area: str,
        spec: PlcCipSpec,
        status: CipRunStatus,
        started_at: datetime,
        ended_at: datetime,
        detail: str,
        *,
        code: Any = None,
        message: str | None = None,
    ) -> CipResult:
        status.state = CIP_FAULTED
        status.failures += 1
        status.started_at = status.started_at or started_at
        status.ended_at = ended_at
        status.fault_code = code
        status.fault_message = message or detail
        status.last_detail = detail
        logger.error("CIP %s failed: %s", area, detail)
        await self._emit(
            area, status, CIP_FAULTED, started_at, ended_at, code=code, message=message or detail
        )
        return CipResult(started_at=started_at, ended_at=ended_at, success=False, detail=detail)

    async def _emit(
        self,
        area: str,
        status: CipRunStatus,
        state: str,
        started_at: datetime | None,
        ended_at: datetime | None,
        *,
        code: Any = None,
        message: str | None = None,
    ) -> None:
        duration = None
        if started_at is not None and ended_at is not None:
            duration = int(max((ended_at - started_at).total_seconds(), 0))
        payload = {
            "state": state,
            "startTime": _iso(started_at),
            "endTime": _iso(ended_at),
            "duration": duration,
            "faultCode": code,
            "faultMessage": message,
        }
        status.last_payload = payload
        if self._on_state is None:
            return
        try:
            maybe = self._on_state(area, payload)
            if asyncio.iscoroutine(maybe):
                await maybe
        except Exception as exc:
            logger.warning("CIP state listener failed for %s: %s", area, exc)
